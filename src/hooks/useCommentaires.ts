// Fil de commentaires internes : chargement, envoi, Realtime
// contexte + contexteId = clé du fil (ex: 'client' + code_dso)
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAppData } from '../contexts/AppDataContext'
import toast from 'react-hot-toast'
import type { Commentaire, ContexteCommentaire } from '../types/commentaire'

const COLS = 'id, auteur_id, corps_texte, mentions, contexte, contexte_id, reponse_a, cree_le, modifie_le'

type RawRow = {
  id: string; auteur_id: string; corps_texte: string; mentions: string[]
  contexte: ContexteCommentaire; contexte_id: string
  reponse_a: string | null; cree_le: string; modifie_le: string
}

export function useCommentaires(contexte: ContexteCommentaire, contexteId: string) {
  const { utilisateur } = useAuth()
  const { membresOrg } = useAppData()
  const [commentaires, setCommentaires] = useState<Commentaire[]>([])
  const [chargement, setChargement] = useState(false)
  const [envoi, setEnvoi] = useState(false)

  const membresRef = useRef(membresOrg)
  membresRef.current = membresOrg

  function nomMembre(auteurId: string): string {
    const m = membresRef.current.find(x => x.id === auteurId)
    if (!m) return 'Inconnu'
    return m.prenom ? `${m.prenom} ${m.nom}` : m.nom
  }

  function mapRow(r: RawRow): Commentaire {
    return {
      id:          r.id,
      auteur_id:   r.auteur_id,
      auteur_nom:  nomMembre(r.auteur_id),
      corps_texte: r.corps_texte,
      mentions:    r.mentions ?? [],
      contexte:    r.contexte,
      contexte_id: r.contexte_id,
      reponse_a:   r.reponse_a,
      cree_le:     r.cree_le,
      modifie_le:  r.modifie_le,
    }
  }

  // Aplatit → arbre max 2 niveaux (racine + réponses, jamais de 3ème niveau)
  function grouper(plat: Commentaire[]): Commentaire[] {
    const byId = new Map(plat.map(c => [c.id, { ...c, reponses: [] as Commentaire[] }]))
    const racines: Commentaire[] = []
    for (const c of byId.values()) {
      if (!c.reponse_a || !byId.has(c.reponse_a)) {
        racines.push(c)
      } else {
        // Remonte la chaîne jusqu'à trouver la racine (max 2 niveaux en display)
        let parentId = c.reponse_a
        let parent = byId.get(parentId)!
        while (parent.reponse_a && byId.has(parent.reponse_a)) {
          parentId = parent.reponse_a
          parent = byId.get(parentId)!
        }
        byId.get(parentId)!.reponses!.push(c)
      }
    }
    return racines
  }

  const charger = useCallback(async () => {
    if (!contexteId) return
    setChargement(true)
    const { data } = await supabase
      .from('commentaires')
      .select(COLS)
      .eq('contexte', contexte)
      .eq('contexte_id', contexteId)
      .order('cree_le', { ascending: true })
    setCommentaires(grouper((data ?? []).map(r => mapRow(r as RawRow))))
    setChargement(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexte, contexteId])

  // Référence stable pour le callback Realtime (évite de recréer le channel sur chaque render)
  const chargerRef = useRef(charger)
  chargerRef.current = charger

  useEffect(() => { charger() }, [charger])

  // Réabonnement uniquement si contexte/contexteId changent
  useEffect(() => {
    if (!contexteId) return
    const channel = supabase
      .channel(`commentaires:${contexte}:${contexteId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'commentaires',
        filter: `contexte_id=eq.${contexteId}`,
      }, () => { chargerRef.current() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [contexte, contexteId])

  const envoyer = useCallback(async (
    corpsTexte: string,
    mentions: string[],
    reponseA?: string | null,
  ): Promise<boolean> => {
    if (!utilisateur || envoi) return false
    setEnvoi(true)
    const { error } = await supabase.from('commentaires').insert({
      auteur_id:   utilisateur.id,
      corps_texte: corpsTexte,
      mentions,
      contexte,
      contexte_id: contexteId,
      reponse_a:   reponseA ?? null,
    } as never)
    setEnvoi(false)
    if (error) { toast.error('Erreur lors de l\'envoi.'); return false }
    toast.success('Commentaire envoyé.')
    return true
  }, [utilisateur, envoi, contexte, contexteId])

  const modifier = useCallback(async (
    id: string,
    corpsTexte: string,
    mentions: string[],
  ): Promise<boolean> => {
    const { error } = await supabase
      .from('commentaires')
      .update({ corps_texte: corpsTexte, mentions } as never)
      .eq('id', id)
    if (error) { toast.error('Erreur lors de la modification.'); return false }
    toast.success('Commentaire modifié.')
    chargerRef.current()
    return true
  }, [])

  const supprimer = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('commentaires').delete().eq('id', id)
    if (error) { toast.error('Erreur lors de la suppression.'); return false }
    toast.success('Commentaire supprimé.')
    // Mise à jour locale immédiate (Realtime DELETE ne garantit pas le filtre)
    setCommentaires(prev =>
      prev
        .filter(c => c.id !== id)
        .map(c => ({ ...c, reponses: (c.reponses ?? []).filter(r => r.id !== id) }))
    )
    return true
  }, [])

  return { commentaires, chargement, envoi, charger, envoyer, modifier, supprimer }
}
