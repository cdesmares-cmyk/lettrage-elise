// Données agrégées clients avec filtres, KPIs et groupement nébuleuse
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import type { CompteClient, GroupeNebuleuse, KpisCompteClient, StatutJuridique } from '../types/client'

interface RowCompteClient {
  code_dso: string; nom: string; statut: string | null; statut_juridique: string | null
  plateforme: string | null; code_groupement: string | null; parent_code_dso: string | null
  nb_factures_total: number; nb_impayees: number; encours_total: number; derniere_emission: string | null
}

export function useComptesClients() {
  const [raw, setRaw] = useState<CompteClient[]>([])
  const [chargement, setChargement] = useState(true)
  const [recherche, setRecherche] = useState('')

  async function charger() {
    setChargement(true)
    const { data, error } = await supabase
      .from('v_comptes_clients')
      .select('*')
      .order('encours_total', { ascending: false })
    if (error) { toast.error('Erreur chargement clients'); setChargement(false); return }
    const rows = data as unknown as RowCompteClient[]

    const maxEncours = Math.max(...rows.map(r => r.encours_total), 1)
    const maxImpayees = Math.max(...rows.map(r => r.nb_impayees), 1)

    setRaw(rows.map(r => ({
      ...r,
      statut_juridique: r.statut_juridique as StatutJuridique | null,
      note_risque: Math.round(
        (0.4 * (r.encours_total / maxEncours) + 0.6 * (r.nb_impayees / maxImpayees)) * 100
      ),
    })))
    setChargement(false)
  }

  useEffect(() => { charger() }, [])

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
    await charger()
    return true
  }

  // Plateformes déjà saisies (pour suggestions dans le panneau)
  const plateformesConnues = useMemo(
    () => [...new Set(raw.map(c => c.plateforme).filter(Boolean) as string[])].sort(),
    [raw]
  )

  return { clients, chargement, recherche, setRecherche, kpis, nebuleuse, rafraichir: charger, sauvegarderOptions, plateformesConnues }
}
