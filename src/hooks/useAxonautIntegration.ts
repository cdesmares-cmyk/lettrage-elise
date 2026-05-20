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

  async function synchroniser(): Promise<number> {
    setEnCours(true)
    let nbTotal = 0
    let pageDebut = 1
    const NB_PAGES = 5
    try {
      while (true) {
        const { data, error } = await supabase.functions.invoke('axonaut-sync', {
          body: { action: 'sync', page_debut: pageDebut, nb_pages: NB_PAGES },
        })
        if (error || !data?.ok) throw new Error(data?.error ?? 'Synchronisation échouée')
        nbTotal += data.nb_mises_a_jour ?? 0
        if (data.termine) break
        pageDebut = data.prochaine_page
      }
      toast.success(`${nbTotal} facture${nbTotal > 1 ? 's' : ''} mise${nbTotal > 1 ? 's' : ''} à jour.`)
      await charger()
      return nbTotal
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Synchronisation échouée.')
      return nbTotal
    } finally {
      setEnCours(false)
    }
  }

  return { integration, enCours, charger, sauvegarderCle, tester, synchroniser }
}
