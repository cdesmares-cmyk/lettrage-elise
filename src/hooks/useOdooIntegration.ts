import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

interface OdooConfig {
  url:      string
  db:       string
  username: string
}

interface Integration {
  id:          string
  api_key:     string | null
  config:      OdooConfig | null
  actif:       boolean
  verifie_le:  string | null
  sync_actif:  boolean
}

export interface OdooSyncProgress {
  nbMaj:   number
  termine: boolean
}

export function useOdooIntegration() {
  const [integration, setIntegration]   = useState<Integration | null>(null)
  const [enCours, setEnCours]           = useState(false)
  const [syncProgress, setSyncProgress] = useState<OdooSyncProgress | null>(null)
  const stopRef = useRef(false)

  async function charger() {
    const { data } = await supabase
      .from('integrations')
      .select('id, api_key, config, actif, verifie_le, sync_actif')
      .eq('provider', 'odoo')
      .maybeSingle()
    setIntegration(data as Integration | null)
  }

  useEffect(() => { charger() }, [])

  async function sauvegarderConfig(
    url: string, db: string, username: string, apiKey: string
  ): Promise<boolean> {
    setEnCours(true)
    try {
      // Récupère l'organisation_id explicitement pour satisfaire le WITH CHECK RLS
      const { data: me, error: meErr } = await supabase
        .from('utilisateurs')
        .select('organisation_id')
        .single()
      if (meErr || !me?.organisation_id) throw new Error('Organisation introuvable')

      const { error } = await supabase
        .from('integrations')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ provider: 'odoo', api_key: apiKey, config: { url, db, username }, actif: true, organisation_id: me.organisation_id } as any, {
          onConflict: 'organisation_id,provider',
        })
      if (error) throw error
      await charger()
      toast.success('Configuration Odoo enregistrée.')
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err)
      toast.error(msg || 'Erreur inconnue')
      return false
    } finally {
      setEnCours(false)
    }
  }

  async function tester(): Promise<boolean> {
    setEnCours(true)
    try {
      const { data, error } = await supabase.functions.invoke('odoo-sync', {
        body: { action: 'test' },
      })
      if (error || !data?.ok) throw new Error(data?.error ?? 'Connexion échouée')
      toast.success(data.message ?? 'Connexion Odoo validée ✓')
      await charger()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err)
      toast.error(msg || 'Connexion échouée')
      return false
    } finally {
      setEnCours(false)
    }
  }

  // Import historique : boucle client-side jusqu'à termine=true
  async function synchroniser(): Promise<void> {
    setEnCours(true)
    stopRef.current = false
    setSyncProgress({ nbMaj: 0, termine: false })

    try {
      let offset = 0
      let totalMaj = 0

      while (!stopRef.current) {
        const { data, error } = await supabase.functions.invoke('odoo-sync', {
          body: { action: 'sync', offset, nb_batch: 3 },
        })
        if (error || !data?.ok) throw new Error(data?.error ?? 'Erreur sync')

        totalMaj += data.nb_mises_a_jour as number
        setSyncProgress({ nbMaj: totalMaj, termine: data.termine as boolean })

        if (data.termine) break
        offset = data.prochain_offset as number
      }

      if (!stopRef.current) {
        toast.success(`Import terminé — ${totalMaj.toLocaleString('fr-FR')} factures importées`)
        await charger()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.')
    } finally {
      setEnCours(false)
    }
  }

  function arreterSync() {
    stopRef.current = true
    setSyncProgress(null)
    setEnCours(false)
  }

  return { integration, enCours, syncProgress, charger, sauvegarderConfig, tester, synchroniser, arreterSync }
}
