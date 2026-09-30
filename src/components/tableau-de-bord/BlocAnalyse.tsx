import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import type { useDashboard, TopNb } from '../../hooks/useDashboard'
import { ModalClientTdb } from './ModalClientTdb'

type Props = ReturnType<typeof useDashboard>

const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const _fmtK    = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }
function fmtK(n: number)    { return n >= 1000 ? _fmtK.format(n / 1000) + 'k€' : _fmtK.format(n) + '€' }
function fmtNb(n: number)   { return _fmtK.format(n) }

const AGE_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444', '#991b1b']

function TooltipEuro({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-0.5">{label}</p>
      <p className="text-gray-900 font-mono">{fmtEuro(payload[0].value)}</p>
    </div>
  )
}

function CardHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
      <h3 className="text-sm font-bold text-gray-800">{children}</h3>
      {action}
    </div>
  )
}

export function BlocAnalyse({
  topClients, topNbClients, setTopNbClients,
  topFactures, topNbFactures, setTopNbFactures, balanceAgee,
  portefeuilles, filtrePortefeuille, setFiltrePortefeuille,
  resumePortefeuille, couvertureRelance,
}: Props) {
  const [clientModal, setClientModal] = useState<{ code: string; nom: string } | null>(null)
  const maxMontantClient = topClients[0]?.montant ?? 1

  const cv = couvertureRelance
  const pctRelances = cv.enRetard > 0 ? Math.round((cv.relances / cv.enRetard) * 100) : 0

  return (
    <>
      {/* Bandeau portefeuille — cadre CE bloc, et lui seul. Les tuiles du haut
          restent globales : le DSO n'est pas découpable par portefeuille. */}
      {portefeuilles.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-5 py-3 mb-3 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">Portefeuille</span>
            <div className="relative">
              <select
                value={filtrePortefeuille}
                onChange={e => setFiltrePortefeuille(e.target.value)}
                aria-label="Choisir un portefeuille"
                className={`text-xs font-semibold pl-3 pr-8 py-1.5 rounded-lg border appearance-none bg-white outline-none transition-colors cursor-pointer ${
                  filtrePortefeuille
                    ? 'border-ockham-teal text-ockham-teal'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <option value="">Tout le portefeuille</option>
                {portefeuilles.map(p => (
                  <option key={p.id} value={p.id}>{p.label} — {fmtNb(p.nb)}</option>
                ))}
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
            </div>
          </div>

          <div className="flex items-baseline gap-4 text-xs">
            <span className="font-mono font-bold text-gray-800 tabular-nums">{fmtEuro(resumePortefeuille.encours)}</span>
            <span className="text-gray-400">
              <span className="font-semibold text-gray-600 tabular-nums">{fmtNb(resumePortefeuille.clients)}</span> clients
            </span>
            <span className="text-gray-400">
              <span className="font-semibold text-gray-600 tabular-nums">{fmtNb(resumePortefeuille.factures)}</span> pièces
            </span>
          </div>

          {/* Couverture de relance. Dénominateur : les clients EN RETARD — les
              seuls sur lesquels une relance a un sens. Et on met en avant le
              nombre à traiter, pas le pourcentage manquant : une liste de
              travail, pas un jugement. */}
          {cv.enRetard > 0 && (
            <div className="flex items-center gap-3 ml-auto min-w-[260px]">
              <div className="flex-1">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-[.08em] text-gray-400">
                    Couverture de relance
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {fmtNb(cv.enRetard)} client{cv.enRetard > 1 ? 's' : ''} en retard
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
                  <div className="h-full bg-ockham-teal" style={{ width: `${pctRelances}%` }} />
                </div>
                <div className="flex items-baseline justify-between mt-1 text-[11px]">
                  <span className="text-ockham-teal font-semibold tabular-nums">
                    {fmtNb(cv.relances)} relancé{cv.relances > 1 ? 's' : ''} ce mois
                  </span>
                  <span className={`font-semibold tabular-nums ${cv.enAttente > 0 ? 'text-ockham-copper' : 'text-gray-400'}`}>
                    {fmtNb(cv.enAttente)} en attente
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">

        {/* Top clients */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <CardHeader
            action={
              <div className="flex gap-1">
                {([5, 10, 15] as TopNb[]).map(n => (
                  <button
                    key={n}
                    onClick={() => setTopNbClients(n)}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
                      topNbClients === n
                        ? 'bg-ockham-teal text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            }
          >
            Top clients — impayés
          </CardHeader>
          <div className="flex-1 overflow-auto">
            {topClients.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-gray-400 py-8">Aucun impayé</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {topClients.map((c, i) => (
                  <li key={c.code} className="px-5 py-2.5 flex items-center gap-3">
                    <span className="text-[10px] font-bold text-gray-300 w-4 text-right flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setClientModal({ code: c.code, nom: c.nom })}
                        className="text-xs font-semibold text-ockham-teal hover:underline truncate block text-left w-full"
                      >
                        {c.nom}
                      </button>
                      <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-ockham-teal" style={{ width: `${(c.montant / maxMontantClient) * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-gray-700 flex-shrink-0 tabular-nums">{fmtK(c.montant)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Top factures */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <CardHeader
            action={
              <div className="flex gap-1">
                {([5, 10, 15] as TopNb[]).map(n => (
                  <button
                    key={n}
                    onClick={() => setTopNbFactures(n)}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
                      topNbFactures === n
                        ? 'bg-ockham-teal text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            }
          >
            Top factures — montant restant
          </CardHeader>
          <div className="flex-1 overflow-auto">
            {topFactures.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-gray-400 py-8">Aucune facture impayée</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">N° / Client</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Restant</th>
                    <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Retard</th>
                  </tr>
                </thead>
                <tbody>
                  {topFactures.map(f => (
                    <tr key={f.numero} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <p className="font-mono font-semibold text-[11px] text-ockham-teal">{f.numero}</p>
                        <p className="text-[10px] text-gray-400 truncate max-w-[130px]">{f.nomClient}</p>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 tabular-nums">{fmtK(f.montant)}</td>
                      <td className="px-3 py-2 text-center">
                        {f.joursRetard > 0 ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            f.joursRetard > 90 ? 'bg-red-100 text-red-700'
                            : f.joursRetard > 30 ? 'bg-orange-100 text-orange-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>
                            {f.joursRetard}j
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-medium">Non échu</span>
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
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <CardHeader>Balance âgée des créances</CardHeader>
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
                    <span className="text-gray-600">{t.label}</span>
                  </div>
                  <span className={`font-mono font-semibold tabular-nums ${t.montant > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                    {fmtEuro(t.montant)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

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
