// Chargement des lignes bancaires avec statut de lettrage calculé
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { LigneBancaireAvecStatut, StatutLettrage } from '../types/lettrage'

interface RowLigne {
  id_operation: string; date_operation: string; libelle: string
  detail: string | null; infos_complementaires: string | null
  debit: number | null; credit: number | null
  montant_lettre: number; restant: number
  statut_lettrage: string; derniere_date_lettrage: string | null
}

export type FiltreStatut = 'toutes' | 'non_lettre' | 'partiel' | 'lettre'

export function useLignesBancaires() {
  const [lignes, setLignes] = useState<LigneBancaireAvecStatut[]>([])
  const [chargement, setChargement] = useState(true)
  const [recherche, setRechercheUI] = useState('')
  const [filtre, setFiltre] = useState<FiltreStatut>('toutes')
  const [version, setVersion] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function setRecherche(v: string) {
    setRechercheUI(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setVersion((n: number) => n + 1), 350)
  }

  useEffect(() => {
    let annule = false

    async function charger() {
      setChargement(true)
      let q = supabase
        .from('v_lignes_bancaires_avec_statut')
        .select('*')
        .order('date_operation', { ascending: false })
        .limit(300)

      if (filtre !== 'toutes') q = q.eq('statut_lettrage', filtre)

      const { data } = await q
      if (annule) return
      const rows = data as unknown as RowLigne[] | null

      // Filtre libellé côté client pour éviter un ilike sur chaque frappe
      let result = rows?.map(r => ({
        ...r,
        statut_lettrage: r.statut_lettrage as StatutLettrage,
      })) ?? []

      const term = recherche.trim().toLowerCase()
      if (term) {
        result = result.filter(r =>
          r.libelle.toLowerCase().includes(term) ||
          (r.detail ?? '').toLowerCase().includes(term) ||
          (r.infos_complementaires ?? '').toLowerCase().includes(term)
        )
      }

      setLignes(result)
      setChargement(false)
    }

    charger()
    return () => { annule = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre, version])

  function rafraichir() { setVersion(v => v + 1) }

  const nbNonLettres = lignes.filter(
    l => l.statut_lettrage === 'non_lettre' || l.statut_lettrage === 'partiel'
  ).length

  const montantRestant = lignes
    .filter(l => l.statut_lettrage !== 'debit')
    .reduce((s, l) => s + Math.max(0, l.restant), 0)

  return {
    lignes, chargement, recherche, setRecherche,
    filtre, setFiltre, rafraichir,
    nbNonLettres, montantRestant,
  }
}
