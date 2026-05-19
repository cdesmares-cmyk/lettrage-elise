import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

interface Integration {
  id: string
  api_key: string | null
  actif: boolean
  verifie_le: string | null
}

export function useAxonautIntegration() {
  const { profil } = useAuth()
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [enCours, setEnCours] = useState(false)

  async function charger() {
    const { data } = await supabase
      .from('integrations')
      .select('id, api_key, actif, verifie_le')
      .eq('provider', 'axonaut')
      .maybeSingle()
    setIntegration(data as Integration | null)
  }

  useEffect(() => { charger() }, [])

  async function sauvegarderCle(apiKey: string): Promise<boolean> {
    setEnCours(true)
    try {
      const { error } = await supabase
        .from('integrations')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ provider: 'axonaut', api_key: apiKey, actif: true, organisation_id: profil?.organisation_id } as any, {
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

  async function synchroniser(depuis?: string): Promise<number> {
    setEnCours(true)
    try {
      const { data, error } = await supabase.functions.invoke('axonaut-sync', {
        body: { action: 'sync', depuis: depuis ?? null },
      })
      if (error || !data?.ok) throw new Error(data?.error ?? 'Synchronisation échouée')
      const nb: number = data.nb_mises_a_jour ?? 0
      toast.success(`${nb} facture${nb > 1 ? 's' : ''} mise${nb > 1 ? 's' : ''} à jour.`)
      await charger()
      return nb
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Synchronisation échouée.')
      return 0
    } finally {
      setEnCours(false)
    }
  }

  return { integration, enCours, charger, sauvegarderCle, tester, synchroniser }
}
