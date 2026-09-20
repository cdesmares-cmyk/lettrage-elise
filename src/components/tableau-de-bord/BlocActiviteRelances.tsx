import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { useDashboard, MoisActiviteRelance } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

const _fmtK    = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtK(n: number)    { return n >= 1000 ? _fmtK.format(n / 1000) + 'k€' : _fmtK.format(n) + '€' }
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }
function fmtNb(n: number)   { return _fmtK.format(n) }

function labelMois(mois: string): string {
  // mois = '2026-09-01' (date renvoyée par la RPC)
  return new Date(mois + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
}

function TooltipRelances({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; payload: MoisActiviteRelance & { label: string } }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[190px]">
      <p className="font-semibold text-gray-600 mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Montant relancé</span>
          <span className="font-mono font-semibold text-gray-800 tabular-nums">{fmtEuro(d.montant)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Clients relancés</span>
          <span className="font-semibold text-gray-700">{fmtNb(d.nb_clients)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Relances envoyées</span>
          <span className="font-semibold text-gray-700">{fmtNb(d.nb_relances)}</span>
        </div>
      </div>
    </div>
  )
}

export function BlocActiviteRelances({ activiteRelances }: Props) {
  if (!activiteRelances.length) return null

  const data = activiteRelances.map(m => ({
    ...m,
    label: labelMois(m.mois),
  }))

  const totalRelances = activiteRelances.reduce((s, m) => s + m.nb_relances, 0)
  const totalMontant  = activiteRelances.reduce((s, m) => s + m.montant, 0)

  // Clients relancés uniques : somme des nb_clients par mois (approx. — un client peut apparaître sur plusieurs mois)
  const totalClientsMois = activiteRelances.reduce((s, m) => s + m.nb_clients, 0)

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-800">Activité recouvrement</h3>
          {totalMontant > 0 && (
            <span className="text-[11px] font-mono font-bold text-gray-600">{fmtEuro(totalMontant)}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Clients</span>
            <span className="text-[11px] font-bold text-gray-700">{fmtNb(totalClientsMois)}</span>
            <span className="text-[9px] text-gray-300 ml-0.5 mr-2">·</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Relances</span>
            <span className="text-[11px] font-bold text-gray-700">{fmtNb(totalRelances)}</span>
          </div>
          <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
            6 mois
          </span>
        </div>
      </div>

      <div className="p-5">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={46} />
            <Tooltip content={<TooltipRelances />} cursor={{ fill: '#f9fafb' }} />
            <Bar dataKey="montant" name="Montant relancé" fill="#C07840" radius={[3, 3, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>

        {/* Légende nb_relances vs nb_clients par mois */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
          {data.map(m => (
            <div key={m.mois} className="flex-shrink-0 text-center" style={{ minWidth: 52 }}>
              <p className="text-[9px] text-gray-400 font-semibold">{m.label}</p>
              <p className="text-[10px] font-bold text-gray-700 tabular-nums">{m.nb_clients}c</p>
              <p className="text-[9px] text-gray-400 tabular-nums">{m.nb_relances}r</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
