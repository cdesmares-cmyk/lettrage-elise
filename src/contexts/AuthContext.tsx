import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface ProfilUtilisateur {
  role: string
  organisation_id: string
  nom_organisation: string
  code_org: string
  prenom: string
  nom: string
  initiales: string
}

interface ContexteAuth {
  session: Session | null
  utilisateur: User | null
  profil: ProfilUtilisateur | null
  chargement: boolean
  typeMotDePasse: 'invite' | 'recovery' | null
  motDePasseDefini: () => void
}

const ContexteAuth = createContext<ContexteAuth>({
  session: null,
  utilisateur: null,
  profil: null,
  chargement: true,
  typeMotDePasse: null,
  motDePasseDefini: () => {},
})

export function FournisseurAuth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profil, setProfil] = useState<ProfilUtilisateur | null>(null)
  const [chargement, setChargement] = useState(true)
  // Détection invitation ou reset mot de passe via le hash de l'URL
  const [typeMotDePasse, setTypeMotDePasse] = useState<'invite' | 'recovery' | null>(() => {
    const hash = window.location.hash
    if (hash.includes('type=invite')) return 'invite'
    if (hash.includes('type=recovery')) return 'recovery'
    return null
  })

  async function chargerProfil(userId: string) {
    // Le lien a suivre est NOMME explicitement.
    //
    // Depuis la table membres_organisations, il existe deux chemins entre
    // utilisateurs et organisations : la cle etrangere directe, et la table de
    // liaison. L'API refuse alors la requete entiere (PGRST201) — et le profil
    // revenant vide, c'est le nom de l'organisation, le mois de reference, le
    // chiffre d'affaires, le DSO et les roles qui tombent d'un coup.
    //
    // Nommer le lien rend cette requete insensible a l'ajout de n'importe
    // quelle relation future entre ces deux tables.
    const { data, error } = await supabase
      .from('utilisateurs')
      .select('role, organisation_id, prenom, nom, initiales, organisations!utilisateurs_organisation_id_fkey(nom, code_org)')
      .eq('id', userId)
      .single()
    // Signalee, jamais avalee : c'est ce silence qui a rendu la panne
    // invisible, le profil vide ne se manifestant que par des ecrans
    // incomplets.
    if (error) console.warn('[Ockham] chargement du profil impossible :', error.message, error)
    const d = data as { role: string; organisation_id: string; prenom: string; nom: string; initiales: string; organisations: { nom: string; code_org: string | null } | null } | null
    if (d) setProfil({
      role: d.role,
      organisation_id: d.organisation_id,
      prenom: d.prenom ?? '',
      nom: d.nom ?? '',
      initiales: d.initiales ?? '',
      nom_organisation: d.organisations?.nom ?? '',
      code_org: d.organisations?.code_org ?? '',
    })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        chargerProfil(session.user.id).finally(() => setChargement(false))
      } else {
        setChargement(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setTypeMotDePasse('recovery')
      setSession(session)
      if (session?.user) {
        chargerProfil(session.user.id)
      } else {
        setProfil(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function motDePasseDefini() { setTypeMotDePasse(null) }

  return (
    <ContexteAuth.Provider value={{ session, utilisateur: session?.user ?? null, profil, chargement, typeMotDePasse, motDePasseDefini }}>
      {children}
    </ContexteAuth.Provider>
  )
}

export function useAuth() {
  return useContext(ContexteAuth)
}
