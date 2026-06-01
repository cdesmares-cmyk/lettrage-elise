import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export interface UtilisateurSA {
  id: string
  email: string
  nom_affiche: string
  role: string
  cree_le: string
}

export interface OrganisationSA {
  id: string
  nom: string
  slug: string
  actif: boolean
  cree_le: string
  nb_utilisateurs: number
  nb_clients: number
  encours_total: number
  nb_relances: number
  utilisateurs: UtilisateurSA[]
}

export function useSuperAdmin() {
  const [organisations, setOrganisations] = useState<OrganisationSA[]>([])
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const chargerDashboard = useCallback(async () => {
    setChargement(true)
    setErreur(null)
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'get_dashboard' },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setOrganisations(data.organisations ?? [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur chargement dashboard'
      setErreur(msg)
      toast.error(msg)
    } finally {
      setChargement(false)
    }
  }, [])

  async function creerOrganisation(params: {
    nom: string
    slug: string
    email_admin: string
    nom_admin?: string
  }): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'create_org', ...params },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success(`Organisation "${params.nom}" créée, invitation envoyée à ${params.email_admin}`)
      await chargerDashboard()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur création organisation')
      return false
    }
  }

  async function toggleOrg(organisation_id: string, actif: boolean): Promise<void> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'toggle_org', organisation_id, actif },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setOrganisations(prev =>
        prev.map(o => o.id === organisation_id ? { ...o, actif } : o)
      )
      toast.success(actif ? 'Organisation activée' : 'Organisation désactivée')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur toggle organisation')
    }
  }

  return { organisations, chargement, erreur, chargerDashboard, creerOrganisation, toggleOrg }
}
