// Vue nébuleuse : regroupement par code_groupement avec expand factures consolidées
import React, { useState, useTransition } from 'react'
import type { GroupeNebuleuse, FactureDetail, StatutFacture } from '../../types/client'
import { LignesFactures } from './LignesFactures'
import { Pagination } from '../Pagination'

interface Props {
  groupes: GroupeNebuleuse[]
  chargement: boolean
  getFactures: (codes: string[]) => FactureDetail[]
  estChargement: (codes: string[]) => boolean
  onExpand: (codes: string[]) => void
  onStatutChange: (numero: string, statut: StatutFacture | null) => void
  onHistorique: (fac: FactureDetail) => void
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function classeScore(note: number) {
  if (note <= 40) return { bar: 'bg-emerald-500', txt: 'text-emerald-600' }
  if (note <= 70) return { bar: 'bg-amber-500', txt: 'text-amber-600' }
  return { bar: 'bg-red-500', txt: 'text-red-600' }
}

const PAGE_SIZE = 25

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
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors ${active ? 'text-blue-500' : 'text-gray-400'}`}
    >
      <span className={`flex items-center gap-1 ${alignCls}`}>
        {label}
        <span className={`text-[9px] ${active ? 'text-blue-400' : 'text-gray-300'}`}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⬍'}
        </span>
      </span>
    </th>
  )
}

export function TableNebuleuse({ groupes, chargement, getFactures, estChargement, onExpand, onStatutChange, onHistorique }: Props) {
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [zerosVisibles, setZerosVisibles] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [, startTransition] = useTransition()
  const [sortCol, setSortCol] = useState<string>('encours_total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

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

  const groupesTries = sortRows(groupes as unknown as Record<string, unknown>[], sortCol, sortDir) as unknown as GroupeNebuleuse[]
  const totalPages = Math.ceil(groupesTries.length / PAGE_SIZE)
  const groupesPage = groupesTries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggle(key: string, codes: string[]) {
    startTransition(() => {
      setOuvert(prev => {
        if (prev === key) return null
        onExpand(codes)
        return key
      })
    })
  }

  function changerPage(p: number) {
    setPage(p)
    setOuvert(null)
    setZerosVisibles(new Set())
  }

  function toggleZeros(key: string) {
    setZerosVisibles(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (chargement) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Chargement…</div>
  if (!groupes.length) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Aucun groupe avec référence de regroupement trouvé.</div>

  const thProps = { sort: sortCol, dir: sortDir, onSort: handleSort }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="w-10 px-3 py-2" />
            <ColTh label="Code" col="groupe_key" {...thProps} align="left" />
            <ColTh label="Nom" col="nom_groupe" {...thProps} align="left" />
            <ColTh label="Encours consolidé" col="encours_total" {...thProps} align="right" />
            <ColTh label="Clients" col="nb_clients" {...thProps} align="center" />
            <ColTh label="Fac. impayées" col="nb_impayees" {...thProps} align="center" />
            <ColTh label="Score Risque" col="note_risque" {...thProps} align="left" />
          </tr>
        </thead>
        <tbody>
          {groupesPage.map(g => {
            const estOuvert = ouvert === g.groupe_key
            const sc = classeScore(g.note_risque)
            const estGroupe = g.nb_clients > 1
            const factures = estOuvert ? getFactures(g.codes_clients) : []
            return (
              <React.Fragment key={g.groupe_key}>
                <tr
                  onClick={() => toggle(g.groupe_key, g.codes_clients)}
                  className={`cursor-pointer transition-colors border-b border-gray-50 ${estOuvert ? 'bg-blue-50 border-b-0' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-transform ${estOuvert ? 'bg-blue-800 text-white rotate-90' : 'bg-gray-100 text-gray-500'}`}>▶</span>
                  </td>
                  <td className="px-3 py-2">
                    {estGroupe ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 border border-blue-300 text-blue-800">
                        🌐 {g.groupe_key}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-300 text-gray-500">CLIENT</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-sm font-semibold text-gray-800">{g.nom_groupe}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-mono font-bold text-sm tabular-nums text-gray-900">{fmt(g.encours_total)}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-sm font-bold text-blue-600 tabular-nums">{g.nb_clients}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-sm font-bold tabular-nums ${g.nb_impayees > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{g.nb_impayees}</span>
                    <span className="text-gray-300 text-xs"> / {g.nb_factures}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${g.note_risque}%` }} />
                      </div>
                      <span className={`text-xs font-bold tabular-nums ${sc.txt}`}>{g.note_risque}</span>
                    </div>
                  </td>
                </tr>

                {estOuvert && (
                  <tr>
                    <td colSpan={7} className="px-0 py-0 border-b-2 border-blue-100">
                      {estChargement(g.codes_clients) ? (
                        <div className="py-6 text-center text-xs text-gray-400">Chargement…</div>
                      ) : (() => {
                        const sorted = [...g.clients].sort((a, b) => b.encours_total - a.encours_total)
                        const actifs = sorted.filter(c => c.encours_total > 0.005)
                        const zeros = sorted.filter(c => c.encours_total <= 0.005)
                        const zerosOuverts = zerosVisibles.has(g.groupe_key)
                        const clientsAffiches = zerosOuverts ? sorted : actifs
                        return (
                          <>
                            {clientsAffiches.map(client => {
                              const facsCli = factures.filter(f => f.code_client === client.code_dso)
                              return (
                                <div key={client.code_dso}>
                                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 sticky top-0">
                                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{client.code_dso}</span>
                                    <span className="text-xs font-semibold text-gray-700">{client.nom}</span>
                                    <span className="text-[10px] text-gray-400 ml-1">{facsCli.length} facture{facsCli.length > 1 ? 's' : ''}</span>
                                  </div>
                                  <div className="px-4 py-2 bg-blue-50/20">
                                    <LignesFactures
                                      factures={facsCli}
                                      chargement={false}
                                      onStatutChange={onStatutChange}
                                      onHistorique={onHistorique}
                                      compact
                                    />
                                  </div>
                                </div>
                              )
                            })}
                            {zeros.length > 0 && (
                              <button
                                onClick={() => toggleZeros(g.groupe_key)}
                                className="w-full py-2 text-[11px] text-gray-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors border-t border-gray-100"
                              >
                                {zerosOuverts
                                  ? `↑ Masquer les ${zeros.length} client${zeros.length > 1 ? 's' : ''} sans encours`
                                  : `↓ Afficher ${zeros.length} client${zeros.length > 1 ? 's' : ''} associé${zeros.length > 1 ? 's' : ''} — aucun encours`
                                }
                              </button>
                            )}
                          </>
                        )
                      })()}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>

      <Pagination page={page} total={totalPages} onChange={changerPage} />
    </div>
  )
}
