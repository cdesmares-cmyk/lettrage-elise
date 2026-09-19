export type NiveauRelance = 0 | 1 | 2 | 3 | 'gel'

interface Props {
  level: NiveauRelance
  score: number | null
}

const BAR_HEIGHTS = [5, 8, 11] as const

function SignalGauge({ level }: { level: NiveauRelance }) {
  return (
    <svg width="18" height="14" viewBox="0 0 13 11" aria-hidden className="shrink-0">
      {BAR_HEIGHTS.map((h, i) => {
        const x = i * 5
        const y = 11 - h
        if (level === 'gel') {
          return (
            <rect key={i} x={x + 0.5} y={y + 0.5} width={2} height={h - 1}
              fill="none" stroke="#94A3B8" strokeWidth={1} />
          )
        }
        const filled = typeof level === 'number' && i < level
        const fill = !filled ? '#E5E7EB' : level === 3 ? '#B91C1C' : '#4CC5BB'
        return <rect key={i} x={x} y={y} width={3} height={h} fill={fill} />
      })}
    </svg>
  )
}

function LevelCode({ level }: { level: NiveauRelance }) {
  const base = 'font-mono text-[11px] w-[48px] shrink-0'
  if (level === 'gel') return <span className={`${base} text-[#94A3B8]`}>GEL</span>
  if (level === 0)     return <span className={`${base} text-[#94A3B8]`}>—</span>
  if (level === 3) {
    return (
      <span className={`${base} font-bold text-[#B91C1C]`}>
        N3<span className="text-[8px] ml-[3px] relative top-[-1px] tracking-widest">MED</span>
      </span>
    )
  }
  return (
    <span className={`${base} text-[#0F172A] ${level === 1 ? 'font-medium' : 'font-semibold'}`}>
      N{level}
    </span>
  )
}

function ScoreDisplay({ score, frozen }: { score: number | null; frozen: boolean }) {
  const base = 'font-mono text-[11px] tabular-nums shrink-0'
  if (score === null) return <span className={`${base} text-[#94A3B8]`}>—</span>
  if (frozen)         return <span className={`${base} text-[#94A3B8] line-through`}>{score}</span>
  if (score >= 86) {
    return (
      <span className={`${base} font-bold text-white bg-[#B91C1C] rounded-[3px] px-1 py-px`}>
        {score}
      </span>
    )
  }
  if (score >= 71) return <span className={`${base} font-bold text-[#B91C1C]`}>{score}</span>
  if (score >= 56) return <span className={`${base} font-semibold text-[#92400E]`}>{score}</span>
  return <span className={`${base} text-[#64748B]`}>{score}</span>
}

export function RelanceRisqueCell({ level, score }: Props) {
  // N0 : aucune relance → juste le score, pas de bruit visuel
  if (level === 0) {
    return (
      <div aria-label={score !== null ? `Score risque ${score} sur 100` : 'Score non calculé'}>
        <ScoreDisplay score={score} frozen={false} />
      </div>
    )
  }

  const frozen = level === 'gel'
  const labelNiveau = level === 'gel' ? 'Client gelé, hors cycle de relance'
    : level === 3 ? 'Niveau 3, mise en demeure recommandée'
    : `Niveau ${level}`
  const labelScore = score === null ? '' : `. Score risque ${score} sur 100`

  return (
    <div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={`${labelNiveau}${labelScore}`}
    >
      <SignalGauge level={level} />
      <LevelCode level={level} />
      <span className="w-px h-3 bg-gray-200 shrink-0" aria-hidden />
      <ScoreDisplay score={score} frozen={frozen} />
    </div>
  )
}
