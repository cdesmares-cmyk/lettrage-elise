// Bloc 3 — Widgets personnalisables (préférences en localStorage)
import { useState, useMemo } from 'react'
import type { useDashboard } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }

const LS_KEY = 'dashboard_widgets_v1'
const TOUS_WIDGETS = ['surveiller', 'avoirs', 'concentration', 'annotees'] as const
type WidgetId = typeof TOUS_WIDGETS[number]

const WIDGET_META: Record<WidgetId, { label: string; description: string }> = {
  surveiller: { label: 'Clients à surveiller', description: '3+ impayées échues' },
  avoirs: { label: 'Avoirs ouverts', description: 'Avoirs non soldés' },
  concentration: { label: 'Concentration', description: 'Part des top 3 clients' },
  annotees: { label: 'Factures annotées', description: 'Litige & Provisionné' },
}

function readPrefs(): WidgetId[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as WidgetId[]
  } catch { /* ignore */ }
  return ['surveiller', 'concentration', 'annotees']
}

function WidgetSurveiller({ factures }: Props) {
  const alertes = useMemo(() => {
    const map = new Map<string, { code: string; nom: string; nb: number; total: number }>()
    factures
      .filter(f => f.reste_du > 0.005)
      .forEach(f => {
        const ech = f.date_echeance ? new Date(f.date_echeance) : new Date(new Date(f.date_emission).getTime() + 15 * 86400000)
        if (ech >= new Date()) return
        const e = map.get(f.code_client)
        if (e) { e.nb++; e.total += f.reste_du }
        else map.set(f.code_client, { code: f.code_client, nom: f.nom_client ?? f.code_client, nb: 1, total: f.reste_du })
      })
    return [...map.values()].filter(c => c.nb >= 3).sort((a, b) => b.total - a.total).slice(0, 8)
  }, [factures])

  if (!alertes.length) return <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">Aucun client avec 3+ factures échues</p>
  return (
    <ul className="divide-y divide-gray-50 dark:divide-slate-700 -mx-4">
      {alertes.map(c => (
        <li key={c.code} className="px-4 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{c.nom}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{c.nb} factures échues</p>
          </div>
          <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400 tabular-nums flex-shrink-0">{fmtEuro(c.total)}</span>
        </li>
      ))}
    </ul>
  )
}

function WidgetAvoirs({ factures }: Props) {
  const avoirs = useMemo(() =>
    factures.filter(f => f.est_avoir || f.reste_du < -0.005).sort((a, b) => a.reste_du - b.reste_du).slice(0, 8),
    [factures]
  )
  if (!avoirs.length) return <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">Aucun avoir non soldé</p>
  return (
    <ul className="divide-y divide-gray-50 dark:divide-slate-700 -mx-4">
      {avoirs.map(f => (
        <li key={f.numero_piece} className="px-4 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-semibold text-ockham-teal dark:text-ockham-teal-light truncate">{f.numero_piece}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{f.nom_client ?? f.code_client}</p>
          </div>
          <span className="text-xs font-mono font-bold text-ockham-teal dark:text-ockham-teal-light tabular-nums flex-shrink-0">{fmtEuro(f.reste_du)}</span>
        </li>
      ))}
    </ul>
  )
}

