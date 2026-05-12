// Ligne 3 — Top clients, Top factures, Balance âgée
import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import type { useDashboard, TopNb } from '../../hooks/useDashboard'
import { ModalClientTdb } from './ModalClientTdb'

type Props = ReturnType<typeof useDashboard>

const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const _fmtK = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }
function fmtK(n: number) { return n >= 1000 ? _fmtK.format(n / 1000) + 'k€' : _fmtK.format(n) + '€' }

const AGE_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444', '#991b1b']
const BLUE_700 = '#1d4ed8'

function TooltipEuro({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-0.5">{label}</p>
      <p className="text-gray-900 dark:text-gray-100 font-mono">{fmtEuro(payload[0].value)}</p>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 dark:border-slate-700 px-5 py-3">
      <h3 className="text-xs font-semibold text-blue-900 dark:text-blue-300">{children}</h3>
    </div>
  )
}

export function BlocAnalyse({ topClients, topNbClients, setTopNbClients, topFactures, balanceAgee }: Props) {
  const [clientModal, setClientModal] = useState<{ code: string; nom: string } | null>(null)
  const maxMontantClient = topClients[0]?.montant ?? 1

  return (
    <>
      <div className="grid grid-cols-3 gap-3">

        {/* Top clients */}
        <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="border-b border-gray-100 dark:border-slate-700 px-5 py-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-blue-900 dark:text-blue-300">Top clients — impayés</h3>
            <div className="flex gap-1">
              {([5, 10, 15] as TopNb[]).map(n => (
                <button
                  key={n}
                  onClick={() => setTopNbClients(n)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${topNbClients === n ? 'bg-blue-700 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {topClients.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500 py-8">Aucun impayé</div>
            ) : (
              <ul className="divide-y divide-gray-50 dark:divide-slate-700">
                {topClients.map((c, i) => (
                  <li key={c.code} className="px-5 py-2.5 flex items-center gap-3">
                    <span className="text-[10px] font-bold text-gray-300 dark:text-slate-600 w-4 text-right flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setClientModal({ code: c.code, nom: c.nom })}
                        className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline truncate block text-left w-full"
                      >
                        {c.nom}
                      </button>
                      <div className="mt-1 h-1 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(c.montant / maxMontantClient) * 100}%`, background: BLUE_700 }} />
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300 flex-shrink-0 tabular-nums">{fmtK(c.montant)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Top factures */}
        <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <SectionHeader>Top 10 factures — montant restant</SectionHeader>
          <div className="flex-1 overflow-auto">
            {topFactures.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500 py-8">Aucune facture impayée</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">N° / Client</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Restant</th>
                    <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Retard</th>
                  </tr>
                </thead>
                <tbody>
                  {topFactures.map(f => (
                    <tr key={f.numero} className="border-b border-gray-50 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="px-3 py-2">
                        <p className="font-mono font-semibold text-[11px]" style={{ color: BLUE_700 }}>{f.numero}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[130px]">{f.nomClient}</p>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 dark:text-gray-200 tabular-nums">{fmtK(f.montant)}</td>
                      <td className="px-3 py-2 text-center">
                        {f.joursRetard > 0 ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${f.joursRetard > 90 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : f.joursRetard > 30 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                            {f.joursRetard}j
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Non échu</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Balance âgée */}
        <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <SectionHeader>Balance âgée des créances</SectionHeader>
          <div className="flex-1 p-4 flex flex-col gap-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={balanceAgee} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={42} />
                <Tooltip content={<TooltipEuro />} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="montant" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {balanceAgee.map((_, i) => <Cell key={i} fill={AGE_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-1">
              {balanceAgee.map((t, i) => (
                <div key={t.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: AGE_COLORS[i] }} />
                    <span className="text-gray-600 dark:text-gray-400">{t.label}</span>
                  </div>
                  <span className={`font-mono font-semibold tabular-nums ${t.montant > 0 ? 'text-gray-800 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'}`}>
                    {fmtEuro(t.montant)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Modal client */}
      {clientModal && (
        <ModalClientTdb
          code={clientModal.code}
          nom={clientModal.nom}
          onClose={() => setClientModal(null)}
        />
      )}
    </>
  )
}
