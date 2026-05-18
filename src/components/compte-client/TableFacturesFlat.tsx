// Vue factures : liste plate avec filtres date, préfiltres années, tri global, pagination 50/50
import { useState, useMemo, useEffect } from 'react'
import type { CompteClient, FactureDetail, StatutFacture, CommentaireFacture } from '../../types/client'
import { LignesFactures } from './LignesFactures'
import { exporterXls } from '../../lib/exportXls'
import { Pagination } from '../Pagination'

type SortDir = 'asc' | 'desc'

function sortRows(data: FactureDetail[], col: string, dir: SortDir): FactureDetail[] {
  return [...data].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[col] ?? ''
    const bv = (b as unknown as Record<string, unknown>)[col] ?? ''
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'fr-FR', { numeric: true })
    return dir === 'asc' ? cmp : -cmp
  })
}

const ITEMS_PER_PAGE = 50

interface Props {
  clients: CompteClient[]
  getFactures: (codes: string[]) => FactureDetail[]
  estChargement: (codes: string[]) => boolean
  onExpand: (codes: string[]) => void
  onStatutChange: (numero: string, statut: StatutFacture | null) => void
  onHistorique: (fac: FactureDetail) => void
  commentaires?: Map<string, CommentaireFacture>
  onOuvrirCommentaire?: (fac: FactureDetail) => void
}

export function TableFacturesFlat({ clients, getFactures, estChargement, onExpand, onStatutChange, onHistorique, commentaires, onOuvrirCommentaire }: Props) {
  const codes = clients.map(c => c.code_dso)
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [page, setPage] = useState(0)
  const [sortCol, setSortCol] = useState('date_emission')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
    setPage(0)
  }

  useEffect(() => {
    if (codes.length > 0) onExpand(codes)
  }, [clients.map(c => c.code_dso).join(',')])

  const factures = getFactures(codes)
  const chargement = estChargement(codes)

  // Années uniques présentes dans les factures (ordre décroissant)
  const annees = useMemo(() => {
    const set = new Set<string>()
    for (const f of factures) {
      if (f.date_emission) set.add(f.date_emission.slice(0, 4))
    }
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [factures])

  // Année active = quand dateDebut/dateFin couvre exactement une année entière
  const anneeActive = useMemo(() => {
    if (!dateDebut || !dateFin) return null
    const y = dateDebut.slice(0, 4)
    return dateDebut === `${y}-01-01` && dateFin === `${y}-12-31` ? y : null
  }, [dateDebut, dateFin])

  function toggleAnnee(y: string) {
    if (anneeActive === y) {
      setDateDebut(''); setDateFin('')
    } else {
      setDateDebut(`${y}-01-01`); setDateFin(`${y}-12-31`)
    }
    setPage(0)
  }

  // Reset page à chaque changement de filtre
  useEffect(() => { setPage(0) }, [dateDebut, dateFin])

  const facturesFiltrees = useMemo(() => {
    let result = factures
    if (dateDebut) result = result.filter(f => (f.date_emission ?? '') >= dateDebut)
    if (dateFin) result = result.filter(f => (f.date_emission ?? '') <= dateFin)
    return result
  }, [factures, dateDebut, dateFin])

  const facturesTries = useMemo(
    () => sortRows(facturesFiltrees, sortCol, sortDir),
    [facturesFiltrees, sortCol, sortDir]
  )

  const nbPages = Math.ceil(facturesTries.length / ITEMS_PER_PAGE)
  const facturesPage = facturesTries.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE)

  function handleExport() {
    if (!facturesFiltrees.length) return
    const debut = dateDebut || 'tout'
    const fin = dateFin || 'tout'
    exporterXls(facturesFiltrees, `extraction_factures_${debut}_${fin}`)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-end gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">

        {/* Préfiltres années dynamiques */}
        {annees.length > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0 self-end">
            {annees.map(y => (
              <button
                key={y}
                onClick={() => toggleAnnee(y)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  anneeActive === y
                    ? 'bg-ockham-teal text-white border-ockham-teal'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-ockham-teal hover:text-ockham-teal'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        <div className="w-px h-6 bg-gray-200 flex-shrink-0 self-end mb-0.5" />

        {/* Filtres date */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Du</label>
          <input
            type="date"
            value={dateDebut}
            onChange={e => { setDateDebut(e.target.value); setPage(0) }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white transition-colors"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Au</label>
          <input
            type="date"
            value={dateFin}
            onChange={e => { setDateFin(e.target.value); setPage(0) }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white transition-colors"
          />
        </div>
        {(dateDebut || dateFin) && (
          <button
            onClick={() => { setDateDebut(''); setDateFin(''); setPage(0) }}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg transition-colors self-end"
          >
            ✕ Effacer
          </button>
        )}

        <div className="flex-1" />
        <span className="text-[11px] text-gray-400 self-end pb-0.5">
          {facturesFiltrees.length} facture{facturesFiltrees.length !== 1 ? 's' : ''}
          {(dateDebut || dateFin) ? ' (filtrées)' : ''}
        </span>
        <button
          onClick={handleExport}
          disabled={!facturesFiltrees.length || chargement}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap self-end"
        >
          ⬇ Export XLS
        </button>
      </div>

      <LignesFactures
        factures={facturesPage}
        chargement={chargement}
        onStatutChange={onStatutChange}
        onHistorique={onHistorique}
        commentaires={commentaires}
        onOuvrirCommentaire={onOuvrirCommentaire}
        controlSort={{ col: sortCol, dir: sortDir, onChange: handleSort }}
      />

      <Pagination page={page} total={nbPages} onChange={setPage} />
    </div>
  )
}
