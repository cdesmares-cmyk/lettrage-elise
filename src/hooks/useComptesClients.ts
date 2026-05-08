// Données agrégées clients — lit depuis AppDataContext (chargé une fois au démarrage)
import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAppData } from '../contexts/AppDataContext'
import toast from 'react-hot-toast'
import type { CompteClient, GroupeNebuleuse, KpisCompteClient, StatutJuridique } from '../types/client'

export function useComptesClients() {
  const { clients: raw, chargement, rafraichir } = useAppData()
  const [recherche, setRecherche] = useState('')

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

  const kpis = useMemo((): KpisCompteClient => ({
    nbClientsActifs: clients.filter(c => c.encours_total > 0).length,
    encoursTotalTtc: clients.reduce((s, c) => s + c.encours_total, 0),
    nbFacturesAttente: clients.reduce((s, c) => s + c.nb_impayees, 0),
    nbFacturesTotal: clients.reduce((s, c) => s + c.nb_factures_total, 0),
  }), [clients])

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
