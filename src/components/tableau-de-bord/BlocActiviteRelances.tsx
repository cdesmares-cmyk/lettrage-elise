import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { useDashboard, PeriodeEncaissement } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

const _fmtK    = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtK(n: number)    { return n >= 1000 ? _fmtK.format(n / 1000) + 'k€' : _fmtK.format(n) + '€' }
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }
function fmtNb(n: number)   { return _fmtK.format(n) }

const PERIODES: { val: PeriodeEncaissement; label: string }[] = [
  { val: 'jour',      label: '7 jours'    },
  { val: 'semaine',   label: '12 sem.'    },
  { val: 'mois',      label: '12 mois'    },
  { val: 'trimestre', label: 'Trimestres' },
  { val: 'annee',     label: 'Années'     },
]

function TooltipActivite({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const relances = payload.find(p => p.name === 'Relances envoyées')
  const montant  = payload.find(p => p.name === 'Montant relancé')
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[190px]">
      <p className="font-semibold text-gray-600 mb-2">{label}</p>
      <div className="space-y-1.5">
        {montant && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-[2px] rounded-full flex-shrink-0" style={{ background: montant.color }} />
              <span className="text-gray-400">{montant.name}</span>
            </div>
            <span className="font-mono font-semibold text-gray-800 tabular-nums">{fmtEuro(montant.value)}</span>
          </div>
        )}
        {relances && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: relances.color }} />
              <span className="text-gray-400">{relances.name}</span>
            </div>
            <span className="font-semibold text-gray-700 tabular-nums">{fmtNb(relances.value)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function BlocActiviteRelances({ pointsActiviteRelances, periodeActiviteRelances, setPeriodeActiviteRelances }: Props) {
  if (!pointsActiviteRelances.length) return null

  const hasData = pointsActiviteRelances.some(p => p.nb_relances > 0)

  const totalRelances = pointsActiviteRelances.reduce((s, p) => s + p.nb_relances, 0)
  const totalMontant  = pointsActiviteRelances.reduce((s, p) => s + p.montant, 0)

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-800">Activité recouvrement</h3>
          {totalMontant > 0 && (
            <span className="text-[11px] font-mono font-bold text-gray-600">{fmtEuro(totalMontant)}</span>
          )}
          {totalRelances > 0 && (
            <span className="text-[11px] text-gray-400">
              · <span className="font-semibold text-gray-600">{fmtNb(totalRelances)}</span> relances
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {PERIODES.map(p => (
            <button
              key={p.val}
              onClick={() => setPeriodeActiviteRelances(p.val)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-colors ${
                periodeActiviteRelances === p.val
                  ? 'bg-ockham-navy text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {!hasData ? (
          <div className="flex items-center justify-center h-48 text-xs text-gray-400">
            Aucune relance envoyée sur la période
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={pointsActiviteRelances} margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              {/* Axe gauche — nb relances */}
              <YAxis
                yAxisId="left"
                tickFormatter={fmtNb}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={36}
                allowDecimals={false}
              />
              {/* Axe droit — montant */}
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={fmtK}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip content={<TooltipActivite />} cursor={{ fill: '#f9fafb' }} />
              <Bar
                yAxisId="left"
                dataKey="nb_relances"
                name="Relances envoyées"
                fill="#4CC5BB"
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
              />
              <Line
                yAxisId="right"
                dataKey="montant"
                name="Montant relancé"
                stroke="#C07840"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#C07840' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
