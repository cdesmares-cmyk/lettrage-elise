// Vue principale : une ligne par client, expandable pour voir les factures
import { useState, useEffect, useRef } from 'react'
import type { CompteClient, FactureDetail, StatutFacture, CommentaireFacture } from '../../types/client'
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
  onCompenser?: (client: CompteClient) => void
  dernieresRelances?: Map<string, string>
  commentaires?: Map<string, CommentaireFacture>
  onOuvrirCommentaire?: (fac: FactureDetail) => void
  modeSelection?: boolean
  selection?: Set<string>
  onToggleSelection?: (code: string) => void
  onSelectionnerPage?: (codes: string[]) => void
  creditParClient?: Map<string, number>
  nbPiecesParClient?: Map<string, number>
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
  sauvegarde:   '📁 Sauvegarde',
  liquidation:  '🚫 Liquidation',
  redressement: '🔄 Redressement',
  cloture:      '✅ Clôture',
}
const STATUT_CLASSES: Record<string, string> = {
  sauvegarde:   'bg-amber-50 border-amber-300 text-amber-800',
  liquidation:  'bg-red-50 border-red-300 text-red-800',
  redressement: 'bg-orange-50 border-orange-300 text-orange-800',
  cloture:      'bg-gray-50 border-gray-300 text-gray-600',
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

export function TableComptesClients({ clients, chargement, recherche, getFactures, estChargement, onExpand, onChargerHistorique, estHistoriqueCharge, onStatutChange, onHistorique, onOptions, onRelancer, onCompenser, dernieresRelances, commentaires, onOuvrirCommentaire, modeSelection = false, selection = new Set(), onToggleSelection, onSelectionnerPage, creditParClient, nbPiecesParClient }: Props) {
  const { peutModifier } = useRole()
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [sortCol, setSortCol] = useState<string>('encours_total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filtreAlertes, setFiltreAlertes] = useState(false)
  const checkboxToutRef = useRef<HTMLInputElement>(null)

  const nbAlertes = clients.filter(c => c.relance_auto_alerte).length

  // Réinitialiser la page uniquement quand la recherche change (pas lors d'un refresh data)
  useEffect(() => { setPage(0) }, [recherche])
  // Fermer le panneau ouvert uniquement si le client n'est plus dans la liste
  useEffect(() => { if (ouvert && !clients.find(c => c.code_dso === ouvert)) setOuvert(null) }, [clients, ouvert])

  function toggle(code: string) {
    if (modeSelection) { onToggleSelection?.(code); return }
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

  // Ces calculs et ce hook doivent rester AVANT les early returns pour ne jamais
  // modifier le nombre de hooks appelés entre deux rendus (règle React).
  const clientsFiltres = filtreAlertes ? clients.filter(c => c.relance_auto_alerte) : clients
  const clientsTries = sortRows(clientsFiltres as unknown as Record<string, unknown>[], sortCol, sortDir) as unknown as CompteClient[]
  const nbPages = Math.ceil(clientsTries.length / PAGE_SIZE)
  const clientsPage = clientsTries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const thProps = { sort: sortCol, dir: sortDir, onSort: handleSort }

  const tousPageCoches = modeSelection && clientsPage.length > 0 && clientsPage.every(c => selection.has(c.code_dso))
  const quelquesPageCoches = modeSelection && clientsPage.some(c => selection.has(c.code_dso)) && !tousPageCoches
  useEffect(() => {
    if (checkboxToutRef.current) checkboxToutRef.current.indeterminate = quelquesPageCoches
  }, [quelquesPageCoches])

  if (chargement) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Chargement…</div>
  if (!clients.length) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Aucun client trouvé.</div>

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {nbAlertes > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-amber-50">
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-700 font-medium flex-1">
            {nbAlertes} client{nbAlertes > 1 ? 's' : ''} avec une alerte de contact
          </span>
          <button
            onClick={() => { setFiltreAlertes(f => !f); setPage(0) }}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
              filtreAlertes
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'
            }`}
          >
            {filtreAlertes ? 'Voir tous' : 'Filtrer'}
          </button>
        </div>
      )}
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="w-10 px-3 py-2.5 text-center">
              {modeSelection && (
                <input
                  ref={checkboxToutRef}
                  type="checkbox"
                  checked={tousPageCoches}
                  onChange={() => {
                    if (tousPageCoches) onSelectionnerPage?.([])
                    else onSelectionnerPage?.(clientsPage.map(c => c.code_dso))
                  }}
                  className="accent-ockham-teal w-4 h-4 rounded cursor-pointer"
                />
              )}
            </th>
            <ColTh label="Code" col="code_dso" {...thProps} align="left" />
            <ColTh label="Nom" col="nom" {...thProps} align="left" />
            <ColTh label="Encours TTC" col="encours_total" {...thProps} align="right" />
            <ColTh label="Pièces actives" col="nb_impayees" {...thProps} align="center" />
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
            const estSelectionne = selection.has(c.code_dso)
            const credit = creditParClient?.get(c.code_dso) ?? 0
            const soldeNet = c.encours_total - credit
            const nbPieces = nbPiecesParClient?.get(c.code_dso) ?? c.nb_impayees
            return (
              <>
                <tr
                  key={c.code_dso}
                  onClick={() => toggle(c.code_dso)}
                  className={`cursor-pointer transition-colors border-b border-gray-50 ${
                    modeSelection
                      ? estSelectionne ? 'bg-ockham-teal-muted' : 'hover:bg-gray-50'
                      : estOuvert ? 'bg-ockham-teal-muted border-b-0' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-3 py-3 text-center" onClick={e => { e.stopPropagation(); toggle(c.code_dso) }}>
                    {modeSelection ? (
                      <input
                        type="checkbox"
                        checked={estSelectionne}
                        onChange={() => onToggleSelection?.(c.code_dso)}
                        className="accent-ockham-teal w-4 h-4 rounded cursor-pointer"
                      />
                    ) : (
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-transform ${estOuvert ? 'bg-ockham-teal text-white rotate-90' : 'bg-gray-100 text-gray-500'}`}>▶</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-xs font-bold text-ockham-teal bg-ockham-teal-muted px-2 py-0.5 rounded">{c.code_dso}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-sm font-semibold text-gray-800">{c.nom}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`font-mono font-bold text-sm tabular-nums whitespace-nowrap ${soldeNet > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{fmt(soldeNet)}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-sm font-bold tabular-nums ${nbPieces > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{nbPieces}</span>
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
                      {peutModifier && (() => {
                        if (c.nb_impayees === 0) return (
                          <button disabled
                            className="text-[10px] font-semibold px-2.5 py-1 rounded-md border border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed"
                            title="Aucune facture impayée"
                          >
                            ✉ Relancer
                          </button>
                        )
                        const derniere = dernieresRelances?.get(c.code_dso)
                        const recente = derniere
                          ? Math.floor((Date.now() - new Date(derniere).getTime()) / 86_400_000) < 30
                          : false
                        return (
                          <button
                            onClick={e => { e.stopPropagation(); onRelancer(c) }}
                            className={`text-[10px] font-semibold px-2.5 py-1 rounded-md border transition-all ${
                              recente
                                ? 'text-emerald-600 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                                : 'bg-ockham-teal text-white border-ockham-teal hover:bg-ockham-teal-dark'
                            }`}
                            title={recente ? 'Relancé il y a moins de 30 jours' : undefined}
                          >
                            ✉ Relancer
                          </button>
                        )
                      })()}
                      {estOuvert && onCompenser && peutModifier && (() => {
                        const aAvoirs = factures.some(f => f.est_avoir && f.reste_du < 0)
                        if (!aAvoirs) return null
                        return (
                          <button
                            onClick={e => { e.stopPropagation(); onCompenser(c) }}
                            className="text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-300 hover:bg-violet-100 hover:border-violet-400 px-2.5 py-1 rounded-md transition-all"
                            title="Compenser un avoir avec une ou plusieurs factures"
                          >
                            ⇄ Compenser
                          </button>
                        )
                      })()}
                      <div className="relative inline-block">
                        <button
                          onClick={e => { e.stopPropagation(); onOptions(c) }}
                          className="text-[10px] font-semibold text-gray-600 bg-white border border-gray-300 shadow-sm px-2.5 py-1 rounded-md hover:border-ockham-teal hover:text-ockham-teal transition-all"
                        >
                          ⚙ Options
                        </button>
                        {c.relance_auto_alerte && (
                          <span
                            className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-white"
                            title="Problème de contact détecté — ouvrez Options › Relances pour traiter."
                          />
                        )}
                      </div>
                    </div>
                  </td>
                </tr>

                {estOuvert && !modeSelection && (
                  <tr key={`${c.code_dso}-fac`}>
                    <td colSpan={10} className="px-0 py-0 border-b border-gray-100">
                      <div className="bg-gray-50 border-l-2 border-ockham-teal ml-0 overflow-hidden">
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
                              commentaires={commentaires}
                              onOuvrirCommentaire={onOuvrirCommentaire}
                              recherche={recherche}
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
