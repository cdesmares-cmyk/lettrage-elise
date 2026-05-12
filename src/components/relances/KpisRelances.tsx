import type { KpisRelance } from '../../hooks/useRelances'

interface Props { kpis: KpisRelance }

function Kpi({ label, valeur, sous, couleur }: { label: string; valeur: string | number; sous?: string; couleur: string }) {
  return (
    <div className={`bg-white border rounded-xl px-5 py-4 flex flex-col gap-1 ${couleur}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-3xl font-extrabold tabular-nums text-gray-900">{valeur}</p>
      {sous && <p className="text-[11px] text-gray-400">{sous}</p>}
    </div>
  )
}

export function KpisRelances({ kpis }: Props) {
  const { scoreMois, streak, nbRelancesMois, tauxReponse, nbSansReponse } = kpis

  const flammes = streak >= 7 ? '🔥🔥🔥' : streak >= 3 ? '🔥🔥' : streak >= 1 ? '🔥' : ''

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi
        label="Score du mois"
        valeur={scoreMois}
        sous="pts · envoyée +10 · répondue +20 · payée +30"
        couleur="border-blue-100"
      />
      <Kpi
        label={`Série en cours ${flammes}`}
        valeur={`${streak}j`}
        sous={streak === 0 ? 'Envoyez une relance aujourd\'hui !' : 'jours consécutifs'}
        couleur={streak >= 3 ? 'border-amber-200' : 'border-gray-100'}
      />
      <Kpi
        label="Relances ce mois"
        valeur={nbRelancesMois}
        sous={`${tauxReponse}% de taux de réponse`}
        couleur="border-gray-100"
      />
      <Kpi
        label="Sans réponse"
        valeur={nbSansReponse}
        sous={nbSansReponse > 0 ? 'À relancer en priorité' : 'Aucune en attente'}
        couleur={nbSansReponse > 0 ? 'border-red-200' : 'border-gray-100'}
      />
    </div>
  )
}
