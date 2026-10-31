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
  score_fil_du_jour: number
  niveau_relance: number
  jours_derniere_relance: number | null
  est_gele: boolean
  date_calcul: string
}

export function useAlertesScore() {
  const { profil } = useAuth()
  const [alertes, setAlertes] = useState<AlerteScore[]>([])
  const [chargement, setChargement] = useState(false)
  const [snoozeJours, setSnoozeJours] = useState(20)
  // Date du calcul réellement lu. Null = la table est vide.
  const [dateCalcul, setDateCalcul] = useState<string | null>(null)
  const [clientsEnAttente, setClientsEnAttente] = useState<Set<string>>(new Set())

  const charger = useCallback(async () => {
    if (!profil?.organisation_id) return
    setChargement(true)
    try {
      // On lit le dernier calcul DISPONIBLE, pas celui du jour courant. Le cron
      // tourne à 02:00 UTC : filtrer sur aujourd'hui renvoyait zéro ligne entre
      // minuit et cette heure-là, et toute la colonne Niveau s'affichait comme
      // si personne n'avait jamais été relancé. Même effet si le cron échoue.
      const { data: dernier } = await supabase
        .from('alertes_score')
        .select('date_calcul')
        .eq('organisation_id', profil.organisation_id)
        .order('date_calcul', { ascending: false })
        .limit(1)
        .maybeSingle()
      const dateDispo = (dernier as { date_calcul: string } | null)?.date_calcul ?? null
      setDateCalcul(dateDispo)

      if (!dateDispo) {
        setAlertes([])
        setClientsEnAttente(new Set())
      } else {
        const { data, error } = await supabase
          .from('alertes_score')
          .select('id, code_client, nom_client, encours_ttc, retard_max_jours, score_risque, score_fil_du_jour, niveau_relance, jours_derniere_relance, est_gele, date_calcul')
          .eq('organisation_id', profil.organisation_id)
          .eq('date_calcul', dateDispo)
          .order('score_risque', { ascending: false })
        if (error) throw error
        setAlertes((data ?? []) as AlerteScore[])

        // Les clients mis en attente sont exclus du calcul des scores. Sans
        // eux, leur pastille retombait sur « jamais relancé » alors qu'ils
        // peuvent être à N3. On les marque à part pour les afficher en pause.
        const today = new Date().toISOString().split('T')[0]
        const { data: enAttente } = await supabase
          .from('clients')
          .select('code_dso')
          .eq('organisation_id', profil.organisation_id)
          .gte('alerte_snooze_jusqu_au', today)
        setClientsEnAttente(new Set(((enAttente ?? []) as { code_dso: string }[]).map(c => c.code_dso)))
      }

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

  return { alertes, chargement, charger, prendreEnCharge, snoozeJours, dateCalcul, clientsEnAttente }
}
