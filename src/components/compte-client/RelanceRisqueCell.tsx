// 'hors_cycle' : aucun score calculé pour ce client — tout est soldé, ou rien
//   n'est échu. Ce n'est pas un niveau 0, c'est l'absence de cycle.
// 'attente'    : client mis en attente, donc exclu du calcul. Son niveau est
//   suspendu, pas remis à zéro.
export type NiveauRelance = 0 | 1 | 2 | 3 | 'gel' | 'hors_cycle' | 'attente'

const BAR_HEIGHTS = [5, 8, 11] as const

function SignalGauge({ level }: { level: NiveauRelance }) {
  return (
    <svg width="18" height="14" viewBox="0 0 13 11" aria-hidden className="shrink-0">
      {BAR_HEIGHTS.map((h, i) => {
        const x = i * 5
        const y = 11 - h
        if (level === 'gel' || level === 'attente') {
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
  // 36px : juste de quoi aligner "N3 MED", le plus large. Largeur fixe pour que
  // les codes s'alignent verticalement d'une ligne a l'autre dans la colonne.
  const base = 'font-mono text-[11px] w-[36px] shrink-0'
  if (level === 'gel')     return <span className={`${base} text-[#94A3B8]`}>GEL</span>
  if (level === 'attente') return <span className={`${base} text-[#94A3B8]`}>PAUSE</span>
  // N0 s'écrit, il ne se devine pas : « en retard, jamais relancé » est une
  // consigne d'action. C'est l'absence de cycle qui mérite un tiret.
  if (level === 0)         return <span className={`${base} text-[#94A3B8]`}>N0</span>
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
 * Colonne « Niveau » : où en est le client dans le cycle de relance.
 * Séparée de l'ancienneté depuis qu'il faut pouvoir trier les deux
 * indépendamment — filtrer N1, puis classer du plus ancien au plus récent.
 * Le gel masque le niveau, comme avant la refonte : à trancher avec la
 * gradation du risque, pas ici.
 */
export function NiveauCell({ level }: { level: NiveauRelance }) {
  // Hors cycle : rien d'échu, ou tout soldé. Le client n'est pas en début de
  // cycle, il n'y est pas du tout — un tiret, jamais un N0.
  if (level === 'hors_cycle') {
    return <span className="font-mono text-[11px] text-[#CBD5E1]" aria-label="Hors cycle de relance">—</span>
  }

  const label = level === 'gel' ? 'Client gelé, hors cycle de relance'
    : level === 'attente' ? 'Client mis en attente, niveau de relance suspendu'
    : level === 3 ? 'Niveau 3, mise en demeure recommandée'
    : level === 0 ? 'En retard, jamais relancé sur les factures encore ouvertes'
    : `Niveau ${level}`

  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={label}>
      <SignalGauge level={level} />
      <LevelCode level={level} />
    </div>
  )
}

/**
 * Colonne « J+ » : depuis combien de jours remonte la dernière relance. Même
 * libellé que la colonne J+ de l'onglet Relances, qui compte la même chose.
 * Un tiret, jamais un zéro, quand il n'y a rien à dater — jamais relancé, ou
 * client gelé hors cycle. Zéro voudrait dire « relancé aujourd'hui ».
 */
/** Ensemble vide : aucune relance, ni manuelle ni automatique. */
function IcAucuneRelance() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M17.5 3.5A9 9 0 0 0 3.5 17.5"/>
      <path d="M6.5 20.5A9 9 0 0 0 20.5 6.5"/>
      <line x1="21" y1="3" x2="3" y2="21"/>
    </svg>
  )
}

export function AncienneteCell({ level, jours }: { level: NiveauRelance; jours: number | null }) {
  // Le niveau 0 ne force plus le tiret. « N0 » veut dire jamais relance SUR LES
  // FACTURES ENCORE OUVERTES ; le client a pu etre contacte hier sur une autre
  // facture, ou par le robot. La date, elle, compte la derniere relance tout
  // court — c est sa raison d etre.
  // Jamais relancé : un ensemble vide, pas un tiret. Le tiret dit « pas de
  // valeur » ; ici on sait, et la réponse est « rien ».
  if (jours === null) {
    return (
      <span className="text-[#CBD5E1] inline-flex" title="Jamais relancé" aria-label="Jamais relancé">
        <IcAucuneRelance />
      </span>
    )
  }
  // Gel, hors cycle, attente : le niveau lui-même est suspendu, dater n'a pas
  // de sens même si une date existe.
  if (level === 'gel' || level === 'hors_cycle' || level === 'attente') {
    return <span className="font-mono text-[11px] text-[#CBD5E1]" aria-label="Hors cycle, aucune relance à dater">—</span>
  }
  return (
    <span
      // nowrap : « 112 j » doit rester sur une ligne. Casser entre le nombre et
      // l'unité rallongeait la ligne du tableau et cassait la grille.
      className="font-mono text-[11px] tabular-nums whitespace-nowrap text-[#64748B]"
      aria-label={`Dernière relance il y a ${jours} jour${jours > 1 ? 's' : ''}`}
    >
      {jours} j
    </span>
  )
}
