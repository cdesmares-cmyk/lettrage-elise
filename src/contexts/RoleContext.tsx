import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

export type Role = 'admin' | 'responsable_poste_client' | 'commercial'

interface RoleContextValue {
  role: Role | null
  chargement: boolean
  isAdmin: boolean
  peutModifier: boolean  // admin + responsable_poste_client
  isCommercial: boolean
}

const RoleContext = createContext<RoleContextValue>({
  role: null,
  chargement: true,
  isAdmin: false,
  peutModifier: false,
  isCommercial: false,
})

export function RoleProvider({ children }: { children: ReactNode }) {
  const { utilisateur } = useAuth()
  const [role, setRole] = useState<Role | null>(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    if (!utilisateur) {
      setRole(null)
      setChargement(false)
      return
    }

    setChargement(true)
    supabase
      .from('utilisateurs')
      .select('role')
      .eq('id', utilisateur.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          // Ligne absente : l'utilisateur n'a pas encore de rôle assigné.
          // On l'insère avec le rôle par défaut et on recharge.
          supabase
            .from('utilisateurs')
            .insert({ id: utilisateur.id, email: utilisateur.email ?? '', nom: utilisateur.email?.split('@')[0] ?? '', prenom: '', initiales: (utilisateur.email?.split('@')[0] ?? '').slice(0, 3).toUpperCase() } as never)
            .then(() => {
              setRole('responsable_poste_client')
              setChargement(false)
            })
        } else {
          setRole((data as { role: Role }).role)
          setChargement(false)
        }
      })
  }, [utilisateur])

  return (
    <RoleContext.Provider value={{
      role,
      chargement,
      isAdmin: role === 'admin',
      peutModifier: role === 'admin' || role === 'responsable_poste_client',
      isCommercial: role === 'commercial',
    }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
