import { useAuth } from '../../contexts/AuthContext'
import type { StatsOperateur } from '../../hooks/useLeaderboard'

const MEDAILLES = ['🥇', '🥈', '🥉']

interface Props {
  classement: StatsOperateur[]
}

export function LeaderboardEquipe({ classement }: Props) {
  const { utilisateur } = useAuth()

  if (classement.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl px-5 py-8 text-center">
        <p className="text-sm text-gray-400">Aucune donnée équipe</p>
        <p className="text-xs text-gray-300 mt-1">Les relances apparaîtront ici</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Classement équipe — ce mois</p>
      </div>
      <div className="divide-y divide-gray-50">
        {classement.map(s => {
          const estMoi = s.operateur.id === utilisateur?.id
          const medaille = s.rang <= 3 ? MEDAILLES[s.rang - 1] : null
          const flamme = s.streak >= 7 ? '🔥🔥🔥' : s.streak >= 3 ? '🔥🔥' : s.streak >= 1 ? '🔥' : ''

          return (
            <div
              key={s.operateur.id}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${estMoi ? 'bg-ockham-teal-muted' : 'hover:bg-gray-50/40'}`}
            >
              <div className="w-6 text-center flex-shrink-0">
                {medaille
                  ? <span className="text-sm">{medaille}</span>
                  : <span className="text-[10px] font-bold text-gray-300">#{s.rang}</span>
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className={`text-[13px] font-semibold truncate ${estMoi ? 'text-ockham-teal-dark' : 'text-gray-800'}`}>
                    {s.operateur.nom_affiche || s.operateur.email.split('@')[0]}
                  </p>
                  {estMoi && (
                    <span className="text-[9px] font-bold text-ockham-teal bg-ockham-teal/10 px-1.5 py-0.5 rounded">vous</span>
                  )}
                  {flamme && <span className="text-xs leading-none">{flamme}</span>}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {s.nbRelances} relance{s.nbRelances !== 1 ? 's' : ''} · {s.tauxReponse}% réponse · {s.streak}j série
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                <p className={`text-xl font-extrabold tabular-nums leading-none ${s.rang === 1 ? 'text-ockham-copper' : 'text-gray-800'}`}>
                  {s.scoreMois}
                </p>
                <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">pts</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
