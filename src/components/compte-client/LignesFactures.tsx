// Sous-tableau factures partagé entre la vue clients (expand) et la vue factures flat
import { useState, useRef } from 'react'
import type { FactureDetail, StatutFacture } from '../../types/client'

interface Props {
  factures: FactureDetail[]
  chargement: boolean
  onStatutChange: (numero: string, statut: StatutFacture | null) => void
  onHistorique: (fac: FactureDetail) => void
  compact?: boolean
}

// Instances créées une seule fois — toLocaleDateString recrée Intl.DateTimeFormat à chaque appel (lent)
const _fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const _fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
const _today = new Date()

function fmt(n: number) { return _fmt.format(n) + ' €' }
function fmtDate(iso: string | null) { return iso ? _fmtDate.format(new Date(iso)) : '—' }
function estRetard(iso: string | null) { return !!iso && new Date(iso) < _today }

const STATUTS: { val: StatutFacture | null; label: string }[] = [
  { val: 'litige', label: '⚠ Litige' },
  { val: 'provisionne', label: '📦 Provisionné' },
  { val: null, label: '✕ Effacer' },
]

function StatutBadge({ statut, onClick }: { statut: StatutFacture | null; onClick: (e: React.MouseEvent) => void }) {
  if (statut === 'litige')
    return <span onClick={onClick} className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">⚠ Litige</span>
  if (statut === 'provisionne')
    return <span onClick={onClick} className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">📦 Provisionné</span>
  return <span onClick={onClick} className="cursor-pointer inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600">— statut</span>
}

export function LignesFactures({ factures, chargement, onStatutChange, onHistorique, compact }: Props) {
  const [popupOpen, setPopupOpen] = useState<string | null>(null)
  const popupPos = useRef<{ top: number; left: number }>({ top: 0, left: 0 })

  function handleStatutClick(e: React.MouseEvent, numero: string) {
    e.stopPropagation()
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

  return (
    <>
      <table className="w-full text-xs">
        <thead>
          <tr className={`border-b border-gray-100 ${compact ? 'bg-blue-50' : 'bg-gray-50'}`}>
            <th className="w-5 px-2 py-2" />
            {!compact && <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Client</th>}
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">N° Facture</th>
            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Montant HT</th>
            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Montant TTC</th>
            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Restant Dû</th>
            <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Émission</th>
            <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Échéance</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {factures.map(f => {
            const retard = estRetard(f.date_echeance) && f.reste_du > 0.005
            const estSolde     = Math.abs(f.reste_du) <= 0.005
            const estNegatif   = f.reste_du < -0.005
            const estImpayeTotal = !f.est_avoir && !estNegatif && !estSolde && f.montant_ttc > 0.005 && (f.reste_du / f.montant_ttc) >= 0.995
            const restantCls = estSolde ? 'text-gray-300' : estNegatif ? 'text-emerald-600' : estImpayeTotal ? 'text-red-600' : 'text-amber-600'
            const isAvoir = f.est_avoir || f.montant_ttc < 0
            return (
              <tr key={f.numero_piece} className="border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                <td className="px-2 py-2 text-center">
                  {f.statut_facture && <span className="text-amber-500 text-[11px]">⚠</span>}
                </td>
                {!compact && (
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{f.code_client}</span>
                      {f.nom_client && <span className="text-xs text-gray-600">{f.nom_client}</span>}
                    </div>
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-blue-700">{f.numero_piece}</span>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${isAvoir ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-500'}`}>
                      {isAvoir ? 'A' : 'F'}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-600">
                  {f.montant_ht != null ? fmt(f.montant_ht) : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-700">{fmt(f.montant_ttc)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  <span className={restantCls}>{fmt(f.reste_du)}</span>
                </td>
                <td className="px-3 py-2 text-center text-gray-500">{fmtDate(f.date_emission)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={retard ? 'text-red-600 font-semibold' : 'text-gray-500'}>{fmtDate(f.date_echeance)}</span>
                </td>
                <td className="px-3 py-2">
                  <StatutBadge statut={f.statut_facture} onClick={e => handleStatutClick(e, f.numero_piece)} />
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={e => { e.stopPropagation(); onHistorique(f) }}
                    className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors whitespace-nowrap"
                  >
                    📋 Historique
                  </button>
                </td>
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
