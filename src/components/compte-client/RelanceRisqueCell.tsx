export type NiveauRelance = 0 | 1 | 2 | 3 | 'gel'

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
  // 36px : juste de quoi aligner "N3 MED", le plus large. Plus large, le niveau
  // et son anciennete se lisent comme deux informations separees.
  const base = 'font-mono text-[11px] w-[36px] shrink-0'
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

/** Colonne « Risque » : le score seul. Barré si le client est gelé. */
export function RisqueCell({ score, frozen }: { score: number | null; frozen: boolean }) {
  const label = score === null ? 'Score non calculé'
    : frozen ? `Client gelé. Score risque ${score} sur 100`
    : `Score risque ${score} sur 100`
  return (
    <div aria-label={label}>
      <ScoreDisplay score={score} frozen={frozen} />
    </div>
  )
}

/**
 * Colonne « Relance » : où en est le client, et depuis combien de temps.
 * Les deux vont ensemble — « N1 · 2 j » on laisse respirer, « N1 · 45 j » on
 * escalade. Le niveau seul ne distingue pas ces deux cas.
 * Le gel masque le niveau, comme avant la refonte : à trancher avec la
 * gradation du risque, pas ici.
 */
export function RelanceCell({ level, jours }: { level: NiveauRelance; jours: number | null }) {
  if (level === 0) {
    return <span className="font-mono text-[11px] text-[#94A3B8]" aria-label="Jamais relancé">—</span>
  }

  const afficheJours = level !== 'gel' && jours !== null
  const labelNiveau = level === 'gel' ? 'Client gelé, hors cycle de relance'
    : level === 3 ? 'Niveau 3, mise en demeure recommandée'
    : `Niveau ${level}`
  const labelJours = afficheJours ? `. Dernière relance il y a ${jours} jour${jours > 1 ? 's' : ''}` : ''

  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`${labelNiveau}${labelJours}`}>
      <SignalGauge level={level} />
      <LevelCode level={level} />
      {afficheJours && (
        <>
          <span className="text-[10px] text-gray-300 shrink-0" aria-hidden>·</span>
          <span className="font-mono text-[11px] tabular-nums text-[#64748B] shrink-0">{jours} j</span>
        </>
      )}
    </div>
  )
}
