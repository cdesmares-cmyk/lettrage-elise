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
  detecterAutoSilencieux,
  detecterDoublePaiementSilencieux,
} from './useNavigateurFactures'

const COLS = 'numero_piece, code_client, nom_client, montant_ttc, reste_du, date_echeance'

export interface DistribAuto {
  factures: FactureNavigateur[]
  ligne: LigneBancaireAvecStatut
}

export function useDetectionListe(lignes: LigneBancaireAvecStatut[]) {
  const [detections, setDetections] = useState<Set<string>>(new Set())
  const [distributionsAuto, setDistributionsAuto] = useState<Map<string, DistribAuto>>(new Map())
  const [detectionsApprox, setDetectionsApprox] = useState<Set<string>>(new Set())
  const [detectionDoublePaiement, setDetectionDoublePaiement] = useState<Set<string>>(new Set())
  const [chargement, setChargement] = useState(false)
  const formatsRef = useRef<string[]>([])

  function ajouterDetection(id: string) {
    setDetections(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

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
    if (!candidats.length) { setDetections(new Set()); setDistributionsAuto(new Map()); setDetectionsApprox(new Set()); setDetectionDoublePaiement(new Set()); return }

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
                .or(`reste_du.gt.${TOLERANCE_CENT},reste_du.lt.${-TOLERANCE_CENT}`)
                .limit(500)
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
                .or(`reste_du.gt.${TOLERANCE_CENT},reste_du.lt.${-TOLERANCE_CENT}`)
                .order('date_echeance', { ascending: true })
                .limit(500)
            : Promise.resolve({ data: [] }),
          tousNumeros.size
            ? supabase
                .from('v_factures_avec_reste_du')
                .select(COLS)
                .or([...tousNumeros].slice(0, 50).map(n => `numero_piece.ilike.%${n}%`).join(','))
                .or(`reste_du.gt.${TOLERANCE_CENT},reste_du.lt.${-TOLERANCE_CENT}`)
                .limit(200)
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
        const distribMap = new Map<string, DistribAuto>()
        const detectedApprox = new Set<string>()
        for (const ligne of candidats) {
          const cible = ligne.restant
          if (cible < 0.01) continue

          let resolue = false
          let approx = false

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
              if (d?.confiance === 3) {
                detected.add(ligne.id_operation)
                distribMap.set(ligne.id_operation, { factures: d.factures, ligne })
                resolue = true
              } else if (d?.confiance === 2) {
                approx = true
              }
            }
          }

          if (!resolue) {
            // Priorité 2 : client reconnu via SEPA exact
            const sepaCode = sepaMap.get(ligne.libelle)
            if (sepaCode) {
              const factures = facturesParCodeClient.get(sepaCode) ?? []
              if (factures.length) {
                const d = trouverDistribution(factures, cible)
                if (d?.confiance === 3) {
                  detected.add(ligne.id_operation)
                  distribMap.set(ligne.id_operation, { factures: d.factures, ligne })
                  resolue = true
                } else if (d?.confiance === 2) {
                  approx = true
                }
              }
            }
          }

          if (!resolue) {
            // Priorité 3 : nom client détecté (qualification progressive + Jaccard + poids)
            const nomCode = winnerNomParLigne.get(ligne.id_operation)
            if (nomCode) {
              const factures = facturesParCodeClient.get(nomCode) ?? []
              if (factures.length) {
                const d = trouverDistribution(factures, cible)
                if (d?.confiance === 3) {
                  detected.add(ligne.id_operation)
                  distribMap.set(ligne.id_operation, { factures: d.factures, ligne })
                  resolue = true
                } else if (d?.confiance === 2) {
                  approx = true
                }
              }
            }
          }

          if (!resolue && approx) detectedApprox.add(ligne.id_operation)
        }

        setDetections(detected)
        setDistributionsAuto(distribMap)
        setDetectionsApprox(detectedApprox)

        // ── Passe 2 : lots séquentiels — couverture maximale sans surcharge Supabase ──
        const nonResolus = candidats.filter(l => !detected.has(l.id_operation) && l.restant >= 0.01)
        const BATCH = 20
        const MAX_BATCHES = 10
        const PAUSE_MS = 150
        const nbBatches = Math.min(Math.ceil(nonResolus.length / BATCH), MAX_BATCHES)
        for (let b = 0; b < nbBatches; b++) {
          if (annule) break
          const lot = nonResolus.slice(b * BATCH, (b + 1) * BATCH)
          const resultats = await Promise.all(
            lot.map(l => detecterAutoSilencieux(l, formats).then(r => ({ id: l.id_operation, ligne: l, r })))
          )
          if (annule) break
          const detected2 = new Set<string>()
          const distribMap2 = new Map<string, DistribAuto>()
          for (const { id, ligne, r } of resultats) {
            if (r) { detected2.add(id); distribMap2.set(id, { factures: r.factures, ligne }) }
          }
          if (detected2.size > 0) {
            setDetections(prev => new Set([...prev, ...detected2]))
            setDistributionsAuto(prev => new Map([...prev, ...distribMap2]))
          }
          if (b < nbBatches - 1) await new Promise(res => setTimeout(res, PAUSE_MS))
        }

        // ── Passe 3 : double paiement — uniquement sur les encore non résolus ──
        if (!annule) {
          const encoreNonResolus = candidats.filter(
            l => !detected.has(l.id_operation) && l.restant >= 0.01
          )
          const BATCH_DP = 10
          const MAX_BATCHES_DP = 5
          const nbBatchesDP = Math.min(Math.ceil(encoreNonResolus.length / BATCH_DP), MAX_BATCHES_DP)
          for (let b = 0; b < nbBatchesDP; b++) {
            if (annule) break
            const lot = encoreNonResolus.slice(b * BATCH_DP, (b + 1) * BATCH_DP)
            const resultats = await Promise.all(
              lot.map(l => detecterDoublePaiementSilencieux(l, formats).then(dp => ({ id: l.id_operation, dp })))
            )
            if (annule) break
            const dp2 = new Set(resultats.filter(r => r.dp).map(r => r.id))
            if (dp2.size > 0) setDetectionDoublePaiement(prev => new Set([...prev, ...dp2]))
            if (b < nbBatchesDP - 1) await new Promise(res => setTimeout(res, PAUSE_MS))
          }
        }
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

  return { detections, distributionsAuto, detectionsApprox, detectionDoublePaiement, chargement, ajouterDetection }
}