function WidgetConcentration({ clients }: Props) {
  const encoursCourant = useMemo(() => clients.reduce((s, c) => s + c.encours_total, 0), [clients])
  const top3 = useMemo(() => [...clients].sort((a, b) => b.encours_total - a.encours_total).slice(0, 3), [clients])
  const totalTop3 = top3.reduce((s, c) => s + c.encours_total, 0)
  const pct = encoursCourant > 0 ? (totalTop3 / encoursCourant) * 100 : 0
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <span className={`text-3xl font-bold tabular-nums ${pct > 60 ? 'text-red-600 dark:text-red-400' : pct > 40 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {pct.toFixed(1)}%
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 pb-1">du total encours (top 3 clients)</span>
      </div>
      <ul className="space-y-2">
        {top3.map((c, i) => (
          <li key={c.code_dso} className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-300 dark:text-slate-600 w-3">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 truncate">{c.nom}</span>
                <span className="text-[11px] font-mono text-gray-600 dark:text-gray-400 flex-shrink-0 ml-2">{fmtEuro(c.encours_total)}</span>
              </div>
              <div className="h-1 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-ockham-teal rounded-full" style={{ width: `${encoursCourant > 0 ? (c.encours_total / encoursCourant) * 100 : 0}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WidgetAnnotees({ factures }: Props) {
  const litiges = useMemo(() => factures.filter(f => f.statut_facture === 'litige'), [factures])
  const provisions = useMemo(() => factures.filter(f => f.statut_facture === 'provisionne'), [factures])
  const totalLitige = litiges.reduce((s, f) => s + f.reste_du, 0)
  const totalProv = provisions.reduce((s, f) => s + f.reste_du, 0)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">⚠ Litige</p>
          <p className="text-lg font-bold text-red-700 dark:text-red-400 tabular-nums">{litiges.length}</p>
          <p className="text-[10px] text-red-500 dark:text-red-500 font-mono">{fmtEuro(totalLitige)}</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/40 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wider mb-1">📦 Provisionné</p>
          <p className="text-lg font-bold text-orange-700 dark:text-orange-400 tabular-nums">{provisions.length}</p>
          <p className="text-[10px] text-orange-500 dark:text-orange-500 font-mono">{fmtEuro(totalProv)}</p>
        </div>
      </div>
      {litiges.slice(0, 4).map(f => (
        <div key={f.numero_piece} className="flex items-center justify-between text-xs">
          <span className="font-mono text-ockham-teal dark:text-ockham-teal-light truncate">{f.numero_piece}</span>
          <span className="font-mono text-red-600 dark:text-red-400 font-semibold">{fmtEuro(f.reste_du)}</span>
        </div>
      ))}
    </div>
  )
}

export function BlocPersonnalise(props: Props) {
  const [actifs, setActifs] = useState<WidgetId[]>(readPrefs)
  const [editMode, setEditMode] = useState(false)

  function toggle(id: WidgetId) {
    setActifs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      localStorage.setItem(LS_KEY, JSON.stringify(next))
      return next
    })
  }

  const WIDGET_CONTENT: Record<WidgetId, React.ReactNode> = {
    surveiller: <WidgetSurveiller {...props} />,
    avoirs: <WidgetAvoirs {...props} />,
    concentration: <WidgetConcentration {...props} />,
    annotees: <WidgetAnnotees {...props} />,
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 dark:border-slate-700 px-5 py-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ockham-teal-dark dark:text-ockham-teal-light">Vue personnalisée</h3>
        <button
          onClick={() => setEditMode(e => !e)}
          className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-colors ${editMode ? 'bg-ockham-teal text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
        >
          ⊕ Personnaliser
        </button>
      </div>

      {editMode && (
        <div className="px-5 py-3 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 flex flex-wrap gap-2">
          {TOUS_WIDGETS.map(id => (
            <button
              key={id}
              onClick={() => toggle(id)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${actifs.includes(id) ? 'bg-ockham-teal text-white border-ockham-teal' : 'bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-slate-600 hover:border-gray-400'}`}
            >
              {actifs.includes(id) ? '✓ ' : '+ '}
              {WIDGET_META[id].label}
              <span className="ml-1 opacity-60 font-normal">— {WIDGET_META[id].description}</span>
            </button>
          ))}
        </div>
      )}

      {actifs.length === 0 ? (
        <div className="px-5 py-10 text-center text-xs text-gray-400 dark:text-gray-500">
          Aucun widget actif — cliquez sur "Personnaliser" pour en ajouter.
        </div>
      ) : (
        <div className={`grid gap-px bg-gray-100 dark:bg-slate-700 ${actifs.length === 1 ? 'grid-cols-1' : actifs.length === 2 ? 'grid-cols-2' : actifs.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
          {actifs.map(id => (
            <div key={id} className="bg-white dark:bg-slate-800 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ockham-teal-dark dark:text-ockham-teal-light mb-3">{WIDGET_META[id].label}</p>
              {WIDGET_CONTENT[id]}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
