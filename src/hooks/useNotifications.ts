// Notifications utilisateur : non-lues, marquer lu, Realtime
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Notification } from '../types/commentaire'

const COLS = 'id, type, contexte, contexte_id, lu_le, cree_le, commentaire_id'

// Nombres de lignes dénormalisées enrichies depuis la vue (auteur + extrait)
const COLS_FULL = `${COLS}, commentaires(auteur_id, corps_texte, utilisateurs(nom, prenom))`

type RawNotif = {
  id: string; type: string; contexte: string; contexte_id: string
  lu_le: string | null; cree_le: string; commentaire_id: string
  commentaires: {
    auteur_id: string; corps_texte: string
    utilisateurs: { nom: string; prenom: string | null } | null
  } | null
}

function mapNotif(r: RawNotif): Notification {
  const u = r.commentaires?.utilisateurs
  const auteur_nom = u ? (u.prenom ? `${u.prenom} ${u.nom}` : u.nom) : 'Inconnu'
  const corps_extrait = (r.commentaires?.corps_texte ?? '').slice(0, 120)
  return {
    id:             r.id,
    type:           r.type as Notification['type'],
    contexte:       r.contexte as Notification['contexte'],
    contexte_id:    r.contexte_id,
    lu_le:          r.lu_le,
    cree_le:        r.cree_le,
    auteur_nom,
    corps_extrait,
    commentaire_id: r.commentaire_id,
  }
}

export function useNotifications() {
  const { utilisateur } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [nonLues, setNonLues] = useState(0)
  const [chargement, setChargement] = useState(false)

  const charger = useCallback(async () => {
    if (!utilisateur) return
    setChargement(true)
    const { data } = await supabase
      .from('notifications')
      .select(COLS_FULL)
      .order('cree_le', { ascending: false })
      .limit(50)
    const notifs = (data ?? []).map(r => mapNotif(r as unknown as RawNotif))
    setNotifications(notifs)
    setNonLues(notifs.filter(n => !n.lu_le).length)
    setChargement(false)
  }, [utilisateur])

  const chargerRef = useRef(charger)
  chargerRef.current = charger

  useEffect(() => { charger() }, [charger])

  // Realtime : badge mis à jour en temps réel à chaque nouvelle notification
  useEffect(() => {
    if (!utilisateur) return
    const channel = supabase
      .channel(`notifications:${utilisateur.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `destinataire_id=eq.${utilisateur.id}`,
      }, () => { chargerRef.current() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [utilisateur])

  const marquerLu = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ lu_le: new Date().toISOString() } as never)
      .eq('id', id)
      .is('lu_le', null)
    if (!error) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu_le: new Date().toISOString() } : n))
      setNonLues(prev => Math.max(0, prev - 1))
    }
  }, [])

  const marquerToutLu = useCallback(async () => {
    if (!utilisateur) return
    const { error } = await supabase
      .from('notifications')
      .update({ lu_le: new Date().toISOString() } as never)
      .is('lu_le', null)
    if (!error) {
      const ts = new Date().toISOString()
      setNotifications(prev => prev.map(n => n.lu_le ? n : { ...n, lu_le: ts }))
      setNonLues(0)
    }
  }, [utilisateur])

  return { notifications, nonLues, chargement, charger, marquerLu, marquerToutLu }
}
