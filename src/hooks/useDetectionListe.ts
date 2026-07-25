// Détection silencieuse batch — 2 requêtes Supabase pour N lignes visibles
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { TOLERANCE_CENT } from '../lib/constantes'
import type { LigneBancaireAvecStatut } from '../types/lettrage'
import type { FactureNavigateur } from './useNavigateurFactures'
import {
  trouverDistribution,
  exempleVersRegex,
  fallbackNumerique,
  extraireNumerosTexte,
} from './useNavigateurFactures'

const COLS = 'numero_piece, code_client, nom_client, montant_ttc, reste_du, date_echeance'

export function useDetectionListe(lignes: LigneBancaireAvecStatut[]) {
  const [detections, setDetections] = useState<Set<string>>(new Set())
  const [chargement, setChargement] = useState(false)
  const formatsRef = useRef<string[]>([])

  useEffect(() => {
    supabase
      .from('ref_valeurs')
      .select('valeur')
      .eq('categorie', 'format_facture')
      .eq('actif', true)
      .then(({ data }) => {
        formatsRef.current = (data as { valeur: string }[] ?? []).map(r => r.valeur)
      })
  }, [])

  const lignesKey = lignes.map(l => `${l.id_operation}:${l.restant}`).join(',')

  useEffect(() => {
    const candidats = lignes.filter(
      l => l.statut_lettrage === 'non_lettre' || l.statut_lettrage === 'partiel'
    )
    if (!candidats.length) { setDetections(new Set()); return }

    let annule = false

    async function detecter() {
      setChargement(true)
      try {
        // ── Batch SEPA (match exact) ──────────────────────────────────────
        const libelles = [...new Set(candidats.map(l => l.libelle))]
        const { data: sepaRows } = await supabase
          .from('libelles_sepa')
          .select('libelle, code_client, nb_utilisations')
          .in('libelle', libelles)

        const sepaMap = new Map<string, string>()
        const codeClients: string[] = []
        for (const row of (sepaRows ?? []) as { libelle: string; code_client: string; nb_utilisations: number }[]) {
          sepaMap.set(row.libelle, row.code_client)
          codeClients.push(row.code_client)
        }

        const facturesParClient = new Map<string, FactureNavigateur[]>()
        if (codeClients.length) {
          const { data: fRows } = await supabase
            .from('v_factures_avec_reste_du')
            .select(COLS)
            .in('code_client', [...new Set(codeClients)])
            .gt('reste_du', TOLERANCE_CENT)
            .eq('est_avoir', false)
            .order('date_echeance', { ascending: true })
          for (const f of (fRows ?? []) as FactureNavigateur[]) {
            const list = facturesParClient.get(f.code_client) ?? []
            list.push(f)
            facturesParClient.set(f.code_client, list)
          }
        }

        // ── Batch numérique ────────────────────────────────────────────────
        const formats = formatsRef.current
        const patterns = formats.map(exempleVersRegex).filter((r): r is RegExp => r !== null)
        const fallback = fallbackNumerique(formats)
        const allPatterns = fallback ? [...patterns, fallback] : patterns

        const numerosParLigne = new Map<string, string[]>()
        const tousNumerosSet = new Set<string>()
        if (allPatterns.length) {
          for (const l of candidats) {
            const nums = extraireNumerosTexte(l.libelle, l.detail, l.infos_complementaires, allPatterns)
            if (nums.length) {
              numerosParLigne.set(l.id_operation, nums)
              nums.forEach(n => tousNumerosSet.add(n))
            }
          }
        }

        const facturesParNumero = new Map<string, FactureNavigateur>()
        if (tousNumerosSet.size) {
          const numArr = [...tousNumerosSet].slice(0, 50)
          const { data: fNums } = await supabase
            .from('v_factures_avec_reste_du')
            .select(COLS)
            .or(numArr.map(n => `numero_piece.ilike.%${n}%`).join(','))
            .gt('reste_du', TOLERANCE_CENT)
            .eq('est_avoir', false)
          for (const f of (fNums ?? []) as FactureNavigateur[]) {
            facturesParNumero.set(f.numero_piece, f)
          }
        }

        if (annule) return

        // ── Match par ligne ───────────────────────────────────────────────
        const detected = new Set<string>()
        for (const ligne of candidats) {
          const cible = ligne.restant
          if (cible < 0.01) continue

          // Priorité 1 : numéro détecté dans le libellé
          const nums = numerosParLigne.get(ligne.id_operation)
          if (nums?.length) {
            const facturesDeLigne: FactureNavigateur[] = []
            for (const [numPiece, facture] of facturesParNumero) {
              if (nums.some(n => numPiece.toLowerCase().includes(n.toLowerCase()))) {
                facturesDeLigne.push(facture)
              }
            }
            if (facturesDeLigne.length) {
              const d = trouverDistribution(facturesDeLigne, cible)
              if (d?.confiance === 3) { detected.add(ligne.id_operation); continue }
            }
          }

          // Priorité 2 : client reconnu via SEPA exact
          const codeClient = sepaMap.get(ligne.libelle)
          if (codeClient) {
            const factures = facturesParClient.get(codeClient) ?? []
            if (factures.length) {
              const d = trouverDistribution(factures, cible)
              if (d?.confiance === 3) detected.add(ligne.id_operation)
            }
          }
        }

        setDetections(detected)
      } catch {
        // silencieux — la liste s'affiche sans icônes en cas d'erreur
      } finally {
        if (!annule) setChargement(false)
      }
    }

    detecter()
    return () => { annule = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignesKey])

  return { detections, chargement }
}
