// CRUD scénarios de relance — dictionnaire de templates par organisation
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export interface ScenarioRelance {
  id: string
  nom: string
  niveau: number
  objet: string
  corps_texte: string
}

type ScenarioInput = Omit<ScenarioRelance, 'id'>

export function useScenariosRelance() {
  const [scenarios, setScenarios] = useState<ScenarioRelance[]>([])
  const [chargement, setChargement] = useState(false)

  useEffect(() => { charger() }, [])

  async function charger() {
    setChargement(true)
    const { data } = await supabase
      .from('scenarios_relance')
      .select('id, nom, niveau, objet, corps_texte')
      .order('niveau', { ascending: true })
      .order('nom', { ascending: true })
    setScenarios((data as ScenarioRelance[]) ?? [])
    setChargement(false)
  }

  async function creer(input: ScenarioInput): Promise<boolean> {
    const { error } = await supabase.from('scenarios_relance').insert(input as never)
    if (error) { toast.error('Erreur lors de la création'); return false }
    await charger()
    toast.success('Scénario créé')
    return true
  }

  async function modifier(id: string, input: Partial<ScenarioInput>): Promise<boolean> {
    const { error } = await supabase.from('scenarios_relance').update(input as never).eq('id', id)
    if (error) { toast.error('Erreur lors de la modification'); return false }
    await charger()
    toast.success('Scénario enregistré')
    return true
  }

  async function supprimer(id: string): Promise<boolean> {
    const { error } = await supabase.from('scenarios_relance').delete().eq('id', id)
    if (error) { toast.error('Erreur lors de la suppression'); return false }
    setScenarios(prev => prev.filter(s => s.id !== id))
    toast.success('Scénario supprimé')
    return true
  }

  return { scenarios, chargement, creer, modifier, supprimer, charger }
}
