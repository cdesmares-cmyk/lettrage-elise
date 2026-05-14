// Vue factures : liste plate de toutes les factures (toutes les colonnes)
import { useState, useMemo, useEffect } from 'react'
import type { CompteClient, FactureDetail, StatutFacture } from '../../types/client'
import { LignesFactures } from './LignesFactures'
import { exporterXls } from '../../lib/exportXls'

interface Props {
  clients: CompteClient[]
  getFactures: (codes: string[]) => FactureDetail[]
  estChargement: (codes: string[]) => boolean
  onExpand: (codes: string[]) => void
  onStatutChange: (numero: string, statut: StatutFacture | null) => void
  onHistorique: (fac: FactureDetail) => void
}

export function TableFacturesFlat({ clients, getFactures, estChargement, onExpand, onStatutChange, onHistorique }: Props) {
  const codes = clients.map(c => c.code_dso)
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')

  useEffect(() => {
    if (codes.length > 0) onExpand(codes)
  }, [clients.map(c => c.code_dso).join(',')])

  const factures = getFactures(codes)
  const chargement = estChargement(codes)

  const facturesFiltrees = useMemo(() => {
    let result = factures
    if (dateDebut) result = result.filter(f => (f.date_emission ?? '') >= dateDebut)
    if (dateFin) result = result.filter(f => (f.date_emission ?? '') <= dateFin)
    return result
  }, [factures, dateDebut, dateFin])

  function handleExport() {
    if (!facturesFiltrees.length) return
    const debut = dateDebut || 'tout'
    const fin = dateFin || 'tout'
    exporterXls(facturesFiltrees, `extraction_factures_${debut}_${fin}`)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-end gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Du</label>
          <input
            type="date"
            value={dateDebut}
            onChange={e => setDateDebut(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white transition-colors"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Au</label>
          <input
            type="date"
            value={dateFin}
            onChange={e => setDateFin(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white transition-colors"
          />
        </div>
        {(dateDebut || dateFin) && (
          <button
            onClick={() => { setDateDebut(''); setDateFin('') }}
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
        factures={facturesFiltrees}
        chargement={chargement}
        onStatutChange={onStatutChange}
        onHistorique={onHistorique}
      />
    </div>
  )
}
