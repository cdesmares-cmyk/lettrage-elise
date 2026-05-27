// Logique de recherche et suggestions intelligentes pour le navigateur de factures
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
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

function extraireNumerosDetail(detail: string | null): string[] {
  if (!detail) return []
  return [...new Set(detail.match(/\b\d{7,}\b/g) ?? [])]
}

async function fetchParNums(nums: string[]): Promise<FactureNavigateur[]> {
  if (!nums.length) return []
  const { data } = await supabase
    .from('v_factures_avec_reste_du')
    .select(COLS)
    .or(nums.map(n => `numero_piece.ilike.%${n}%`).join(','))
    .gt('reste_du', 0.005)
    .eq('est_avoir', false)
    .limit(5)
  return (data as FactureNavigateur[]) ?? []
}

async function fetchSepaMatch(libelle: string): Promise<{ factures: FactureNavigateur[]; nbUtil: number } | null> {
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
    .gt('reste_du', 0.005)
    .eq('est_avoir', false)
    .order('date_echeance', { ascending: true })
    .limit(10)
  return {
    factures: (data as FactureNavigateur[]) ?? [],
    nbUtil: (sepa as { code_client: string; nb_utilisations: number }).nb_utilisations,
  }
}

async function fetchHistorique(ligne: LigneBancaireAvecStatut): Promise<FactureNavigateur[]> {
  const { data: lignesPareilRaw } = await supabase
    .from('lignes_bancaires')
    .select('id_operation')
    .eq('libelle', ligne.libelle)
    .neq('id_operation', ligne.id_operation)
    .limit(20)
  const lignesPareil = (lignesPareilRaw as { id_operation: string }[] | null)
  if (!lignesPareil?.length) return []

  const { data: lettrages } = await supabase
    .from('lettrages')
    .select('numero_facture')
    .in('id_ligne_bancaire', lignesPareil.map(l => l.id_operation))
    .not('numero_facture', 'is', null)
    .limit(15)
  if (!lettrages?.length) return []

  const numsFact = [...new Set(
    (lettrages as { numero_facture: string }[]).map(l => l.numero_facture).filter(Boolean)
  )]
  if (!numsFact.length) return []

  const { data } = await supabase
    .from('v_factures_avec_reste_du')
    .select(COLS)
    .in('numero_piece', numsFact)
    .gt('reste_du', 0.005)
    .eq('est_avoir', false)
  return (data as FactureNavigateur[]) ?? []
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
      const detailNums = extraireNumerosDetail(ligne.detail)
      const [facturesNum, sepaMatch, facturesHisto] = await Promise.all([
        fetchParNums(detailNums),
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
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select(COLS)
      .or(`numero_piece.ilike.%${q}%,code_client.ilike.%${q}%,nom_client.ilike.%${q}%`)
      .gt('reste_du', 0.005)
      .eq('est_avoir', false)
      .order('date_echeance', { ascending: true })
      .limit(50)
    setResultats((data as FactureNavigateur[]) ?? [])
    setChargement(false)
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
