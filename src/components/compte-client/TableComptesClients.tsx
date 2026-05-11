// Vue principale : une ligne par client, expandable pour voir les factures
import { useState, useEffect } from 'react'
import type { CompteClient, FactureDetail, StatutFacture } from '../../types/client'
import { LignesFactures } from './LignesFactures'
import { Pagination } from '../Pagination'

interface Props {
  clients: CompteClient[]
  chargement: boolean
  recherche: string
  getFactures: (code: string) => FactureDetail[]
  estChargement: (code: string) => boolean
  onExpand: (code: string) => void
  onChargerHistorique: (code: string) => void
  estHistoriqueCharge: (code: string) => boolean
  onStatutChange: (numero: string, statut: StatutFacture | null) => void
  onHistorique: (fac: FactureDetail) => void
  onOptions: (client: CompteClient) => void
}

const PAGE_SIZE = 25

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function classeScore(note: number) {
  if (note <= 40) return { bar: 'bg-emerald-500', txt: 'text-emerald-600' }
  if (note <= 70) return { bar: 'bg-amber-500', txt: 'text-amber-600' }
  return { bar: 'bg-red-500', txt: 'text-red-600' }
}

const STATUT_LABELS: Record<string, string> = {
  sauvegarde: '📁 Sauvegarde',
  liquidation: '🚫 Liquidation',
  redressement: '🔄 Redressement',
}
const STATUT_CLASSES: Record<string, string> = {
  sauvegarde: 'bg-amber-50 border-amber-300 text-amber-800',
  liquidation: 'bg-red-50 border-red-300 text-red-800',
  redressement: 'bg-orange-50 border-orange-300 text-orange-800',
}

export function TableComptesClients({ clients, chargement, recherche, getFactures, estChargement, onExpand, onChargerHistorique, estHistoriqueCharge, onStatutChange, onHistorique, onOptions }: Props) {
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  // Réinitialiser la page uniquement quand la recherche change (pas lors d'un refresh data)
  useEffect(() => { setPage(0) }, [recherche])
  // Fermer le panneau ouvert uniquement si le client n'est plus dans la liste
  useEffect(() => { if (ouvert && !clients.find(c => c.code_dso === ouvert)) setOuvert(null) }, [clients, ouvert])

  function toggle(code: string) {
    if (ouvert === code) { setOuvert(null) }
    else { setOuvert(code); onExpand(code) }
  }

  if (chargement) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Chargement…</div>
  if (!clients.length) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Aucun client trouvé.</div>

  const nbPages = Math.ceil(clients.length / PAGE_SIZE)
  const clientsPage = clients.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="w-10 px-3 py-2.5" />
            <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Code · Client</th>
            <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Encours TTC</th>
            <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fac. impayées</th>
            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Statut juridique</th>
            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Note risque</th>
            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Plateforme</th>
            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Groupement</th>
            <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Options</th>
          </tr>
        </thead>
        <tbody>
          {clientsPage.map(c => {
            const estOuvert = ouvert === c.code_dso
            const sc = classeScore(c.note_risque)
            const factures = getFactures(c.code_dso)
            // nb_factures_total - nb_impayees = factures entièrement réglées (stats SQL, indépendant du cache)
            const nbReglees = c.nb_factures_total - c.nb_impayees
            return (
              <>
                <tr
                  key={c.code_dso}
                  onClick={() => toggle(c.code_dso)}
                  className={`cursor-pointer transition-colors border-b border-gray-50 ${estOuvert ? 'bg-blue-50 border-b-0' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-transform ${estOuvert ? 'bg-blue-600 text-white rotate-90' : 'bg-gray-100 text-gray-500'}`}>▶</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{c.code_dso}</span>
                      <span className="text-sm font-semibold text-gray-800">{c.nom}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`font-mono font-bold text-sm tabular-nums ${c.encours_total > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{fmt(c.encours_total)}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-sm font-bold tabular-nums ${c.nb_impayees > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{c.nb_impayees}</span>
                    <span className="text-gray-300 text-xs"> / {c.nb_factures_total}</span>
                  </td>
                  <td className="px-3 py-3">
                    {c.statut_juridique ? (
                      <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border ${STATUT_CLASSES[c.statut_juridique]}`}>
                        {STATUT_LABELS[c.statut_juridique]}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${c.note_risque}%` }} />
                      </div>
                      <span className={`text-xs font-bold tabular-nums ${sc.txt}`}>{c.note_risque}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {c.plateforme ? (
                      <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">{c.plateforme}</span>
                    ) : <span className="text-[10px] text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {c.code_groupement ? (
                      <span className="font-mono text-[11px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded border border-gray-200">{c.code_groupement}</span>
                    ) : <span className="text-[10px] text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={e => { e.stopPropagation(); onOptions(c) }}
                      className="text-[10px] font-semibold text-gray-500 border border-gray-200 px-2.5 py-1 rounded-md hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                    >
                      ⚙ Options
                    </button>
                  </td>
                </tr>

                {estOuvert && (
                  <tr key={`${c.code_dso}-fac`}>
                    <td colSpan={9} className="px-0 py-0 border-b-2 border-blue-100">
                      <div className="px-4 py-3 bg-blue-50/60">
                        {factures.length === 0 && nbReglees > 0 && !estHistoriqueCharge(c.code_dso) ? (
                          // Toutes les factures sont réglées — pas d'impayée en mémoire
                          <div className="py-3 text-center">
                            <p className="text-xs text-emerald-600 font-medium mb-2">✓ Toutes les factures sont réglées</p>
                            <button
                              onClick={e => { e.stopPropagation(); onChargerHistorique(c.code_dso) }}
                              className="text-[11px] font-medium text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                            >
                              + Charger {nbReglees} facture{nbReglees > 1 ? 's' : ''} réglée{nbReglees > 1 ? 's' : ''}
                            </button>
                          </div>
                        ) : (
                          <>
                            <LignesFactures
                              factures={factures}
                              chargement={estChargement(c.code_dso)}
                              onStatutChange={onStatutChange}
                              onHistorique={onHistorique}
                              compact
                            />
                            {nbReglees > 0 && !estHistoriqueCharge(c.code_dso) && (
                              <div className="mt-2 text-center">
                                <button
                                  onClick={e => { e.stopPropagation(); onChargerHistorique(c.code_dso) }}
                                  className="text-[11px] font-medium text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                                >
                                  + Charger {nbReglees} facture{nbReglees > 1 ? 's' : ''} réglée{nbReglees > 1 ? 's' : ''}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>

      <Pagination page={page} total={nbPages} onChange={setPage} />
    </div>
  )
}
