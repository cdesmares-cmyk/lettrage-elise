// Bloc 2 — Graphique des encaissements
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { useDashboard, PeriodeEncaissement } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

const _fmtK = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtK(n: number) { return n >= 1000 ? _fmtK.format(n / 1000) + 'k€' : _fmtK.format(n) + '€' }
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }

const PERIODES: { val: PeriodeEncaissement; label: string }[] = [
  { val: 'semaine', label: 'Semaine' },
  { val: 'mois', label: '12 mois' },
  { val: 'trimestre', label: 'Trimestres' },
  { val: 'annee', label: 'Années' },
]

function TooltipCustom({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[160px]">
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
    </div>
  )
}

export function BlocEncaissements({
  pointsEncaissement, periodeEncaissement, setPeriodeEncaissement,
  afficherNm1, setAfficherNm1, labelPeriodePrec,
}: Props) {
  const totalCourant = pointsEncaissement.reduce((s, p) => s + p.courant, 0)
  const totalPrec = pointsEncaissement.reduce((s, p) => s + p.precedent, 0)
  const evolution = totalPrec > 0 ? ((totalCourant - totalPrec) / totalPrec) * 100 : null

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-gray-700">Encaissements</h3>
          {totalCourant > 0 && (
            <span className="text-[11px] font-mono font-bold text-gray-600">{fmtEuro(totalCourant)}</span>
          )}
          {afficherNm1 && evolution !== null && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${evolution >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {evolution >= 0 ? '▲' : '▼'} {Math.abs(evolution).toFixed(1)}% vs {labelPeriodePrec}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Période */}
          <div className="flex gap-1">
            {PERIODES.map(p => (
              <button
                key={p.val}
                onClick={() => setPeriodeEncaissement(p.val)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-colors ${periodeEncaissement === p.val ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Toggle N-1 */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className="text-[10px] text-gray-500 font-medium">{labelPeriodePrec}</span>
            <button
              onClick={() => setAfficherNm1(!afficherNm1)}
              className={`relative w-7 h-4 rounded-full transition-colors ${afficherNm1 ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${afficherNm1 ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </button>
          </label>
        </div>
      </div>

      <div className="p-5">
        {pointsEncaissement.every(p => p.courant === 0 && p.precedent === 0) ? (
          <div className="flex items-center justify-center h-48 text-xs text-gray-400">
            Aucun encaissement enregistré sur la période
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={pointsEncaissement} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmtK}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              <Tooltip content={<TooltipCustom />} cursor={{ fill: '#f9fafb' }} />
              {afficherNm1 && (
                <Legend
                  iconType="square"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                />
              )}
              {afficherNm1 && (
                <Bar
                  dataKey="precedent"
                  name={labelPeriodePrec}
                  fill="#bfdbfe"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={afficherNm1 ? 18 : 36}
                />
              )}
              <Bar
                dataKey="courant"
                name="Encaissements"
                fill="#1d4ed8"
                radius={[3, 3, 0, 0]}
                maxBarSize={afficherNm1 ? 18 : 36}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
