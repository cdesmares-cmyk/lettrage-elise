// Détection silencieuse batch — 3 requêtes Supabase pour N lignes visibles
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
  tokeniserLibelle,
  normaliserLibelle,
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

        // ── Batch numérique — prépare les tokens avant les requêtes ───────
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

        // ── Batch nom client — extrait les tokens d'ancrage ───────────────
        const tokensNomParLigne = new Map<string, string[]>()
        const tousTokensNom = new Set<string>()
        for (const l of candidats) {
          const toks = tokeniserLibelle(l.libelle).filter(t => t.length >= 4)
          if (toks.length) {
            tokensNomParLigne.set(l.id_operation, toks)
            toks.forEach(t => tousTokensNom.add(t))
          }
        }

        // ── 3 requêtes en parallèle ───────────────────────────────────────
        const [fSepaRows, fNoms, fNums] = await Promise.all([
          codeClients.length
            ? supabase
                .from('v_factures_avec_reste_du')
                .select(COLS)
                .in('code_client', [...new Set(codeClients)])
                .gt('reste_du', TOLERANCE_CENT)
                .eq('est_avoir', false)
                .order('date_echeance', { ascending: true })
            : Promise.resolve({ data: [] }),
          tousTokensNom.size
            ? supabase
                .from('v_factures_avec_reste_du')
                .select(COLS)
                .or([...tousTokensNom].slice(0, 40).map(t => `nom_client.ilike.%${t}%`).join(','))
                .gt('reste_du', TOLERANCE_CENT)
                .eq('est_avoir', false)
                .order('date_echeance', { ascending: true })
            : Promise.resolve({ data: [] }),
          tousNumerosSet.size
            ? supabase
                .from('v_factures_avec_reste_du')
                .select(COLS)
                .or([...tousNumerosSet].slice(0, 50).map(n => `numero_piece.ilike.%${n}%`).join(','))
                .gt('reste_du', TOLERANCE_CENT)
                .eq('est_avoir', false)
            : Promise.resolve({ data: [] }),
        ])

        // ── Construire les maps de résultats ──────────────────────────────
        const facturesParClientSepa = new Map<string, FactureNavigateur[]>()
        for (const f of (fSepaRows.data ?? []) as FactureNavigateur[]) {
          const list = facturesParClientSepa.get(f.code_client) ?? []
          list.push(f)
          facturesParClientSepa.set(f.code_client, list)
        }

        const facturesParClientNom = new Map<string, FactureNavigateur[]>()
        for (const f of (fNoms.data ?? []) as FactureNavigateur[]) {
          const list = facturesParClientNom.get(f.code_client) ?? []
          list.push(f)
          facturesParClientNom.set(f.code_client, list)
        }

        const facturesParNumero = new Map<string, FactureNavigateur>()
        for (const f of (fNums.data ?? []) as FactureNavigateur[]) {
          facturesParNumero.set(f.numero_piece, f)
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
          const codeClientSepa = sepaMap.get(ligne.libelle)
          if (codeClientSepa) {
            const factures = facturesParClientSepa.get(codeClientSepa) ?? []
            if (factures.length) {
              const d = trouverDistribution(factures, cible)
              if (d?.confiance === 3) { detected.add(ligne.id_operation); continue }
            }
          }

          // Priorité 3 : nom client détecté dans le libellé
          const toks = tokensNomParLigne.get(ligne.id_operation) ?? []
          if (toks.length) {
            const seuil = toks.length === 1 ? 1 : 2
            for (const [, factures] of facturesParClientNom) {
              const nomNorm = normaliserLibelle(factures[0]?.nom_client ?? '')
              const score = toks.filter(t => nomNorm.includes(t)).length
              if (score >= seuil) {
                const d = trouverDistribution(factures, cible)
                if (d?.confiance === 3) { detected.add(ligne.id_operation); break }
              }
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
