// Logique de recherche et suggestions intelligentes pour le navigateur de factures
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { TOLERANCE_CENT } from '../lib/constantes'
import type { LigneBancaireAvecStatut } from '../types/lettrage'

export interface FactureNavigateur {
  numero_piece: string
  code_client: string
  nom_client: string | null
  montant_ttc: number
  reste_du: number
  date_echeance: string | null
}

export type SourceSuggestion = 'numero_detecte' | 'client_reconnu' | 'historique'

export interface SuggestionNavigateur {
  facture: FactureNavigateur
  source: SourceSuggestion
  confiance: 1 | 2 | 3
}

const COLS = 'numero_piece, code_client, nom_client, montant_ttc, reste_du, date_echeance'

// Convertit un exemple de numéro de facture en RegExp.
// Chaque séquence de chiffres est remplacée par \d{N} (longueur exacte).
// Les caractères non-chiffres sont échappés comme littéraux.
// Ex: "FAC-2026-001234" → /FAC\-\d{4}\-\d{6}/gi
function exempleVersRegex(exemple: string): RegExp | null {
  const trimmed = exemple.trim()
  if (!trimmed) return null
  const segments = trimmed.match(/(\d+)|([^\d]+)/g) ?? []
  const pattern = segments.map(seg =>
    /^\d+$/.test(seg)
      ? `\\d{${seg.length}}`
      : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('')
  try { return new RegExp(pattern, 'gi') } catch { return null }
}

// Applique les patterns sur libellé + detail + infos_complementaires.
// Retourne tous les matches distincts (multi-numéros dans la même ligne).
function extraireNumerosTexte(
  libelle: string | null,
  detail: string | null,
  infosComp: string | null,
  patterns: RegExp[],
): string[] {
  const texte = [libelle, detail, infosComp].filter(Boolean).join(' ')
  if (!texte || !patterns.length) return []
  const resultats = new Set<string>()
  for (const re of patterns) {
    const matches = texte.matchAll(new RegExp(re.source, re.flags))
    for (const m of matches) resultats.add(m[0])
  }
  return [...resultats]
}

async function fetchParNums(nums: string[]): Promise<FactureNavigateur[]> {
  if (!nums.length) return []
  try {
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select(COLS)
      .or(nums.map(n => `numero_piece.ilike.%${n}%`).join(','))
      .gt('reste_du', TOLERANCE_CENT)
      .eq('est_avoir', false)
      .limit(10)
    return (data as FactureNavigateur[]) ?? []
  } catch { return [] }
}

async function fetchSepaMatch(libelle: string): Promise<{ factures: FactureNavigateur[]; nbUtil: number } | null> {
  try {
    const { data: sepa } = await supabase
      .from('libelles_sepa')
      .select('code_client, nb_utilisations')
      .eq('libelle', libelle)
      .maybeSingle()
    if (!sepa) return null
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select(COLS)
      .eq('code_client', (sepa as { code_client: string; nb_utilisations: number }).code_client)
      .gt('reste_du', TOLERANCE_CENT)
      .eq('est_avoir', false)
      .order('date_echeance', { ascending: true })
      .limit(10)
    return {
      factures: (data as FactureNavigateur[]) ?? [],
      nbUtil: (sepa as { code_client: string; nb_utilisations: number }).nb_utilisations,
    }
  } catch { return null }
}

async function fetchHistorique(ligne: LigneBancaireAvecStatut): Promise<FactureNavigateur[]> {
  try {
    const { data: lignesPareilRaw } = await supabase
      .from('lignes_bancaires')
      .select('id_operation')
      .eq('libelle', ligne.libelle)
      .neq('id_operation', ligne.id_operation)
      .limit(20)
    const lignesPareil = (lignesPareilRaw as { id_operation: string }[] | null)
    if (!lignesPareil?.length) return []

    const { data: lettragesRaw } = await supabase
      .from('lettrages')
      .select('numero_facture')
      .in('id_ligne_bancaire', lignesPareil.map(l => l.id_operation))
      .not('numero_facture', 'is', null)
      .eq('annule', false)
      .limit(15)
    const lettrages = lettragesRaw as unknown as { numero_facture: string }[] | null
    if (!lettrages?.length) return []

    const numsFact = [...new Set(lettrages.map(l => l.numero_facture).filter(Boolean))]
    if (!numsFact.length) return []

    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select(COLS)
      .in('numero_piece', numsFact)
      .gt('reste_du', TOLERANCE_CENT)
      .eq('est_avoir', false)
    return (data as FactureNavigateur[]) ?? []
  } catch { return [] }
}

export function useNavigateurFactures(
  ligneActive: LigneBancaireAvecStatut | null,
  ouvert: boolean,
) {
  const [query, setQueryRaw] = useState('')
  const [resultats, setResultats] = useState<FactureNavigateur[]>([])
  const [suggestions, setSuggestions] = useState<SuggestionNavigateur[]>([])
  const [chargement, setChargement] = useState(false)
  const [chargementSugg, setChargementSugg] = useState(false)
  const [selection, setSelection] = useState<Map<string, FactureNavigateur>>(new Map())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formatsRef = useRef<string[]>([])

  // Charge les formats de numéros de facture configurés par l'admin (une seule fois)
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

  useEffect(() => {
    if (!ouvert) {
      setQueryRaw('')
      setResultats([])
      setSuggestions([])
      setSelection(new Map())
      return
    }
    if (ligneActive) computeSuggestions(ligneActive)
  }, [ouvert, ligneActive?.id_operation])

  async function computeSuggestions(ligne: LigneBancaireAvecStatut) {
    setChargementSugg(true)
    try {
      const patterns = formatsRef.current
        .map(exempleVersRegex)
        .filter((r): r is RegExp => r !== null)

      const numerosDetectes = extraireNumerosTexte(
        ligne.libelle, ligne.detail, ligne.infos_complementaires, patterns
      )

      const [facturesNum, sepaMatch, facturesHisto] = await Promise.all([
        fetchParNums(numerosDetectes),
        fetchSepaMatch(ligne.libelle),
        fetchHistorique(ligne),
      ])

      const found = new Map<string, SuggestionNavigateur>()

      // Priorité croissante : historique < client_reconnu < numero_detecte
      facturesHisto.forEach(f =>
        found.set(f.numero_piece, { facture: f, source: 'historique', confiance: 1 })
      )
      if (sepaMatch) {
        const conf: 1 | 2 | 3 = sepaMatch.nbUtil >= 3 ? 3 : sepaMatch.nbUtil >= 2 ? 2 : 1
        sepaMatch.factures.forEach(f =>
          found.set(f.numero_piece, { facture: f, source: 'client_reconnu', confiance: conf })
        )
      }
      facturesNum.forEach(f =>
        found.set(f.numero_piece, { facture: f, source: 'numero_detecte', confiance: 3 })
      )

      setSuggestions([...found.values()])
    } finally {
      setChargementSugg(false)
    }
  }

  function setQuery(q: string) {
    setQueryRaw(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) {
      setResultats([])
      setChargement(false)
      return
    }
    setChargement(true)
    debounceRef.current = setTimeout(() => rechercherFactures(q), 300)
  }

  async function rechercherFactures(q: string) {
    try {
      const { data } = await supabase
        .from('v_factures_avec_reste_du')
        .select(COLS)
        .or(`numero_piece.ilike.%${q}%,code_client.ilike.%${q}%,nom_client.ilike.%${q}%`)
        .gt('reste_du', TOLERANCE_CENT)
        .eq('est_avoir', false)
        .order('date_echeance', { ascending: true })
        .limit(50)
      setResultats((data as FactureNavigateur[]) ?? [])
    } catch {
      setResultats([])
    } finally {
      setChargement(false)
    }
  }

  function toggleSelection(facture: FactureNavigateur) {
    setSelection(prev => {
      const next = new Map(prev)
      if (next.has(facture.numero_piece)) {
        next.delete(facture.numero_piece)
      } else {
        next.set(facture.numero_piece, facture)
      }
      return next
    })
  }

  function reset() {
    setQueryRaw('')
    setResultats([])
    setSuggestions([])
    setSelection(new Map())
  }

  const selectionArray = [...selection.values()]
  const totalSelection = selectionArray.reduce((s, f) => s + f.reste_du, 0)

  return {
    query, setQuery,
    resultats, suggestions,
    chargement, chargementSugg,
    selection, toggleSelection, reset,
    selectionArray, totalSelection,
  }
}
