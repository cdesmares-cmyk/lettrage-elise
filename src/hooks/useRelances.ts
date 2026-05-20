import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export type StatutRelance = 'brouillon' | 'envoyee' | 'repondue' | 'promesse_paiement' | 'sans_reponse' | 'payee'

export interface Relance {
  id: string
  code_client: string
  operateur_id: string
  contacts_ids: string[]
  factures_ids: string[]
  objet: string
  statut: StatutRelance
  points_attribues: number
  cree_le: string
  envoyee_le: string | null
  mis_a_jour_le: string
  archivee: boolean
}

export interface KpisRelance {
  scoreMois: number
  streak: number
  nbRelancesMois: number
  tauxReponse: number
  nbSansReponse: number
}

const POINTS: Record<StatutRelance, number> = {
  brouillon: 0,
  envoyee: 10,
  repondue: 20,
  promesse_paiement: 25,
  sans_reponse: 0,
  payee: 30,
}

function debutMois(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function calcStreak(relances: Relance[]): number {
  const envoyeesParJour = new Set(
    relances
      .filter(r => r.statut !== 'brouillon' && r.envoyee_le)
      .map(r => r.envoyee_le!.slice(0, 10))
  )
  let streak = 0
  const auj = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(auj)
    d.setDate(auj.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (envoyeesParJour.has(key)) {
      streak++
    } else if (i === 0) {
      // Aujourd'hui sans relance : on commence à vérifier hier
      continue
    } else {
      break
    }
  }
  return streak
}

export function useRelances() {
  const { utilisateur } = useAuth()
  const [relances, setRelances] = useState<Relance[]>([])
  const [chargement, setChargement] = useState(false)

  useEffect(() => {
    if (!utilisateur) { setRelances([]); return }
    setChargement(true)
    supabase
      .from('relances')
      .select('id, code_client, operateur_id, contacts_ids, factures_ids, objet, statut, points_attribues, cree_le, envoyee_le, mis_a_jour_le, archivee')
      .order('cree_le', { ascending: false })
      .then(({ data }) => {
        setRelances((data ?? []) as Relance[])
        setChargement(false)
      })
  }, [utilisateur])

  const kpis = useMemo<KpisRelance>(() => {
    const debut = debutMois()
    const cesMois = relances.filter(r => r.envoyee_le && new Date(r.envoyee_le) >= debut)
    const envoyeesCeMois = cesMois.filter(r => r.statut !== 'brouillon')

    const scoreMois = cesMois.reduce((sum, r) => sum + r.points_attribues, 0)
    const nbRelancesMois = envoyeesCeMois.length
    const nbReponduOuPayee = cesMois.filter(r => r.statut === 'repondue' || r.statut === 'promesse_paiement' || r.statut === 'payee').length
    const tauxReponse = nbRelancesMois > 0 ? Math.round((nbReponduOuPayee / nbRelancesMois) * 100) : 0
    const nbSansReponse = relances.filter(r => r.statut === 'sans_reponse').length
    const streak = calcStreak(relances)

    return { scoreMois, streak, nbRelancesMois, tauxReponse, nbSansReponse }
  }, [relances])

  async function mettreAJourStatut(id: string, statut: StatutRelance) {
    const pts = POINTS[statut]
    const patch: Record<string, unknown> = { statut, points_attribues: pts }
    if (statut === 'envoyee') patch.envoyee_le = new Date().toISOString()
    const { error } = await supabase.from('relances').update(patch as never).eq('id', id)
    if (error) { toast.error('Erreur mise à jour statut'); return false }
    setRelances(prev => prev.map(r => r.id === id ? { ...r, ...patch } as Relance : r))
    const messages: Partial<Record<StatutRelance, string>> = {
      repondue:           '✓ Prise de contact · +20 pts',
      promesse_paiement:  '✓ Promesse de paiement · +25 pts',
      payee:              '🎉 Payée · +30 pts',
      sans_reponse:       'Marquée sans réponse',
    }
    if (messages[statut]) toast.success(messages[statut]!)
    return true
  }

  async function archiver(id: string) {
    const { error } = await supabase.from('relances').update({ archivee: true } as never).eq('id', id)
    if (error) { toast.error('Erreur archivage'); return false }
    setRelances(prev => prev.map(r => r.id === id ? { ...r, archivee: true } : r))
    toast.success('Relance archivée')
    return true
  }

  return { relances, chargement, kpis, mettreAJourStatut, archiver }
}
