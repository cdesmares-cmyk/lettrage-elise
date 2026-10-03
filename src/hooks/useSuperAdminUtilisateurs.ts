// Le second axe du superadmin : toutes les personnes, toutes organisations.
//
// Hook separe de useSuperAdmin volontairement : celui-la fonctionne et pilote
// l'ecran des organisations. Un nouvel axe n'a pas a risquer de le casser.
//
// La lecture passe par la fonction serveur, qui utilise la cle de service. Les
// regles d'isolation de membres_organisations sont ecrites pour les clients —
// le superadmin consultant le compte d'un tiers n'y entre pas, et la lecture
// reviendrait vide SANS erreur. On l'a deja paye une fois.
import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface UtilisateurGlobalSA {
  id: string
  email: string
  prenom: string | null
  nom: string | null
  initiales: string | null
  role: string
  /** Structure D'ORIGINE — son rattachement, pas un acces. */
  organisation_id: string
  org_nom: string
  org_code: string | null
  /** Acces SUPPLEMENTAIRES, l'origine en est exclue. */
  acces: string[]
  cree_le: string
  derniere_connexion: string | null
  invitation_en_attente: boolean
  suspendu: boolean
}

export interface OrgSimpleSA {
  id: string
  nom: string
  code_org: string | null
}

export function useSuperAdminUtilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState<UtilisateurGlobalSA[] | null>(null)
  const [organisations, setOrganisations] = useState<OrgSimpleSA[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setErreur(null)
    const { data, error } = await supabase.functions.invoke('superadmin-data', {
      body: { action: 'get_all_users' },
    })
    const corps = data as { utilisateurs?: UtilisateurGlobalSA[]; organisations?: OrgSimpleSA[]; error?: string } | null

    // Le message utile est dans le corps : invoke ne renvoie qu'un
    // « non-2xx status code » qui n'apprend rien.
    if (corps?.error || error) {
      const msg = corps?.error ?? (error instanceof Error ? error.message : 'Lecture impossible')
      console.warn('[Ockham] get_all_users a echoue :', msg)
      setErreur(msg)
      setUtilisateurs([])
      return
    }

    setUtilisateurs(corps?.utilisateurs ?? [])
    setOrganisations(corps?.organisations ?? [])
  }, [])

  return { utilisateurs, organisations, erreur, charger }
}
