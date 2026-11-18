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
      .select('id, numero_piece, contact, date_contact, commentaire, operateur, updated_at, ne_pas_relancer')
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
    ne_pas_relancer?: boolean
  }): Promise<boolean> {
    try {
      const payload = {
        numero_piece: data.numero_piece,
        organisation_id: profil?.organisation_id,
        contact: data.contact.trim() || null,
        date_contact: data.date_contact || null,
        commentaire: data.commentaire.trim() || null,
        operateur: data.operateur.trim() || null,
        ne_pas_relancer: data.ne_pas_relancer ?? false,
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

  /**
   * Pose ou retire « ne pas relancer » sur plusieurs factures.
   *
   * L'indicateur vit sur commentaires_factures, pas sur la facture : il faut
   * donc créer la ligne de commentaire quand elle n'existe pas. C'est ce que
   * fait l'upsert.
   *
   * SEULES LES COLONNES ENVOYÉES SONT ÉCRASÉES. Un commentaire déjà saisi, son
   * contact et sa date survivent à l'opération — sans quoi exclure une facture
   * des relances effacerait le travail de recouvrement qui l'a justifiée.
   */
  async function definirNePasRelancer(numerosPiece: string[], valeur: boolean): Promise<boolean> {
    if (!numerosPiece.length) return true
    const horodatage = new Date().toISOString()
    try {
      const LOT = 200
      for (let i = 0; i < numerosPiece.length; i += LOT) {
        const payload = numerosPiece.slice(i, i + LOT).map(numero_piece => ({
          numero_piece,
          organisation_id: profil?.organisation_id,
          ne_pas_relancer: valeur,
          updated_at: horodatage,
        }))
        const { error } = await supabase
          .from('commentaires_factures')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(payload as any, { onConflict: 'organisation_id,numero_piece' })
        if (error) throw error
      }
      setCommentaires(prev => {
        const next = new Map(prev)
        for (const numero of numerosPiece) {
          const existant = prev.get(numero)
          next.set(numero, {
            id: existant?.id ?? '',
            numero_piece: numero,
            contact: existant?.contact ?? null,
            date_contact: existant?.date_contact ?? null,
            commentaire: existant?.commentaire ?? null,
            operateur: existant?.operateur ?? null,
            updated_at: horodatage,
            ne_pas_relancer: valeur,
          })
        }
        return next
      })
      toast.success(
        valeur
          ? `${numerosPiece.length} facture${numerosPiece.length > 1 ? 's' : ''} exclue${numerosPiece.length > 1 ? 's' : ''} des relances.`
          : `${numerosPiece.length} facture${numerosPiece.length > 1 ? 's' : ''} réintégrée${numerosPiece.length > 1 ? 's' : ''} dans les relances.`
      )
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la mise à jour.')
      return false
    }
  }

  return { commentaires, chargerTous, sauvegarder, definirNePasRelancer }
}
