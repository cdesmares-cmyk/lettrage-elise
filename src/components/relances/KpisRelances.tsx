import { useMemo } from 'react'
import { useAppData } from '../../contexts/AppDataContext'
import type { Relance, KpisRelance } from '../../hooks/useRelances'

interface Props {
  relances: Relance[]
  filtreOp: string
  kpis: KpisRelance  // pour streak (toujours user-specific)
}

function Kpi({ label, valeur, sous, couleur }: { label: string; valeur: string | number; sous?: string; couleur: string }) {
  return (
    <div className={`bg-white border rounded-xl px-5 py-4 flex flex-col gap-1 ${couleur}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums text-gray-900 truncate">{valeur}</p>
      {sous && <p className="text-[11px] text-gray-400">{sous}</p>}
    </div>
  )
}

function fmtEuros(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`
  if (n >= 10_000)    return `${Math.round(n / 1_000)} k€`
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function debutMois(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function KpisRelances({ relances, filtreOp, kpis }: Props) {
  const { facturesActives } = useAppData()
  const { streak } = kpis
  const flammes = streak >= 7 ? '🔥🔥🔥' : streak >= 3 ? '🔥🔥' : streak >= 1 ? '🔥' : ''

  const { scoreMois, nbRelancesMois, tauxReponse, nbSansReponse, totalEuros } = useMemo(() => {
    const filtrees = filtreOp === 'tous'
      ? relances.filter(r => r.statut !== 'brouillon' && !r.archivee)
      : relances.filter(r => r.statut !== 'brouillon' && !r.archivee && r.operateur_id === filtreOp)

    const debut = debutMois()
    const cesMois = filtrees.filter(r => r.envoyee_le && new Date(r.envoyee_le) >= debut)
    const envoyeesMois = cesMois.filter(r => r.statut !== 'brouillon')
    const scoreMois = cesMois.reduce((s, r) => s + r.points_attribues, 0)
    const nbRelancesMois = envoyeesMois.length
    const nbRepondus = cesMois.filter(r => ['repondue', 'promesse_paiement', 'payee'].includes(r.statut)).length
    const tauxReponse = nbRelancesMois > 0 ? Math.round((nbRepondus / nbRelancesMois) * 100) : 0
    const nbSansReponse = filtrees.filter(r => r.statut === 'sans_reponse').length

    const facturesMap = new Map(facturesActives.map(f => [f.numero_piece, f]))
    const totalEuros = filtrees.reduce((sum, r) => {
      return sum + (r.factures_ids ?? []).reduce((s, id) => s + (facturesMap.get(id)?.montant_ttc ?? 0), 0)
    }, 0)

    return { scoreMois, nbRelancesMois, tauxReponse, nbSansReponse, totalEuros }
  }, [relances, filtreOp, facturesActives])

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <Kpi
        label="Score du mois"
        valeur={scoreMois}
        sous="envoyée +10 · contact +20 · promesse +25 · payée +30"
        couleur="border-ockham-teal/25"
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
      <Kpi
        label="Total relances €"
        valeur={totalEuros > 0 ? fmtEuros(totalEuros) : '—'}
        sous="montant TTC des relances actives"
        couleur="border-ockham-teal/20"
      />
    </div>
  )
}
