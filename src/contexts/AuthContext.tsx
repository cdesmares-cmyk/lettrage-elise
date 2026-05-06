import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Contexte d'authentification Supabase — partagé dans toute l'application
interface ContexteAuth {
  session: Session | null
  utilisateur: User | null
  chargement: boolean
}

const ContexteAuth = createContext<ContexteAuth>({
  session: null,
  utilisateur: null,
  chargement: true,
})

export function FournisseurAuth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    // Récupération de la session existante au chargement
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setChargement(false)
    })

    // Écoute des changements de session (connexion / déconnexion)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <ContexteAuth.Provider value={{ session, utilisateur: session?.user ?? null, chargement }}>
      {children}
    </ContexteAuth.Provider>
  )
}

export function useAuth() {
  return useContext(ContexteAuth)
}
