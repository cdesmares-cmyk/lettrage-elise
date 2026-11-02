// Date du dernier echange hors Ockham, par client.
//
// POURQUOI UN HOOK SEPARE. Le panneau d'options charge les echanges d'UN
// client pour les afficher. La liste des comptes, elle, a besoin d'une date par
// client sur toute l'organisation, pour le J+ et la couleur du bouton
// Relancer. Deux besoins, deux requetes : la seconde ne lit que deux colonnes.
//
// CE QUE CA NE TOUCHE PAS. Le niveau de relance. Il mesure l'escalade sur des
// factures impayees, pas l'activite : un appel ne fait pas passer un client de
// N1 a N2. Le calcul vit en SQL (calculer_scores_org, migration 181) et ne lit
// que relances et relances_auto_log. C'est l'absence de jointure qui protege,
// il n'y a pas de garde-fou a poser ici.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Un echange par appel telephonique, sur une base qui en comptera quelques
// milliers par an. La borne evite de ramener l'historique entier d'un coup ;
// comme le tri est descendant, ce sont toujours les plus recents qui passent,
// et seul le plus recent par client nous interesse.
const LIMITE = 5000

export function useDerniersEchanges() {
  const [parClient, setParClient] = useState<Map<string, string>>(new Map())

  const recharger = useCallback(() => {
    supabase
      .from('echanges_clients')
      .select('code_client,echange_le')
      // Un echange supprime ne compte plus comme un contact client : sinon le
      // bouton Supprimer ne tiendrait pas sa promesse, le client resterait
      // affiche « relance ». Migration 186.
      .eq('archivee', false)
      .order('echange_le', { ascending: false })
      .limit(LIMITE)
      .then(({ data }) => {
        const map = new Map<string, string>()
        for (const e of (data ?? []) as { code_client: string; echange_le: string }[]) {
          const actuelle = map.get(e.code_client)
          if (!actuelle || e.echange_le > actuelle) map.set(e.code_client, e.echange_le)
        }
        setParClient(map)
      })
  }, [])

  useEffect(() => { recharger() }, [recharger])

  return { derniersEchangesParClient: parClient, rechargerEchanges: recharger }
}
