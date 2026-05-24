import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export interface AlerteScore {
  id: string
  code_client: string
  nom_client: string | null
  encours_ttc: number
  retard_max_jours: number
  score_risque: number
  date_calcul: string
}

export function useAlertesScore() {
  const { profil } = useAuth()
  const [alertes, setAlertes] = useState<AlerteScore[]>([])
  const [chargement, setChargement] = useState(false)
  const [snoozeJours, setSnoozeJours] = useState(20)

  const charger = useCallback(async () => {
    if (!profil?.organisation_id) return
    setChargement(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('alertes_score')
        .select('id, code_client, nom_client, encours_ttc, retard_max_jours, score_risque, date_calcul')
        .eq('organisation_id', profil.organisation_id)
        .eq('date_calcul', today)
        .order('score_risque', { ascending: false })
      if (error) throw error
      setAlertes((data ?? []) as AlerteScore[])

      // Récupère le snooze configuré pour l'org
      const { data: org } = await supabase
        .from('organisations')
        .select('alerte_snooze_jours')
        .eq('id', profil.organisation_id)
        .single()
      if (org) setSnoozeJours((org as { alerte_snooze_jours: number | null }).alerte_snooze_jours ?? 20)
    } catch (err) {
      console.error('[useAlertesScore]', err)
    } finally {
      setChargement(false)
    }
  }, [profil?.organisation_id])

  useEffect(() => { charger() }, [charger])

  async function prendreEnCharge(codeClient: string) {
    if (!profil?.organisation_id) return
    const date = new Date()
    date.setDate(date.getDate() + snoozeJours)
    const snoozeDate = date.toISOString().split('T')[0]

    const { error } = await supabase
      .from('clients')
      .update({ alerte_snooze_jusqu_au: snoozeDate } as never)
      .eq('code_dso', codeClient)
      .eq('organisation_id', profil.organisation_id)

    if (error) {
      toast.error('Erreur lors de la mise en attente.')
      return
    }
    setAlertes(prev => prev.filter(a => a.code_client !== codeClient))
    toast.success(`Client mis en attente ${snoozeJours}j.`)
  }

  return { alertes, chargement, charger, prendreEnCharge, snoozeJours }
}
