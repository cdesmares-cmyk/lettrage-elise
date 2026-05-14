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
  const [moisMaxDso, setMoisMaxDso] = useState('')

  // DSO — étape 1 : moisMax DB, étape 2 : CA 12 mois paginé (même logique que le tableau de bord)
  useEffect(() => {
    async function chargerDso() {
      const { data: maxData } = await supabase.from('factures')
        .select('date_emission').eq('est_avoir', false)
        .order('date_emission', { ascending: false }).limit(1)
      const moisMaxDb = (maxData?.[0] as { date_emission: string } | undefined)?.date_emission?.slice(0, 7)
      if (!moisMaxDb) return
      setMoisMaxDso(moisMaxDb)

      const moisMaxDate = new Date(moisMaxDb + '-01')
      const il12Mois = new Date(moisMaxDate.getFullYear(), moisMaxDate.getMonth() - 11, 1)
      const moisMaxEnd = new Date(moisMaxDate.getFullYear(), moisMaxDate.getMonth() + 1, 0)
      const dateDebut = il12Mois.toISOString().slice(0, 10)
      const dateFin = moisMaxEnd.toISOString().slice(0, 10)

      let ca = 0; let offset = 0; const PAGE = 5000
      while (true) {
        const { data } = await supabase.from('factures').select('montant_ttc')
          .gte('date_emission', dateDebut).lte('date_emission', dateFin)
          .eq('est_avoir', false).range(offset, offset + PAGE - 1)
        if (!data?.length) break
        ca += (data as { montant_ttc: number | null }[]).reduce((s, r) => s + (Number(r.montant_ttc) || 0), 0)
        if (data.length < PAGE) break
        offset += PAGE
      }
      setCa12Mois(ca)
    }
    chargerDso()
  }, [])

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
    if (moisMaxDso) {
      const moisMaxDate = new Date(moisMaxDso + '-01')
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
  }, [clients, facturesActives, ca12Mois, moisMaxDso])

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
