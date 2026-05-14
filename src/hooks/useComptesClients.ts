// Données agrégées clients — lit depuis AppDataContext (chargé une fois au démarrage)
import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAppData } from '../contexts/AppDataContext'
import toast from 'react-hot-toast'
import type { CompteClient, GroupeNebuleuse, KpisCompteClient, StatutJuridique } from '../types/client'

export function useComptesClients() {
  const { clients: raw, facturesActives, chargement, rafraichir, moisMaxFactures, ca12Mois } = useAppData()
  const [recherche, setRecherche] = useState('')

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
    if (moisMaxFactures) {
      const moisMaxDate = new Date(moisMaxFactures + '-01')
      const il12MoisStr = new Date(moisMaxDate.getFullYear(), moisMaxDate.getMonth() - 11, 1).toISOString().slice(0, 10)
      const moisMaxEndStr = new Date(moisMaxDate.getFullYear(), moisMaxDate.getMonth() + 1, 0).toISOString().slice(0, 10)
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
      dsoRoulant: ca12Mois > 0 ? encours12 / ca12Mois * 365 : null,
    }
  }, [clients, facturesActives, ca12Mois, moisMaxFactures])

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
