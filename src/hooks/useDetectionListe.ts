// Détection silencieuse batch — 2 rounds Supabase pour N lignes visibles
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
  extraireTokensClient,
  sélectionnerClient,
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
        // ── Préparer tokens côté client ───────────────────────────────────

        // SEPA : libellés distincts pour match exact
        const libelles = [...new Set(candidats.map(l => l.libelle))]

        // Nom client : ancre = pos-0 token par libellé
        const tokensParLigne = new Map<string, string[]>()
        const tousAncres = new Set<string>()
        for (const l of candidats) {
          const toks = extraireTokensClient(l.libelle)
          if (toks.length) {
            tokensParLigne.set(l.id_operation, toks)
            tousAncres.add(toks[0])
          }
        }

        // Numérique : patterns sur libellé + détail
        const formats = formatsRef.current
        const patterns = formats.map(exempleVersRegex).filter((r): r is RegExp => r !== null)
        const fallback = fallbackNumerique(formats)
        const allPatterns = fallback ? [...patterns, fallback] : patterns

        const numerosParLigne = new Map<string, string[]>()
        const tousNumeros = new Set<string>()
        if (allPatterns.length) {
          for (const l of candidats) {
            const nums = extraireNumerosTexte(l.libelle, l.detail, l.infos_complementaires, allPatterns)
            if (nums.length) {
              numerosParLigne.set(l.id_operation, nums)
              nums.forEach(n => tousNumeros.add(n))
            }
          }
        }

        // ── Round 1 : SEPA + nom découverte (parallel) ───────────────────
        const [sepaRows, nomDiscovery] = await Promise.all([
          supabase
            .from('libelles_sepa')
            .select('libelle, code_client')
            .in('libelle', libelles),
          tousAncres.size
            ? supabase
                .from('v_factures_avec_reste_du')
                .select('code_client, nom_client')
                .or([...tousAncres].slice(0, 40).map(t => `nom_client.ilike.%${t}%`).join(','))
                .gt('reste_du', TOLERANCE_CENT)
                .eq('est_avoir', false)
                .limit(100)
            : Promise.resolve({ data: [] }),
        ])

        // sepaMap : libellé → code_client
        const sepaMap = new Map<string, string>()
        for (const r of (sepaRows.data ?? []) as { libelle: string; code_client: string }[]) {
          sepaMap.set(r.libelle, r.code_client)
        }

        // nomMap global : code_client → nom normalisé (pour sélectionnerClient)
        const nomGlobalMap = new Map<string, string>()
        for (const r of (nomDiscovery.data ?? []) as { code_client: string; nom_client: string | null }[]) {
          if (!nomGlobalMap.has(r.code_client)) nomGlobalMap.set(r.code_client, normaliserLibelle(r.nom_client ?? ''))
        }
        const nomCandidats = [...nomGlobalMap.entries()].map(([code, nom]) => ({ code, nom }))

        // Trouver le code_client gagnant par nom pour chaque ligne
        const winnerNomParLigne = new Map<string, string>()
        for (const [idOp, toks] of tokensParLigne) {
          const w = sélectionnerClient(nomCandidats, toks)
          if (w) winnerNomParLigne.set(idOp, w)
        }

        // Collecter tous les code_clients à résoudre
        const sepaCodeClients = [...new Set(sepaMap.values())]
        const nomCodeClients = [...new Set(winnerNomParLigne.values())]
        const allCodeClients = [...new Set([...sepaCodeClients, ...nomCodeClients])]

        // ── Round 2 : factures + numérique (parallel) ─────────────────────
        const [fRows, fNums] = await Promise.all([
          allCodeClients.length
            ? supabase
                .from('v_factures_avec_reste_du')
                .select(COLS)
                .in('code_client', allCodeClients)
                .gt('reste_du', TOLERANCE_CENT)
                .eq('est_avoir', false)
                .order('date_echeance', { ascending: true })
            : Promise.resolve({ data: [] }),
          tousNumeros.size
            ? supabase
                .from('v_factures_avec_reste_du')
                .select(COLS)
                .or([...tousNumeros].slice(0, 50).map(n => `numero_piece.ilike.%${n}%`).join(','))
                .gt('reste_du', TOLERANCE_CENT)
                .eq('est_avoir', false)
            : Promise.resolve({ data: [] }),
        ])

        const facturesParCodeClient = new Map<string, FactureNavigateur[]>()
        for (const f of (fRows.data ?? []) as FactureNavigateur[]) {
          const list = facturesParCodeClient.get(f.code_client) ?? []
          list.push(f)
          facturesParCodeClient.set(f.code_client, list)
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

          // Priorité 1 : numéro de facture dans le libellé
          const nums = numerosParLigne.get(ligne.id_operation)
          if (nums?.length) {
            const facturesDeLigne: FactureNavigateur[] = []
            for (const [numPiece, facture] of facturesParNumero) {
              if (nums.some(n => numPiece.toLowerCase().includes(n.toLowerCase())))
                facturesDeLigne.push(facture)
            }
            if (facturesDeLigne.length) {
              const d = trouverDistribution(facturesDeLigne, cible)
              if (d?.confiance === 3) { detected.add(ligne.id_operation); continue }
            }
          }

          // Priorité 2 : client reconnu via SEPA exact
          const sepaCode = sepaMap.get(ligne.libelle)
          if (sepaCode) {
            const factures = facturesParCodeClient.get(sepaCode) ?? []
            if (factures.length) {
              const d = trouverDistribution(factures, cible)
              if (d?.confiance === 3) { detected.add(ligne.id_operation); continue }
            }
          }

          // Priorité 3 : nom client détecté (qualification progressive + Jaccard + poids)
          const nomCode = winnerNomParLigne.get(ligne.id_operation)
          if (nomCode) {
            const factures = facturesParCodeClient.get(nomCode) ?? []
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
