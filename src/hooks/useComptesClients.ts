// Données agrégées clients — lit depuis AppDataContext (chargé une fois au démarrage)
import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAppData } from '../contexts/AppDataContext'
import toast from 'react-hot-toast'
import type { CompteClient, GroupeNebuleuse, KpisCompteClient, StatutJuridique } from '../types/client'

export function useComptesClients() {
  const { clients: raw, facturesActives, chargement, rafraichir } = useAppData()
  const [recherche, setRecherche] = useState('')
  const [totalHtImporte, setTotalHtImporte] = useState(0)

  useEffect(() => {
    async function chargerTotalHt() {
      let total = 0
      let offset = 0
      while (true) {
        const { data } = await supabase.from('factures').select('montant_ht').range(offset, offset + 999)
        if (!data?.length) break
        total += (data as { montant_ht: number | null }[]).reduce((s, r) => s + (r.montant_ht ?? 0), 0)
        if (data.length < 1000) break
        offset += 1000
      }
      setTotalHtImporte(total)
    }
    chargerTotalHt()
  }, [])

  const clients = useMemo((): CompteClient[] => {
    if (!recherche.trim()) return raw
    const q = recherche.toLowerCase()
    return raw.filter(c =>
      c.code_dso.toLowerCase().includes(q) ||
      c.nom.toLowerCase().includes(q) ||
      (c.plateforme ?? '').toLowerCase().includes(q) ||
      (c.code_groupement ?? '').toLowerCase().includes(q)
    )
  }, [raw, recherche])

  const kpis = useMemo((): KpisCompteClient => {
    // Factures impayées (source : facturesActives chargées en mémoire avec pagination complète)
    // On évite de sommer nb_impayees depuis v_comptes_clients car la vue manque les factures
    // dont le code_client n'existe pas dans la table clients (factures orphelines).
    const impayees = facturesActives.filter(f => f.reste_du > 0.005 && !f.est_avoir)
    return {
      nbClientsActifs: clients.filter(c => c.encours_total > 0).length,
      encoursTotalTtc: impayees.reduce((s, f) => s + f.reste_du, 0),
      encoursTotalAvoirs: facturesActives
        .filter(f => f.est_avoir && f.reste_du < -0.005)
        .reduce((s, f) => s + Math.abs(f.reste_du), 0),
      nbFacturesAttente: impayees.length,
      nbFacturesTotal: clients.reduce((s, c) => s + c.nb_factures_total, 0),
      totalHtImporte,
    }
  }, [clients, facturesActives, totalHtImporte])

  const nebuleuse = useMemo((): GroupeNebuleuse[] => {
    const groups = new Map<string, CompteClient[]>()
    for (const c of clients) {
      const key = c.code_groupement ?? c.code_dso
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(c)
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
      .sort((a, b) => b.encours_total - a.encours_total)
  }, [clients])

  async function sauvegarderOptions(codeDso: string, opts: {
    statut_juridique: StatutJuridique | null
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

  const plateformesConnues = useMemo(
    () => [...new Set(raw.map(c => c.plateforme).filter(Boolean) as string[])].sort(),
    [raw]
  )

  return { clients, chargement, recherche, setRecherche, kpis, nebuleuse, rafraichir, sauvegarderOptions, plateformesConnues }
}
