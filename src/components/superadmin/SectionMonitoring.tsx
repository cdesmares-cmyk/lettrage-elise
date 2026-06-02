import { useState } from 'react'
import { type CronRun, dotStatut, type DotStatut } from '../../hooks/useSuperAdmin'

function IcChevron({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

function Dot({ statut }: { statut: DotStatut }) {
  const cls = { ok: 'bg-green-500', erreur: 'bg-red-500', silencieux: 'bg-amber-400', jamais: 'bg-gray-300' }
  const lbl = { ok: 'Dernière exécution OK', erreur: 'Erreur détectée', silencieux: 'Inactif depuis +48h', jamais: 'Jamais exécuté' }
  return <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${cls[statut]}`} title={lbl[statut]} />
}

function formaterDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface Groupe { fonction: string; orgId: string | null; orgNom: string | null }

export function SectionMonitoring({ runs }: { runs: CronRun[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (runs.length === 0) return null

  const groupes: Groupe[] = [...new Map(
    runs.map(r => {
      const k = `${r.fonction}||${r.organisation_id ?? ''}`
      return [k, { fonction: r.fonction, orgId: r.organisation_id, orgNom: r.org_nom }]
    })
  ).values()]

  function toggleRow(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="mt-8 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-800">Monitoring Edge Functions</h2>
        <p className="text-xs text-gray-400 mt-0.5">Cliquer sur une ligne pour voir les 5 derniers runs</p>
      </div>

      <div className="divide-y divide-gray-50">
        {groupes.map(g => {
          const key = `${g.fonction}||${g.orgId ?? ''}`
          const statut = dotStatut(runs, g.fonction, g.orgId)
          const ligneRuns = runs.filter(r => r.fonction === g.fonction && r.organisation_id === g.orgId)
          const lastRun = ligneRuns.find(r => r.rang === 1)
          const isOpen = expanded.has(key)

          return (
            <div key={key}>
              <button
                onClick={() => toggleRow(key)}
                className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <Dot statut={statut} />
                  <span className="text-sm font-mono text-gray-800">{g.fonction}</span>
                  {g.orgNom && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{g.orgNom}</span>
                  )}
                  {!g.orgId && (
                    <span className="text-[10px] text-gray-300 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">global</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    {lastRun ? (
                      <p className="text-xs text-gray-400">{formaterDate(lastRun.cree_le)}</p>
                    ) : (
                      <p className="text-xs text-gray-300 italic">Jamais exécuté</p>
                    )}
                    {lastRun?.duree_ms && (
                      <p className="text-[11px] text-gray-300">{lastRun.duree_ms} ms</p>
                    )}
                  </div>
                  <IcChevron open={isOpen} />
                </div>
              </button>

              {isOpen && (
                <div className="px-6 pb-4 bg-gray-50/50">
                  {ligneRuns.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-2">Aucun run enregistré.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 uppercase tracking-wide text-[10px]">
                          <th className="text-left py-2 pr-4 font-medium">Date</th>
                          <th className="text-left py-2 pr-4 font-medium">Statut</th>
                          <th className="text-left py-2 pr-4 font-medium">Traité</th>
                          <th className="text-left py-2 pr-4 font-medium">Durée</th>
                          <th className="text-left py-2 font-medium">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ligneRuns.map(r => (
                          <tr key={r.id} className="border-t border-gray-100">
                            <td className="py-1.5 pr-4 text-gray-500 whitespace-nowrap">{formaterDate(r.cree_le)}</td>
                            <td className="py-1.5 pr-4">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                r.statut === 'ok' ? 'bg-green-50 text-green-700' :
                                r.statut === 'erreur' ? 'bg-red-50 text-red-700' :
                                'bg-amber-50 text-amber-700'
                              }`}>{r.statut}</span>
                            </td>
                            <td className="py-1.5 pr-4 text-gray-700 font-medium">{r.nb_traite}</td>
                            <td className="py-1.5 pr-4 text-gray-400 whitespace-nowrap">
                              {r.duree_ms ? `${r.duree_ms} ms` : '—'}
                            </td>
                            <td className="py-1.5 text-gray-400 max-w-xs truncate">{r.message || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
