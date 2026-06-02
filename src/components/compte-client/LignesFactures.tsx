// Sous-tableau factures partagé entre la vue clients (expand) et la vue factures flat
import { useState, useRef } from 'react'
import type { FactureDetail, StatutFacture, CommentaireFacture } from '../../types/client'
import { useRole } from '../../contexts/RoleContext'
import { NumeroPiece } from '../NumeroPiece'

interface Props {
  factures: FactureDetail[]
  chargement: boolean
  onStatutChange: (numero: string, statut: StatutFacture | null) => void
  onHistorique: (fac: FactureDetail) => void
  compact?: boolean
  commentaires?: Map<string, CommentaireFacture>
  onOuvrirCommentaire?: (fac: FactureDetail) => void
  // Quand fourni depuis le parent (vue flat), le tri s'applique sur l'ensemble des données avant pagination
  controlSort?: { col: string; dir: SortDir; onChange: (col: string) => void }
}

// Instances créées une seule fois — toLocaleDateString recrée Intl.DateTimeFormat à chaque appel (lent)
const _fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const _today = new Date()

function fmt(n: number) { return _fmt.format(n) + ' €' }
function anciennete(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((_today.getTime() - new Date(iso).getTime()) / 86_400_000)
}
function badgeAnc(j: number) {
  if (j <= 60) return 'bg-gray-100 text-gray-500'
  if (j <= 90) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

const IcLitige = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
const IcProv   = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>

const STATUTS: { val: StatutFacture | null; label: string }[] = [
  { val: 'litige',      label: 'Litige'      },
  { val: 'provisionne', label: 'Provisionné' },
  { val: null,          label: '✕ Effacer'   },
]

function StatutBadge({ statut, estSolde, onClick }: { statut: StatutFacture | null; estSolde: boolean; onClick: (e: React.MouseEvent) => void }) {
  if (estSolde)
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">✓ Payée</span>
  if (statut === 'litige')
    return <span onClick={onClick} className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200"><IcLitige /> Litige</span>
  if (statut === 'provisionne')
    return <span onClick={onClick} className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200"><IcProv /> Provisionné</span>
  return <span onClick={onClick} className="cursor-pointer inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600">Statut</span>
}

type SortDir = 'asc' | 'desc'

function sortRows<T extends Record<string, unknown>>(data: T[], col: keyof T, dir: SortDir): T[] {
  return [...data].sort((a, b) => {
    const av = a[col] ?? '', bv = b[col] ?? ''
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'fr-FR', { numeric: true })
    return dir === 'asc' ? cmp : -cmp
  })
}

