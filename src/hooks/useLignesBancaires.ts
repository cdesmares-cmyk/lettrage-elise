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

interface RowTotaux { statut_lettrage: string; restant: number }

export type FiltreStatut = 'toutes' | 'non_lettre' | 'partiel' | 'lettre'

export function useLignesBancaires() {
  const [lignes, setLignes] = useState<LigneBancaireAvecStatut[]>([])
  const [nbNonLettres, setNbNonLettres] = useState(0)
  const [montantRestant, setMontantRestant] = useState(0)
  const [chargement, setChargement] = useState(true)
  const [recherche, setRechercheUI] = useState('')
  const [filtre, setFiltre] = useState<FiltreStatut>('toutes')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [version, setVersion] = useState(0)
  const silentRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function setRecherche(v: string) {
    setRechercheUI(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setVersion((n: number) => n + 1), 350)
  }

  useEffect(() => {
    let annule = false

    async function charger() {
      if (!silentRef.current) setChargement(true)
      silentRef.current = false

      // Requête d'affichage : limitée à 300 lignes (table paginée)
      let q = supabase
        .from('v_lignes_bancaires_avec_statut')
        .select('*')
        .order('date_operation', { ascending: false })
        .limit(300)

      if (filtre !== 'toutes') q = q.eq('statut_lettrage', filtre)
      if (dateDebut) q = q.gte('date_operation', dateDebut)
      if (dateFin)   q = q.lte('date_operation', dateFin)

      // Requête KPI : toutes les lignes, seulement les colonnes nécessaires
      let qTotaux = supabase
        .from('v_lignes_bancaires_avec_statut')
        .select('statut_lettrage, restant')

      if (dateDebut) qTotaux = qTotaux.gte('date_operation', dateDebut)
      if (dateFin)   qTotaux = qTotaux.lte('date_operation', dateFin)

      const [{ data }, { data: dataTotaux }] = await Promise.all([q, qTotaux])
      if (annule) return

      const rows = data as unknown as RowLigne[] | null
      let result = rows?.map(r => ({
        ...r,
        statut_lettrage: r.statut_lettrage as StatutLettrage,
      })) ?? []

      // Filtre libellé côté client pour éviter un ilike sur chaque frappe
      const term = recherche.trim().toLowerCase()
      if (term) {
        result = result.filter(r =>
          r.libelle.toLowerCase().includes(term) ||
          (r.detail ?? '').toLowerCase().includes(term) ||
          (r.infos_complementaires ?? '').toLowerCase().includes(term)
        )
      }

      setLignes(result)

      // KPIs calculés sur la totalité des lignes (sans limite)
      const totaux = (dataTotaux as unknown as RowTotaux[]) ?? []
      setNbNonLettres(totaux.filter(
        r => r.statut_lettrage === 'non_lettre' || r.statut_lettrage === 'partiel'
      ).length)
      setMontantRestant(totaux
        .filter(r => r.statut_lettrage !== 'debit')
        .reduce((s, r) => s + Math.max(0, r.restant), 0)
      )

      setChargement(false)
    }

    charger()
    return () => { annule = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre, dateDebut, dateFin, version])

  function rafraichir() { setVersion(v => v + 1) }
  // Resync sans spinner — utilisé après les mises à jour optimistes
  function rafraichirSilencieux() { silentRef.current = true; setVersion(v => v + 1) }

  function mettreAJourLigneBancaireLocale(idOperation: string, montantLettre: number) {
    setLignes(prev => prev.map(l => {
      if (l.id_operation !== idOperation) return l
      const newMontantLettre = Math.round((l.montant_lettre + montantLettre) * 100) / 100
      const credit = l.credit ?? 0
      const newRestant = Math.max(0, Math.round((credit - newMontantLettre) * 100) / 100)
      const newStatut: StatutLettrage = newRestant <= 0.005 ? 'lettre'
        : newMontantLettre > 0.005 ? 'partiel' : 'non_lettre'
      return { ...l, montant_lettre: newMontantLettre, restant: newRestant, statut_lettrage: newStatut }
    }))
    setMontantRestant(prev => Math.max(0, Math.round((prev - montantLettre) * 100) / 100))
  }

  return {
    lignes, chargement, recherche, setRecherche,
    filtre, setFiltre,
    dateDebut, setDateDebut,
    dateFin, setDateFin,
    rafraichir, rafraichirSilencieux, mettreAJourLigneBancaireLocale, nbNonLettres, montantRestant,
  }
}
