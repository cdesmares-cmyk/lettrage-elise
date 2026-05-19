import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import type { CommentaireFacture } from '../types/client'

export function useCommentairesFactures() {
  const { profil } = useAuth()
  const [commentaires, setCommentaires] = useState<Map<string, CommentaireFacture>>(new Map())

  async function chargerTous() {
    const { data } = await supabase
      .from('commentaires_factures')
      .select('id, numero_piece, contact, date_contact, commentaire, operateur, updated_at')
    const rows = (data as unknown as CommentaireFacture[]) ?? []
    const map = new Map<string, CommentaireFacture>()
    for (const r of rows) map.set(r.numero_piece, r)
    setCommentaires(map)
  }

  async function sauvegarder(data: {
    numero_piece: string
    contact: string
    date_contact: string
    commentaire: string
    operateur: string
  }): Promise<boolean> {
    try {
      const payload = {
        numero_piece: data.numero_piece,
        organisation_id: profil?.organisation_id,
        contact: data.contact.trim() || null,
        date_contact: data.date_contact || null,
        commentaire: data.commentaire.trim() || null,
        operateur: data.operateur.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('commentaires_factures')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(payload as any, { onConflict: 'organisation_id,numero_piece' })
      if (error) throw error
      setCommentaires(prev => {
        const next = new Map(prev)
        next.set(data.numero_piece, { id: prev.get(data.numero_piece)?.id ?? '', ...payload })
        return next
      })
      toast.success('Commentaire enregistré.')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.')
      return false
    }
  }

  return { commentaires, chargerTous, sauvegarder }
}
