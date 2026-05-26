import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export interface LigneHistorique {
  id: string
  created_at: string
  date_lettrage: string
  id_ligne_bancaire: string | null
  libelle_bancaire: string | null
  code_client: string
  numero_facture: string | null
  montant: number
  mode: string
  commentaire: string | null
  operateur: string | null
}

export const HISTORIQUE_PAGE_SIZE = 50

function mapRow(r: Record<string, unknown>): LigneHistorique {
  return {
    id: r.id as string,
    created_at: r.created_at as string,
    date_lettrage: r.date_lettrage as string,
    id_ligne_bancaire: r.id_ligne_bancaire as string | null,
    libelle_bancaire: (r.lignes_bancaires as { libelle: string } | null)?.libelle ?? null,
    code_client: r.code_client as string,
    numero_facture: r.numero_facture as string | null,
    montant: r.montant as number,
    mode: r.mode as string,
    commentaire: r.commentaire as string | null,
    operateur: r.operateur as string | null,
  }
}

const SELECT = 'id, created_at, date_lettrage, id_ligne_bancaire, code_client, numero_facture, montant, mode, commentaire, operateur, lignes_bancaires(libelle)'

export function useHistoriqueLettrage() {
  const [lignes, setLignes] = useState<LigneHistorique[]>([])
  const [lignesServeur, setLignesServeur] = useState<LigneHistorique[]>([])
  const [chargement, setChargement] = useState(false)
  const [chargementServeur, setChargementServeur] = useState(false)
  const [visible, setVisible] = useState(false)
  const [recherche, setRechercheState] = useState('')
  const [page, setPage] = useState(1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lignesRef = useRef<LigneHistorique[]>([])

  const charger = useCallback(async () => {
    setChargement(true)
    const { data, error } = await supabase
      .from('lettrages')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .limit(200)
    if (!error && data) {
      const rows = data.map(r => mapRow(r as Record<string, unknown>))
      setLignes(rows)
      lignesRef.current = rows
    }
    setChargement(false)
  }, [])

  const rechercherServeur = useCallback(async (terme: string) => {
    if (terme.length < 2) { setLignesServeur([]); return }
    setChargementServeur(true)
    const { data, error } = await supabase
      .from('lettrages')
      .select(SELECT)
      .or(`code_client.ilike.%${terme}%,numero_facture.ilike.%${terme}%`)
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error && data) {
      const localIds = new Set(lignesRef.current.map(l => l.id))
      setLignesServeur(
        data.map(r => mapRow(r as Record<string, unknown>)).filter(r => !localIds.has(r.id))
      )
    }
    setChargementServeur(false)
  }, [])

  function setRecherche(terme: string) {
    setRechercheState(terme)
    setPage(1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // Pas de requête serveur si terme trop court ou vide
    if (terme.length < 2) { setLignesServeur([]); return }
    debounceRef.current = setTimeout(() => rechercherServeur(terme), 400)
  }

  function toggle() {
    if (!visible) {
      charger()
      setRechercheState('')
      setPage(1)
      setLignesServeur([])
    }
    setVisible(v => !v)
  }

  return {
    lignes, lignesServeur,
    chargement, chargementServeur,
    visible, toggle, charger,
    recherche, setRecherche,
    page, setPage,
  }
}