function ColTh({ label, col, sort, dir, onSort, align = 'left' }: {
  label: string; col: string
  sort: string; dir: SortDir
  onSort: (col: string) => void
  align?: 'left' | 'right' | 'center'
}) {
  const active = sort === col
  const alignCls = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors ${active ? 'text-ockham-teal' : 'text-gray-400'}`}
    >
      <span className={`flex items-center gap-1 ${alignCls}`}>
        {label}
        <span className={`text-[9px] ${active ? 'text-ockham-teal' : 'text-gray-300'}`}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⬍'}
        </span>
      </span>
    </th>
  )
}

export function LignesFactures({ factures, chargement, onStatutChange, onHistorique, compact, controlSort, commentaires, onOuvrirCommentaire }: Props) {
  const { peutModifier } = useRole()
  const [popupOpen, setPopupOpen] = useState<string | null>(null)
  const popupPos = useRef<{ top: number; left: number }>({ top: 0, left: 0 })
  const [sortColInt, setSortColInt] = useState<string>('date_echeance')
  const [sortDirInt, setSortDirInt] = useState<SortDir>('desc')

  const sortCol = controlSort?.col ?? sortColInt
  const sortDir = controlSort?.dir ?? sortDirInt

  function handleSort(col: string) {
    if (controlSort) {
      controlSort.onChange(col)
    } else {
      setSortColInt(prev => {
        if (prev === col) { setSortDirInt(d => d === 'asc' ? 'desc' : 'asc'); return col }
        setSortDirInt('desc')
        return col
      })
    }
  }

  function handleStatutClick(e: React.MouseEvent, numero: string) {
    e.stopPropagation()
    if (!peutModifier) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    popupPos.current = { top: rect.bottom + 6, left: rect.left }
    setPopupOpen(open => open === numero ? null : numero)
  }

  if (chargement) {
    return <div className="py-6 text-center text-xs text-gray-400">Chargement…</div>
  }
  if (!factures.length) {
    return <div className="py-6 text-center text-xs text-gray-400">Aucune facture trouvée.</div>
  }

  // Pas de tri interne si controlSort fourni (données déjà triées par le parent sur l'ensemble)
  const facturesTries = (compact || controlSort)
    ? factures
    : sortRows(factures as unknown as Record<string, unknown>[], sortColInt, sortDirInt) as unknown as FactureDetail[]

  const thProps = { sort: sortCol, dir: sortDir, onSort: handleSort }

  return (
    <>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-white border-b border-gray-200">
            {!compact && <ColTh label="Code" col="code_client" {...thProps} align="left" />}
            {!compact && <ColTh label="Nom" col="nom_client" {...thProps} align="left" />}
            {compact
              ? <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">N° Facture</th>
              : <ColTh label="N° Facture" col="numero_piece" {...thProps} align="left" />
            }
            {compact
              ? <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Montant TTC</th>
              : <ColTh label="Montant TTC" col="montant_ttc" {...thProps} align="right" />
            }
            {compact
              ? <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Restant Dû</th>
              : <ColTh label="Restant Dû" col="reste_du" {...thProps} align="right" />
            }
            {compact
              ? <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ancienneté</th>
              : <ColTh label="Ancienneté" col="date_emission" {...thProps} align="center" />
            }
            {compact
              ? <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
              : <ColTh label="Statut" col="statut_facture" {...thProps} align="left" />
            }
            <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center">Historique</th>
            {onOuvrirCommentaire && (
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center">Commentaire</th>
            )}
          </tr>
        </thead>
        <tbody>
          {facturesTries.map(f => {
            const estCompte = f.numero_piece.endsWith('_compte')
            const estSolde     = Math.abs(f.reste_du) <= 0.005
            const estNegatif   = f.reste_du < -0.005
            const estImpayeTotal = !f.est_avoir && !estCompte && !estNegatif && !estSolde && f.montant_ttc > 0.005 && (f.reste_du / f.montant_ttc) >= 0.995
            const restantCls = estSolde ? 'text-gray-300' : estNegatif ? 'text-ockham-teal font-bold' : estImpayeTotal ? 'text-red-600' : 'text-amber-600'
            const isAvoir = f.est_avoir || f.montant_ttc < 0
            return (
              <tr key={f.numero_piece} className={`border-b border-gray-50 transition-colors ${estCompte ? 'bg-ockham-teal-muted/40 hover:bg-ockham-teal-muted/70' : 'bg-white hover:bg-slate-50'}`}>
                {!compact && (
                  <td className="px-3 py-2">
                    <span className="font-mono text-[10px] font-bold text-ockham-teal bg-ockham-teal-muted px-1.5 py-0.5 rounded">{f.code_client}</span>
                  </td>
                )}
                {!compact && (
                  <td className="px-3 py-2">
                    {f.nom_client && <span className="text-xs text-gray-600">{f.nom_client}</span>}
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <NumeroPiece numero={f.numero_piece} className="font-mono font-semibold text-ockham-teal-dark" />
                    {estCompte ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-ockham-teal-dark text-white">COMPTE</span>
                    ) : (
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${isAvoir ? 'bg-orange-100 text-orange-700' : 'bg-ockham-teal-muted text-ockham-teal'}`}>
                        {isAvoir ? 'A' : 'F'}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-700">{fmt(f.montant_ttc)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  <span className={restantCls}>{fmt(f.reste_du)}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  {f.date_emission
                    ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${badgeAnc(anciennete(f.date_emission))}`}>{anciennete(f.date_emission)}j</span>
                    : <span className="text-gray-300">—</span>
                  }
                </td>
                <td className="px-3 py-2">
                  <StatutBadge statut={f.statut_facture} estSolde={estSolde} onClick={e => handleStatutClick(e, f.numero_piece)} />
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={e => { e.stopPropagation(); onHistorique(f) }}
                    className="flex items-center gap-1 text-[10px] font-semibold text-ockham-teal bg-ockham-teal-muted border border-ockham-teal/40 px-2 py-0.5 rounded hover:bg-ockham-teal/10 transition-colors whitespace-nowrap"
                  >
                    📋 Historique
                  </button>
                </td>
                {onOuvrirCommentaire && (
                  <td className="px-3 py-2 text-center">
                    {!estCompte && (
                      <button
                        onClick={e => { e.stopPropagation(); onOuvrirCommentaire(f) }}
                        className={`flex items-center gap-1 text-[10px] font-semibold border px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                          commentaires?.get(f.numero_piece)?.ne_pas_relancer
                            ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                            : (commentaires?.get(f.numero_piece)?.commentaire ?? '').trim().length > 0
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-ockham-teal-muted text-ockham-teal-dark border-ockham-teal/40 hover:bg-ockham-teal/10'
                        }`}
                      >
                        💬 Commentaire
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Popup statut facture */}
      {popupOpen && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[160px]"
          style={{ top: popupPos.current.top, left: popupPos.current.left }}
          onMouseLeave={() => setPopupOpen(null)}
        >
          {STATUTS.map(s => (
            <button
              key={String(s.val)}
              onClick={() => { onStatutChange(popupOpen, s.val); setPopupOpen(null) }}
              className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-gray-50 transition-colors text-gray-700"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
