// Vue principale : une ligne par client, expandable pour voir les factures
import { useState, useEffect } from 'react'
import type { CompteClient, FactureDetail, StatutFacture } from '../../types/client'
import { LignesFactures } from './LignesFactures'
import { Pagination } from '../Pagination'
import { useRole } from '../../contexts/RoleContext'

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
  onRelancer: (client: CompteClient) => void
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

type SortDir = 'asc' | 'desc'

function sortRows<T extends Record<string, unknown>>(data: T[], col: keyof T, dir: SortDir): T[] {
  return [...data].sort((a, b) => {
    const av = a[col] ?? '', bv = b[col] ?? ''
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'fr-FR', { numeric: true })
    return dir === 'asc' ? cmp : -cmp
  })
}

function ColTh({ label, col, sort, dir, onSort, align = 'left' }: {
  label: string; col: string
  sort: string; dir: SortDir
  onSort: (col: string) => void
  align?: 'left' | 'right' | 'center'
}) {
  const active = sort === col
  const alignCls = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors ${active ? 'text-ockham-teal' : 'text-gray-400'}`}
    >
      <span className={`flex items-center gap-1 ${alignCls}`}>
        {label}
        <span className={`text-[9px] ${active ? 'text-ockham-teal' : 'text-gray-300'}`}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⬍'}
        </span>
      </span>
    </th>
  )
}

export function TableComptesClients({ clients, chargement, recherche, getFactures, estChargement, onExpand, onChargerHistorique, estHistoriqueCharge, onStatutChange, onHistorique, onOptions, onRelancer }: Props) {
  const { peutModifier } = useRole()
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [sortCol, setSortCol] = useState<string>('encours_total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Réinitialiser la page uniquement quand la recherche change (pas lors d'un refresh data)
  useEffect(() => { setPage(0) }, [recherche])
  // Fermer le panneau ouvert uniquement si le client n'est plus dans la liste
  useEffect(() => { if (ouvert && !clients.find(c => c.code_dso === ouvert)) setOuvert(null) }, [clients, ouvert])

  function toggle(code: string) {
    if (ouvert === code) { setOuvert(null) }
    else { setOuvert(code); onExpand(code) }
  }

  function handleSort(col: string) {
    setSortCol(prev => {
      if (prev === col) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return col
      }
      setSortDir('desc')
      return col
    })
    setPage(0)
  }

  if (chargement) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Chargement…</div>
  if (!clients.length) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Aucun client trouvé.</div>

  const clientsTries = sortRows(clients as unknown as Record<string, unknown>[], sortCol, sortDir) as unknown as CompteClient[]
  const nbPages = Math.ceil(clientsTries.length / PAGE_SIZE)
  const clientsPage = clientsTries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const thProps = { sort: sortCol, dir: sortDir, onSort: handleSort }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="w-10 px-3 py-2.5" />
            <ColTh label="Code" col="code_dso" {...thProps} align="left" />
            <ColTh label="Nom" col="nom" {...thProps} align="left" />
            <ColTh label="Encours TTC" col="encours_total" {...thProps} align="right" />
            <ColTh label="Fac. impayées" col="nb_impayees" {...thProps} align="center" />
            <ColTh label="Score Risque" col="note_risque" {...thProps} align="left" />
            <ColTh label="Plateforme" col="plateforme" {...thProps} align="left" />
            <ColTh label="Statut juridique" col="statut_juridique" {...thProps} align="left" />
            <ColTh label="Groupement" col="code_groupement" {...thProps} align="left" />
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
                  className={`cursor-pointer transition-colors border-b border-gray-50 ${estOuvert ? 'bg-ockham-teal-muted border-b-0' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-transform ${estOuvert ? 'bg-ockham-teal text-white rotate-90' : 'bg-gray-100 text-gray-500'}`}>▶</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-xs font-bold text-ockham-teal bg-ockham-teal-muted px-2 py-0.5 rounded">{c.code_dso}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-sm font-semibold text-gray-800">{c.nom}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`font-mono font-bold text-sm tabular-nums whitespace-nowrap ${c.encours_total > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{fmt(c.encours_total)}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-sm font-bold tabular-nums ${c.nb_impayees > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{c.nb_impayees}</span>
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
                    {c.statut_juridique ? (
                      <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border ${STATUT_CLASSES[c.statut_juridique]}`}>
                        {STATUT_LABELS[c.statut_juridique]}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {c.code_groupement ? (
                      <span className="font-mono text-[11px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded border border-gray-200">{c.code_groupement}</span>
                    ) : <span className="text-[10px] text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {peutModifier && c.nb_impayees > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); onRelancer(c) }}
                          className="text-[10px] font-semibold text-ockham-teal border border-ockham-teal/40 bg-ockham-teal-muted px-2.5 py-1 rounded-md hover:bg-ockham-teal/10 hover:border-ockham-teal transition-all"
                        >
                          ✉ Relancer
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); onOptions(c) }}
                        className="text-[10px] font-semibold text-gray-500 border border-gray-200 px-2.5 py-1 rounded-md hover:border-ockham-teal hover:text-ockham-teal hover:bg-ockham-teal-muted transition-all"
                      >
                        ⚙ Options
                      </button>
                    </div>
                  </td>
                </tr>

                {estOuvert && (
                  <tr key={`${c.code_dso}-fac`}>
                    <td colSpan={10} className="px-0 py-0 border-b-2 border-ockham-teal/20">
                      <div className="px-4 py-3 bg-ockham-teal-muted/60">
                        {factures.length === 0 && nbReglees > 0 && !estHistoriqueCharge(c.code_dso) ? (
                          // Toutes les factures sont réglées — pas d'impayée en mémoire
                          <div className="py-3 text-center">
                            <p className="text-xs text-emerald-600 font-medium mb-2">✓ Toutes les factures sont réglées</p>
                            <button
                              onClick={e => { e.stopPropagation(); onChargerHistorique(c.code_dso) }}
                              className="text-[11px] font-medium text-ockham-teal hover:text-ockham-teal-dark hover:underline transition-colors"
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
                                  className="text-[11px] font-medium text-ockham-teal hover:text-ockham-teal-dark hover:underline transition-colors"
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
