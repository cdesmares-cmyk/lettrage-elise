import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Compte les relances qui nécessitent une attention :
// - envoyée depuis plus de 10 jours sans réponse
// - déjà marquées sans_reponse
export function useCompteurRelances() {
  const { utilisateur } = useAuth()
  const [nb, setNb] = useState(0)

  useEffect(() => {
    if (!utilisateur) { setNb(0); return }
    const seuil = new Date()
    seuil.setDate(seuil.getDate() - 10)

    supabase
      .from('relances')
      .select('id', { count: 'exact', head: true })
      .or(`statut.eq.sans_reponse,and(statut.eq.envoyee,envoyee_le.lt.${seuil.toISOString()})`)
      .then(({ count }) => setNb(count ?? 0))
  }, [utilisateur])

  return nb
}
