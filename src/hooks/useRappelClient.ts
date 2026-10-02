import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export interface Rappel {
  id:                string
  code_client:       string
  type:              'rappel_perso' | 'relance_prevue'
  prevu_le:          string
  heure:             string | null
  note:              string | null
  calendar_event_id: string | null
  cree_le:           string
}

export function useRappelClient(codeClient: string | null) {
  const [rappels, setRappels] = useState<Rappel[]>([])
  // La structure ACTIVE. utilisateurs.organisation_id porte celle d'ORIGINE, et
  // la regle d'insertion compare a l'active : lire la colonne ferait echouer
  // l'ecriture apres une bascule de structure.
  const { profil } = useAuth()

  async function charger() {
    if (!codeClient) { setRappels([]); return }
    const aujourd_hui = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('rappels_client' as never)
      .select('id, code_client, type, prevu_le, heure, note, calendar_event_id, cree_le')
      .eq('code_client', codeClient)
      .gte('prevu_le', aujourd_hui)
      .order('prevu_le', { ascending: true })
    setRappels((data as Rappel[] | null) ?? [])
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { charger() }, [codeClient])

  async function creerRappel(params: {
    prevu_le:           string
    heure?:             string | null
    note?:              string | null
    calendar_event_id?: string | null
  }): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    if (!profil?.organisation_id) return false
    const { error } = await supabase
      .from('rappels_client' as never)
      .insert({
        organisation_id:   profil.organisation_id,
        code_client:       codeClient,
        type:              'rappel_perso',
        prevu_le:          params.prevu_le,
        heure:             params.heure  ?? null,
        note:              params.note   ?? null,
        calendar_event_id: params.calendar_event_id ?? null,
        cree_par:          user.id,
      } as never)
    if (error) { console.error('[rappels_client] insert error:', error); return false }
    await charger()
    return true
  }

  async function supprimerRappel(id: string): Promise<void> {
    await supabase.from('rappels_client' as never).delete().eq('id', id)
    await charger()
  }

  const prochainRappel = rappels[0] ?? null

  return { rappels, prochainRappel, charger, creerRappel, supprimerRappel }
}
