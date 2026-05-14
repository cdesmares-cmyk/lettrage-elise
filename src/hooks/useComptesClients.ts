// Données agrégées clients — lit depuis AppDataContext (chargé une fois au démarrage)
import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAppData } from '../contexts/AppDataContext'
import toast from 'react-hot-toast'
import type { CompteClient, GroupeNebuleuse, KpisCompteClient, StatutJuridique } from '../types/client'

export function useComptesClients() {
  const { clients: raw, facturesActives, chargement, rafraichir } = useAppData()
  const [recherche, setRecherche] = useState('')
  const [ca12Mois, setCa12Mois] = useState(0)

  // moisMax = mois de la facture la plus récente dans facturesActives
  const moisMax = useMemo(
    () => facturesActives
      .filter(f => !f.est_avoir)
      .reduce((mx, f) => { const m = f.date_emission?.slice(0, 7) ?? ''; return m > mx ? m : mx }, ''),
    [facturesActives]
  )

  // CA 12 mois calé sur moisMax (même fenêtre que le tableau de bord)
  useEffect(() => {
    if (!moisMax) return
    const moisMaxDate = new Date(moisMax + '-01')
    const il12Mois = new Date(moisMaxDate.getFullYear(), moisMaxDate.getMonth() - 11, 1)
    const moisMaxEnd = new Date(moisMaxDate.getFullYear(), moisMaxDate.getMonth() + 1, 0)
    supabase.from('factures').select('montant_ttc')
      .gte('date_emission', il12Mois.toISOString().slice(0, 10))
      .lte('date_emission', moisMaxEnd.toISOString().slice(0, 10))
      .eq('est_avoir', false).limit(10000)
      .then(({ data }) => {
        if (data) setCa12Mois((data as { montant_ttc: number | null }[]).reduce((s, r) => s + (r.montant_ttc ?? 0), 0))
      })
  }, [moisMax])

  const clients = useMemo((): CompteClient[] => {
    if (!recherche.trim()) return raw
    const q = recherche.toLowerCase()
    // Recherche par numéro de facture — retrouve les clients concernés
    const codesAvecFacture = new Set(
      facturesActives
        .filter(f => f.numero_piece.toLowerCase().includes(q))
        .map(f => f.code_client)
    )
    return raw.filter(c =>
      c.code_dso.toLowerCase().includes(q) ||
      c.nom.toLowerCase().includes(q) ||
      (c.plateforme ?? '').toLowerCase().includes(q) ||
      (c.code_groupement ?? '').toLowerCase().includes(q) ||
      codesAvecFacture.has(c.code_dso)
    )
  }, [raw, recherche, facturesActives])

  const kpis = useMemo((): KpisCompteClient => {
    const impayees = facturesActives.filter(f => f.reste_du > 0.005 && !f.est_avoir)
    let encours12 = 0
    if (moisMax) {
      const moisMaxDate = new Date(moisMax + '-01')
      const il12MoisDate = new Date(moisMaxDate.getFullYear(), moisMaxDate.getMonth() - 11, 1)
      const moisMaxEndDate = new Date(moisMaxDate.getFullYear(), moisMaxDate.getMonth() + 1, 0)
      const il12MoisStr = il12MoisDate.toISOString().slice(0, 10)
      const moisMaxEndStr = moisMaxEndDate.toISOString().slice(0, 10)
      encours12 = impayees
        .filter(f => (f.date_emission ?? '') >= il12MoisStr && (f.date_emission ?? '') <= moisMaxEndStr)
        .reduce((s, f) => s + f.reste_du, 0)
    }
    return {
      nbClientsActifs: clients.filter(c => c.encours_total > 0).length,
      encoursTotalTtc: impayees.reduce((s, f) => s + f.reste_du, 0),
      encoursTotalAvoirs: facturesActives
        .filter(f => f.est_avoir && f.reste_du < -0.005)
        .reduce((s, f) => s + Math.abs(f.reste_du), 0),
      nbFacturesAttente: impayees.length,
      dsoRoulant: ca12Mois > 0 ? Math.round(encours12 / ca12Mois * 365) : null,
    }
  }, [clients, facturesActives, ca12Mois, moisMax])

  const nebuleuse = useMemo((): GroupeNebuleuse[] => {
    // Uniquement les clients avec un code_groupement explicite
    const groups = new Map<string, CompteClient[]>()
    for (const c of raw) {
      if (!c.code_groupement) continue
      if (!groups.has(c.code_groupement)) groups.set(c.code_groupement, [])
      groups.get(c.code_groupement)!.push(c)
    }
    return Array.from(groups.entries())
      .map(([key, cls]) => {
        const sorted = [...cls].sort((a, b) =>
          (b.derniere_emission ?? '').localeCompare(a.derniere_emission ?? '')
        )
        return {
          groupe_key: key,
          nom_groupe: sorted[0].nom,
          codes_clients: cls.map(c => c.code_dso),
          nb_clients: cls.length,
          nb_factures: cls.reduce((s, c) => s + c.nb_factures_total, 0),
          nb_impayees: cls.reduce((s, c) => s + c.nb_impayees, 0),
          encours_total: cls.reduce((s, c) => s + c.encours_total, 0),
          note_risque: Math.max(...cls.map(c => c.note_risque)),
          clients: cls,
        }
      })
      .filter(g => g.nb_clients > 1)  // vrais groupes uniquement
      .sort((a, b) => b.encours_total - a.encours_total)
  }, [raw])

  async function sauvegarderOptions(codeDso: string, opts: {
    statut_juridique: StatutJuridique | null
    commercial: string | null
    operateur: string | null
    plateforme: string | null
    code_groupement: string | null
  }) {
    const { error } = await supabase
      .from('clients')
      .update(opts as never)
      .eq('code_dso', codeDso)
    if (error) { toast.error(error.message); return false }
    toast.success('Informations enregistrées.')
    await rafraichir()
    return true
  }

  return { clients, chargement, recherche, setRecherche, kpis, nebuleuse, rafraichir, sauvegarderOptions }
}
