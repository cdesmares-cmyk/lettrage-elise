import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: me } = await (supabase as any)
      .from('utilisateurs')
      .select('id, organisation_id')
      .single() as { data: { id: string; organisation_id: string } | null }
    if (!me) return false
    const { error } = await supabase
      .from('rappels_client' as never)
      .insert({
        organisation_id:   me.organisation_id,
        code_client:       codeClient,
        type:              'rappel_perso',
        prevu_le:          params.prevu_le,
        heure:             params.heure  ?? null,
        note:              params.note   ?? null,
        calendar_event_id: params.calendar_event_id ?? null,
        cree_par:          me.id,
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
