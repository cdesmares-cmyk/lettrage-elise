// Chargement des lignes bancaires avec statut de lettrage calculé
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { TOLERANCE_CENT } from '../lib/constantes'
import type { LigneBancaireAvecStatut, StatutLettrage } from '../types/lettrage'

interface RowLigne {
  id_operation: string; date_operation: string; libelle: string
  detail: string | null; infos_complementaires: string | null
  debit: number | null; credit: number | null
  montant_lettre: number; restant: number
  statut_lettrage: string; derniere_date_lettrage: string | null
  en_attente_471: boolean; est_virement_471: boolean
}

interface RowTotaux { statut_lettrage: string; restant: number }

export type FiltreStatut = 'toutes' | 'a_lettrer' | 'partiel' | 'lettre' | 'compte' | 'autres_virements'

export const PAGE_SIZE = 50

export function useLignesBancaires() {
  const [lignes, setLignes] = useState<LigneBancaireAvecStatut[]>([])
  const [nbNonLettres, setNbNonLettres] = useState(0)
  const [montantRestant, setMontantRestant] = useState(0)
  const [totalLignes, setTotalLignes] = useState(0)
  const [nbLignesGlobal, setNbLignesGlobal] = useState(0)
  const [nbEnAttente471, setNbEnAttente471] = useState(0)
  const [chargement, setChargement] = useState(true)
  const [recherche, setRechercheUI] = useState('')
  const [filtre, setFiltre] = useState<FiltreStatut>('a_lettrer')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [page, setPage] = useState(0)
  const [version, setVersion] = useState(0)
  const silentRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const rechercheRef = useRef(recherche)
  rechercheRef.current = recherche

  function setRecherche(v: string) {
    setRechercheUI(v)
    setPage(0)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setVersion((n: number) => n + 1), 350)
  }

  useEffect(() => {
    let annule = false

    async function charger() {
      if (!silentRef.current) setChargement(true)
      silentRef.current = false

      const term = rechercheRef.current.trim()
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      // Requête principale paginée
      let q = supabase
        .from('v_lignes_bancaires_avec_statut')
        .select('*')
        .order('date_operation', { ascending: false })
        .range(from, to)

      if (filtre === 'toutes') { /* pas de filtre statut */ }
      else if (filtre === 'a_lettrer') q = q.or('statut_lettrage.eq.non_lettre,statut_lettrage.eq.partiel')
      else if (filtre === 'compte') q = q.eq('statut_lettrage', 'en_attente_471')
      else if (filtre === 'autres_virements') q = q.eq('est_virement_471', true)
      else q = q.eq('statut_lettrage', filtre)
      if (dateDebut) q = q.gte('date_operation', dateDebut)
      if (dateFin)   q = q.lte('date_operation', dateFin)
      if (term) {
        const numericTerm = parseFloat(term.replace(/\s/g, '').replace(',', '.'))
        const textFilters = `libelle.ilike.%${term}%,detail.ilike.%${term}%,infos_complementaires.ilike.%${term}%`
        q = !isNaN(numericTerm) && numericTerm > 0
          ? q.or(`${textFilters},debit.eq.${numericTerm},credit.eq.${numericTerm}`)
          : q.or(textFilters)
      }

      // Requête count (même filtres, sans pagination)
      let qCount = supabase
        .from('v_lignes_bancaires_avec_statut')
        .select('id_operation', { count: 'exact', head: true })

      if (filtre === 'toutes') { /* pas de filtre statut */ }
      else if (filtre === 'a_lettrer') qCount = qCount.or('statut_lettrage.eq.non_lettre,statut_lettrage.eq.partiel')
      else if (filtre === 'compte') qCount = qCount.eq('statut_lettrage', 'en_attente_471')
      else if (filtre === 'autres_virements') qCount = qCount.eq('est_virement_471', true)
      else qCount = qCount.eq('statut_lettrage', filtre)
      if (dateDebut) qCount = qCount.gte('date_operation', dateDebut)
      if (dateFin)   qCount = qCount.lte('date_operation', dateFin)
      if (term) {
        const numericTerm = parseFloat(term.replace(/\s/g, '').replace(',', '.'))
        const textFilters = `libelle.ilike.%${term}%,detail.ilike.%${term}%,infos_complementaires.ilike.%${term}%`
        qCount = !isNaN(numericTerm) && numericTerm > 0
          ? qCount.or(`${textFilters},debit.eq.${numericTerm},credit.eq.${numericTerm}`)
          : qCount.or(textFilters)
      }

      // Requête KPI globale (sans filtre statut ni limite)
      let qTotaux = supabase
        .from('v_lignes_bancaires_avec_statut')
        .select('statut_lettrage, restant')
      if (dateDebut) qTotaux = qTotaux.gte('date_operation', dateDebut)
      if (dateFin)   qTotaux = qTotaux.lte('date_operation', dateFin)

      const [{ data }, { count }, { data: dataTotaux }] = await Promise.all([q, qCount, qTotaux])
      if (annule) return

      const rows = (data as unknown as RowLigne[]) ?? []
      setLignes(rows.map(r => ({ ...r, statut_lettrage: r.statut_lettrage as StatutLettrage, en_attente_471: r.en_attente_471 ?? false, est_virement_471: r.est_virement_471 ?? false })))
      setTotalLignes(count ?? 0)

      const totaux = (dataTotaux as unknown as RowTotaux[]) ?? []
      const nonDebits = totaux.filter(r => r.statut_lettrage !== 'debit')
      setNbLignesGlobal(nonDebits.length)
      setNbEnAttente471(nonDebits.filter(r => r.statut_lettrage === 'en_attente_471').length)
      const nonDebitsActifs = nonDebits.filter(r => r.statut_lettrage !== 'en_attente_471')
      setNbNonLettres(nonDebitsActifs.filter(r => r.statut_lettrage === 'non_lettre' || r.statut_lettrage === 'partiel').length)
      setMontantRestant(nonDebitsActifs.reduce((s, r) => s + Math.max(0, r.restant), 0))

      setChargement(false)
    }

    charger()
    return () => { annule = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre, dateDebut, dateFin, page, version])

  function setFiltreEtReset(v: FiltreStatut) { setPage(0); setFiltre(v) }
  function setDateDebutEtReset(v: string)    { setPage(0); setDateDebut(v) }
  function setDateFinEtReset(v: string)      { setPage(0); setDateFin(v) }

  function rafraichir() { setVersion(v => v + 1) }
  function rafraichirSilencieux() { silentRef.current = true; setVersion(v => v + 1) }

  function mettreAJourLigneBancaireLocale(idOperation: string, montantLettre: number) {
    setLignes(prev => {
      const updated = prev.map(l => {
        if (l.id_operation !== idOperation) return l
        const newMontantLettre = Math.round((l.montant_lettre + montantLettre) * 100) / 100
        const credit = l.credit ?? 0
        const newRestant = Math.max(0, Math.round((credit - newMontantLettre) * 100) / 100)
        const newStatut: StatutLettrage = newRestant <= TOLERANCE_CENT ? 'lettre'
          : newMontantLettre > TOLERANCE_CENT ? 'partiel' : 'non_lettre'
        return { ...l, montant_lettre: newMontantLettre, restant: newRestant, statut_lettrage: newStatut }
      })
      if (filtre !== 'lettre') {
        return updated.filter(l => l.statut_lettrage !== 'lettre')
      }
      return updated
    })
    setMontantRestant(prev => Math.max(0, Math.round((prev - montantLettre) * 100) / 100))
  }

  const totalPages = Math.max(1, Math.ceil(totalLignes / PAGE_SIZE))

  return {
    lignes, chargement, recherche, setRecherche,
    filtre, setFiltre: setFiltreEtReset,
    dateDebut, setDateDebut: setDateDebutEtReset,
    dateFin, setDateFin: setDateFinEtReset,
    page, setPage, totalPages, totalLignes,
    rafraichir, rafraichirSilencieux, mettreAJourLigneBancaireLocale,
    nbNonLettres, montantRestant, nbLignesGlobal, nbEnAttente471,
  }
}
