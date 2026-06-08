import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface ProfilUtilisateur {
  role: string
  organisation_id: string
  nom_organisation: string
  code_org: string
  nom_affiche: string
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
    const { data } = await supabase
      .from('utilisateurs')
      .select('role, organisation_id, nom_affiche, organisations(nom, code_org)')
      .eq('id', userId)
      .single()
    const d = data as { role: string; organisation_id: string; nom_affiche: string; organisations: { nom: string; code_org: string | null } | null } | null
    if (d) setProfil({
      role: d.role,
      organisation_id: d.organisation_id,
      nom_affiche: d.nom_affiche ?? '',
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
