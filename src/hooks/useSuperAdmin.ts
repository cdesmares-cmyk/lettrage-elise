import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export interface UtilisateurSA {
  id: string
  email: string
  initiales: string
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
  utilisateurs: UtilisateurSA[]
  axonaut_actif: boolean
  axonaut_verifie_le: string | null
}

export interface CronRun {
  id: string
  fonction: string
  organisation_id: string | null
  org_nom: string | null
  statut: 'ok' | 'erreur' | 'partiel'
  nb_traite: number
  message: string | null
  duree_ms: number | null
  cree_le: string
  rang: number
}

export type DotStatut = 'ok' | 'erreur' | 'silencieux' | 'jamais'

export function dotStatut(runs: CronRun[], fonction: string, orgId: string | null): DotStatut {
  const relevant = runs.filter(r => r.fonction === fonction && r.organisation_id === orgId && r.rang === 1)
  if (!relevant.length) return 'jamais'
  const last = relevant[0]
  if (last.statut === 'erreur') return 'erreur'
  const ageH = (Date.now() - new Date(last.cree_le).getTime()) / 3_600_000
  return ageH > 48 ? 'silencieux' : 'ok'
}

export function useSuperAdmin() {
  const [organisations, setOrganisations] = useState<OrganisationSA[]>([])
  const [runs, setRuns]                   = useState<CronRun[]>([])
  const [chargement, setChargement]       = useState(false)
  const [erreur, setErreur]               = useState<string | null>(null)

  const chargerDashboard = useCallback(async () => {
    setChargement(true)
    setErreur(null)
    try {
      const [resOrgs, resMon] = await Promise.all([
        supabase.functions.invoke('superadmin-data', { body: { action: 'get_dashboard' } }),
        supabase.functions.invoke('superadmin-data', { body: { action: 'get_monitoring' } }),
      ])
      if (resOrgs.error) throw resOrgs.error
      if (resOrgs.data?.error) throw new Error(resOrgs.data.error)
      setOrganisations(resOrgs.data.organisations ?? [])
      setRuns((resMon.data?.runs ?? []) as CronRun[])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur chargement dashboard'
      setErreur(msg)
      toast.error(msg)
    } finally {
      setChargement(false)
    }
  }, [])

  async function creerOrganisation(params: {
    nom: string; slug: string; email_admin: string; nom_admin?: string
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
      setOrganisations(prev => prev.map(o => o.id === organisation_id ? { ...o, actif } : o))
      toast.success(actif ? 'Organisation activée' : 'Organisation désactivée')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur toggle organisation')
    }
  }

  return { organisations, runs, chargement, erreur, chargerDashboard, creerOrganisation, toggleOrg }
}
