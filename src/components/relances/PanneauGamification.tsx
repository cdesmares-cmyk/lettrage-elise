import { useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import type { Relance, KpisRelance } from '../../hooks/useRelances'
import type { StatsOperateur } from '../../hooks/useLeaderboard'

function debutMois(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

interface Props {
  relances: Relance[]
  kpis: KpisRelance
  classement: StatsOperateur[]
}

function Row({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
      <span className="text-[12px] text-white/50">{label}</span>
      <span className="text-[13px] font-bold text-ockham-teal tabular-nums">{val}</span>
    </div>
  )
}

export function PanneauGamification({ relances, kpis, classement }: Props) {
  const { utilisateur } = useAuth()
  const { streak } = kpis
  const flammes = streak >= 7 ? '🔥🔥🔥' : streak >= 3 ? '🔥🔥' : streak >= 1 ? '🔥' : ''

  const { scoreMois, nbRelancesMois, tauxReponse } = useMemo(() => {
    const debut = debutMois()
    const mesRelances = relances.filter(r =>
      r.operateur_id === utilisateur?.id &&
      r.statut !== 'brouillon' &&
      !r.archivee &&
      r.envoyee_le && new Date(r.envoyee_le) >= debut
    )
    const scoreMois = mesRelances.reduce((s, r) => s + r.points_attribues, 0)
    const nbRelancesMois = mesRelances.length
    const nbRepondus = mesRelances.filter(r => ['repondue', 'promesse_paiement', 'payee'].includes(r.statut)).length
    const tauxReponse = nbRelancesMois > 0 ? Math.round((nbRepondus / nbRelancesMois) * 100) : 0
    return { scoreMois, nbRelancesMois, tauxReponse }
  }, [relances, utilisateur])

  const posEquipe = useMemo(() => {
    const idx = classement.findIndex(s => s.operateur.id === utilisateur?.id)
    return idx >= 0 ? idx + 1 : null
  }, [classement, utilisateur])

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4 h-full"
      style={{ background: 'linear-gradient(160deg, #0E1A2B 0%, #1a2d44 100%)' }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Mon activité ce mois</p>

      <div>
        <p className="text-3xl font-extrabold leading-none">
          {streak > 0 ? flammes : <span className="text-white/20">—</span>}
        </p>
        <p className="text-sm text-white/40 mt-1.5">
          {streak > 0 ? `${streak}j de série en cours` : 'Aucune série active'}
        </p>
      </div>

      <div className="mt-auto">
        <Row label="Score du mois" val={`+${scoreMois} pts`} />
        <Row label="Relances envoyées" val={String(nbRelancesMois)} />
        <Row label="Taux de réponse" val={`${tauxReponse} %`} />
        {posEquipe !== null && (
          <Row label="Position équipe" val={`${posEquipe} / ${classement.length}`} />
        )}
      </div>
    </div>
  )
}
