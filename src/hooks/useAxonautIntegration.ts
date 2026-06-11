import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

interface SyncStats {
  nbMaj:     number
  nbVues:    number
  nbSansPdf: number
}

interface DernierRapport extends SyncStats {
  date: string
}

interface Integration {
  id:                    string
  api_key:               string | null
  actif:                 boolean
  verifie_le:            string | null
  sync_actif:            boolean
  sync_page_courante:    number
  sync_stats:            SyncStats | null
  sync_dernier_rapport:  DernierRapport | null
}

export function useAxonautIntegration() {
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [enCours, setEnCours] = useState(false)

  async function charger() {
    const { data } = await supabase
      .from('integrations')
      .select('id, api_key, actif, verifie_le, sync_actif, sync_page_courante, sync_stats, sync_dernier_rapport')
      .eq('provider', 'axonaut')
      .maybeSingle()
    setIntegration(data as Integration | null)
  }

  useEffect(() => { charger() }, [])

  // Polling toutes les 3s pendant une sync en cours
  useEffect(() => {
    if (!integration?.sync_actif) return
    const interval = setInterval(charger, 3000)
    return () => clearInterval(interval)
  }, [integration?.sync_actif])

  async function sauvegarderCle(apiKey: string): Promise<boolean> {
    setEnCours(true)
    try {
      const { error } = await supabase
        .from('integrations')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ provider: 'axonaut', api_key: apiKey, actif: true } as any, {
          onConflict: 'organisation_id,provider',
        })
      if (error) throw error
      await charger()
      toast.success('Clef API enregistrée.')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.')
      return false
    } finally {
      setEnCours(false)
    }
  }

  async function tester(): Promise<boolean> {
    setEnCours(true)
    try {
      const { data, error } = await supabase.functions.invoke('axonaut-sync', {
        body: { action: 'test' },
      })
      if (error || !data?.ok) throw new Error(data?.message ?? data?.error ?? 'Connexion échouée')
      toast.success('Connexion Axonaut validée ✓')
      await charger()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connexion échouée.')
      return false
    } finally {
      setEnCours(false)
    }
  }

  async function synchroniser(): Promise<void> {
    setEnCours(true)
    try {
      const { error } = await supabase
        .from('integrations')
        .update({ sync_actif: true, sync_page_courante: 1, sync_stats: {} })
        .eq('provider', 'axonaut')
        .eq('actif', true)
      if (error) throw error
      await charger()
      toast.success('Synchronisation démarrée en arrière-plan')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.')
    } finally {
      setEnCours(false)
    }
  }

  async function arreterSync(): Promise<void> {
    try {
      await supabase
        .from('integrations')
        .update({ sync_actif: false, sync_verrou_expire_le: null })
        .eq('provider', 'axonaut')
        .eq('actif', true)
      await charger()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.')
    }
  }

  return { integration, enCours, charger, sauvegarderCle, tester, synchroniser, arreterSync }
}
