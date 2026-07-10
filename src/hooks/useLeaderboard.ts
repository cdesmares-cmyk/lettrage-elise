import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Relance } from './useRelances'

interface Operateur {
  id: string
  initiales: string
  email: string
}

export interface StatsOperateur {
  operateur: Operateur
  scoreMois: number
  nbRelances: number
  streak: number
  tauxReponse: number
  rang: number
}

function debutMois(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function calcStreak(relances: Relance[]): number {
  const jours = new Set(
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
    if (jours.has(key)) {
      streak++
    } else if (i === 0) {
      continue
    } else {
      break
    }
  }
  return streak
}

export function useLeaderboard(relances: Relance[]) {
  const [operateurs, setOperateurs] = useState<Operateur[]>([])

  useEffect(() => {
    supabase
      .from('utilisateurs')
      .select('id, initiales, email')
      .then(({ data }) => {
        setOperateurs((data ?? []) as Operateur[])
      })
  }, [])

  const classement = useMemo<StatsOperateur[]>(() => {
    const debut = debutMois()
    const parOp = new Map<string, Relance[]>()

    for (const r of relances) {
      if (!parOp.has(r.operateur_id)) parOp.set(r.operateur_id, [])
      parOp.get(r.operateur_id)!.push(r)
    }

    const stats: StatsOperateur[] = []

    for (const [opId, rels] of parOp.entries()) {
      const op = operateurs.find(o => o.id === opId)
      if (!op) continue

      const cesMois = rels.filter(r => r.envoyee_le && new Date(r.envoyee_le) >= debut)
      const envoyeesMois = cesMois.filter(r => r.statut !== 'brouillon')
      const scoreMois = cesMois.reduce((s, r) => s + r.points_attribues, 0)
      const nbReponduOuPayee = cesMois.filter(r => r.statut === 'repondue' || r.statut === 'payee').length
      const tauxReponse = envoyeesMois.length > 0 ? Math.round((nbReponduOuPayee / envoyeesMois.length) * 100) : 0
      const nbRelances = rels.filter(r => r.statut !== 'brouillon').length
      const streak = calcStreak(rels)

      stats.push({ operateur: op, scoreMois, nbRelances, streak, tauxReponse, rang: 0 })
    }

    stats.sort((a, b) => b.scoreMois - a.scoreMois)
    stats.forEach((s, i) => { s.rang = i + 1 })

    return stats
  }, [relances, operateurs])

  return classement
}
