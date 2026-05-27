// CRUD scénarios de relance — lit depuis AppDataContext, force un rechargement après chaque mutation
import { supabase } from '../lib/supabase'
import { useAppData, type ScenarioRelance } from '../contexts/AppDataContext'
import toast from 'react-hot-toast'

export type { ScenarioRelance }

type ScenarioInput = Omit<ScenarioRelance, 'id'>

export function useScenariosRelance() {
  const { scenarios, rechargerScenarios } = useAppData()

  async function creer(input: ScenarioInput): Promise<boolean> {
    const { error } = await supabase.from('scenarios_relance').insert(input as never)
    if (error) { toast.error('Erreur lors de la création'); return false }
    await rechargerScenarios()
    toast.success('Scénario créé')
    return true
  }

  async function modifier(id: string, input: Partial<ScenarioInput>): Promise<boolean> {
    const { error } = await supabase.from('scenarios_relance').update(input as never).eq('id', id)
    if (error) { toast.error('Erreur lors de la modification'); return false }
    await rechargerScenarios()
    toast.success('Scénario enregistré')
    return true
  }

  async function supprimer(id: string): Promise<boolean> {
    const { error } = await supabase.from('scenarios_relance').delete().eq('id', id)
    if (error) { toast.error('Erreur lors de la suppression'); return false }
    await rechargerScenarios()
    toast.success('Scénario supprimé')
    return true
  }

  return { scenarios, chargement: false, creer, modifier, supprimer }
}
