import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { type CronRun } from './useSuperAdmin'

export interface UtilisateurDetailSA {
  id: string
  email: string
  nom_affiche: string
  role: string
  cree_le: string
  derniere_connexion: string | null
  invitation_en_attente: boolean
  suspendu: boolean
}

export interface IntegrationSA {
  provider: string
  actif: boolean
  verifie_le: string | null
  api_key_masked: string | null
}

export interface OrgDetail {
  utilisateurs: UtilisateurDetailSA[]
  integrations: IntegrationSA[]
  runs: CronRun[]
}

export function useSuperAdminOrg() {
  const [detail, setDetail]       = useState<OrgDetail | null>(null)
  const [chargement, setChargement] = useState(false)

  const chargerDetail = useCallback(async (organisation_id: string) => {
    setChargement(true)
    setDetail(null)
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'get_org_detail', organisation_id },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setDetail(data as OrgDetail)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur chargement détail org')
    } finally {
      setChargement(false)
    }
  }, [])

  async function updateUserRole(user_id: string, role: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'update_user_role', user_id, role },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setDetail(prev => prev ? {
        ...prev,
        utilisateurs: prev.utilisateurs.map(u => u.id === user_id ? { ...u, role } : u),
      } : prev)
      toast.success('Rôle mis à jour')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur mise à jour rôle')
      return false
    }
  }

  async function resetUserPassword(email: string): Promise<void> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'reset_user_password', email },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success(`Email de réinitialisation envoyé à ${email}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur envoi reset')
    }
  }

  async function resendInvitation(email: string): Promise<void> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'resend_invitation', email },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success(`Invitation renvoyée à ${email}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur renvoi invitation")
    }
  }

  async function setTempPassword(user_id: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'set_temp_password', user_id },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data.temp_password as string
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur génération mdp')
      return null
    }
  }

  async function suspendUser(user_id: string, suspendu: boolean): Promise<void> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'suspend_user', user_id, suspendu },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setDetail(prev => prev ? {
        ...prev,
        utilisateurs: prev.utilisateurs.map(u => u.id === user_id ? { ...u, suspendu } : u),
      } : prev)
      toast.success(suspendu ? 'Utilisateur suspendu' : 'Suspension levée')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suspension')
    }
  }

  async function inviteUser(params: {
    organisation_id: string; email: string; nom_affiche: string; role: string
  }): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'invite_user', ...params },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success(`Invitation envoyée à ${params.email}`)
      await chargerDetail(params.organisation_id)
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur invitation")
      return false
    }
  }

  async function setIntegrationKey(organisation_id: string, provider: string, api_key: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'set_integration_key', organisation_id, provider, api_key },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      await chargerDetail(organisation_id)
      toast.success('Clé API enregistrée')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur enregistrement clé')
      return false
    }
  }

  async function testIntegration(organisation_id: string, provider: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'test_integration', organisation_id, provider },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setDetail(prev => prev ? {
        ...prev,
        integrations: prev.integrations.map(i =>
          i.provider === provider ? { ...i, verifie_le: new Date().toISOString() } : i
        ),
      } : prev)
      toast.success('Connexion vérifiée')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur test connexion')
      return false
    }
  }

  async function triggerSync(organisation_id: string, provider: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'trigger_sync', organisation_id, provider },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success(`Sync ${provider} déclenchée (${data.nb_traite ?? 0} éléments)`)
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur déclenchement sync')
      return false
    }
  }

  async function updateOrg(organisation_id: string, nom: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('superadmin-data', {
        body: { action: 'update_org', organisation_id, nom },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success('Organisation mise à jour')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur mise à jour org')
      return false
    }
  }

  return {
    detail, chargement, chargerDetail,
    updateUserRole, resetUserPassword, resendInvitation,
    setTempPassword, suspendUser, inviteUser,
    setIntegrationKey, testIntegration, triggerSync, updateOrg,
  }
}
