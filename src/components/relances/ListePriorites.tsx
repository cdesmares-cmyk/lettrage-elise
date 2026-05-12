import { useMemo } from 'react'
import { useAppData } from '../../contexts/AppDataContext'
import type { Relance } from '../../hooks/useRelances'

function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function scorePriorite(encours: number, ancMax: number, joursSansRelance: number): number {
  return (ancMax / 30) * 2 + encours / 1000 + joursSansRelance / 7
}

function fmtEuros(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function badgeAnc(j: number) {
  if (j > 90) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{j}j</span>
  if (j > 60) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{j}j</span>
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{j}j</span>
}

interface Props { relances: Relance[] }

export function ListePriorites({ relances }: Props) {
  const { clients, facturesActives } = useAppData()

  const priorites = useMemo(() => {
    // Index de la dernière relance par client
    const derniereRelance: Record<string, string> = {}
    for (const r of relances) {
      if (r.statut !== 'brouillon' && r.envoyee_le) {
        if (!derniereRelance[r.code_client] || r.envoyee_le > derniereRelance[r.code_client]) {
          derniereRelance[r.code_client] = r.envoyee_le
        }
      }
    }

    return clients
      .filter(c => c.nb_impayees > 0 && c.encours_total > 0)
      .map(c => {
        const factures = facturesActives.filter(f => f.code_client === c.code_dso && f.reste_du > 0)
        const ancMax = factures.length > 0
          ? Math.max(...factures.map(f => f.date_echeance ? joursDepuis(f.date_echeance) : 0))
          : 0
        const joursSansRelance = derniereRelance[c.code_dso]
          ? joursDepuis(derniereRelance[c.code_dso])
          : 999
        return {
          ...c,
          ancMax: Math.max(0, ancMax),
          joursSansRelance,
          score: scorePriorite(c.encours_total, Math.max(0, ancMax), joursSansRelance),
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [clients, facturesActives, relances])

  if (priorites.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl px-5 py-8 text-center">
        <p className="text-sm text-gray-400">Aucun client avec des impayés</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">À relancer en priorité</p>
      </div>
      <div className="divide-y divide-gray-50">
        {priorites.map((c, i) => (
          <div key={c.code_dso} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/40 transition-colors">
            <span className="w-5 h-5 rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{c.nom}</p>
              <p className="text-[10px] font-mono text-gray-400">{c.code_dso}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {badgeAnc(c.ancMax)}
              <span className="text-xs font-semibold text-gray-600 tabular-nums">{fmtEuros(c.encours_total)}</span>
            </div>
            <div className="text-right flex-shrink-0 w-20">
              <p className="text-[10px] text-gray-400">
                {c.joursSansRelance >= 999 ? 'Jamais relancé' : `${c.joursSansRelance}j sans relance`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
