import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { useDashboard, PeriodeEncaissement } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

const _fmtK    = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtK(n: number)    { return n >= 1000 ? _fmtK.format(n / 1000) + 'k€' : _fmtK.format(n) + '€' }
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }

const PERIODES: { val: PeriodeEncaissement; label: string }[] = [
  { val: 'jour',      label: '7 jours'    },
  { val: 'semaine',   label: '12 sem.'    },
  { val: 'mois',      label: '12 mois'    },
  { val: 'trimestre', label: 'Trimestres' },
  { val: 'annee',     label: 'Années'     },
]

function TooltipCustom({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + p.value, 0)
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[180px]">
      <p className="font-semibold text-gray-600 mb-1.5">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
            <span className="text-gray-500">{p.name}</span>
          </div>
          <span className="font-mono font-semibold text-gray-800 tabular-nums">{fmtEuro(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && total > 0 && (
        <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t border-gray-100">
          <span className="text-gray-400">Total</span>
          <span className="font-mono font-bold text-gray-800 tabular-nums">{fmtEuro(total)}</span>
        </div>
      )}
    </div>
  )
}

export function BlocEncaissements({
  pointsEncaissement, periodeEncaissement, setPeriodeEncaissement,
}: Props) {
  const totalClient = pointsEncaissement.reduce((s, p) => s + p.client, 0)
  const totalAutres = pointsEncaissement.reduce((s, p) => s + p.autres, 0)
  const totalCourant = totalClient + totalAutres
  const hasAutres = totalAutres > 0

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-800">Encaissements</h3>
          {totalCourant > 0 && (
            <span className="text-[11px] font-mono font-bold text-gray-600">{fmtEuro(totalCourant)}</span>
          )}
        </div>
        <div className="flex gap-1">
          {PERIODES.map(p => (
            <button
              key={p.val}
              onClick={() => setPeriodeEncaissement(p.val)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-colors ${
                periodeEncaissement === p.val
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
        {pointsEncaissement.every(p => p.client === 0 && p.autres === 0) ? (
          <div className="flex items-center justify-center h-48 text-xs text-gray-400">
            Aucun encaissement enregistré sur la période
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={pointsEncaissement} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={46} />
              <Tooltip content={<TooltipCustom />} cursor={{ fill: '#f9fafb' }} />
              {hasAutres && (
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
              )}
              <Bar dataKey="client" name="Crédits clients" stackId="a" fill="#4CC5BB" radius={hasAutres ? [0, 0, 0, 0] : [3, 3, 0, 0]} maxBarSize={36} />
              {hasAutres && (
                <Bar dataKey="autres" name="Autres (471)" stackId="a" fill="#1B2A4A" radius={[3, 3, 0, 0]} maxBarSize={36} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
