// Modal d'export XLS — sélection du périmètre + téléchargement
import { useState } from 'react'
import { IcDownload } from '../Icones'
import type { CompteClient, FactureDetail } from '../../types/client'
import { exporterXls } from '../../lib/exportXls'

interface Props {
  ouvert: boolean
  clients: CompteClient[]
  getFactures: (codes: string | string[]) => FactureDetail[]
  chargerFactures: (codes: string | string[]) => Promise<void>
  onFermer: () => void
}

export function ModalExport({ ouvert, clients, getFactures, chargerFactures, onFermer }: Props) {
  const [selection, setSelection] = useState<'toutes' | string>('toutes')
  const [chargement, setChargement] = useState(false)

  if (!ouvert) return null

  async function handleExport() {
    setChargement(true)
    let factures: FactureDetail[]
    if (selection === 'toutes') {
      // Charger toutes les factures pour tous les clients visibles
      const codes = clients.map(c => c.code_dso)
      await chargerFactures(codes)
      factures = getFactures(codes)
    } else {
      await chargerFactures(selection)
      factures = getFactures(selection)
    }
    setChargement(false)
    if (!factures.length) return

    const nomClient = selection === 'toutes' ? 'tous_clients' : (clients.find(c => c.code_dso === selection)?.nom ?? selection).replace(/\s+/g, '_')
    exporterXls(factures, `extraction_${nomClient}_${new Date().toISOString().split('T')[0]}`)
    onFermer()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><IcDownload size={13} className="text-gray-500" /> Extraction XLS</h3>
            <p className="text-xs text-gray-400 mt-0.5">Fichier Excel — Calibri 12, montants numériques</p>
          </div>
          <button onClick={onFermer} className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Périmètre</p>

          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50">
            <input type="radio" name="scope" value="toutes" checked={selection === 'toutes'} onChange={() => setSelection('toutes')} className="accent-ockham-teal" />
            <div>
              <p className="text-sm font-semibold text-gray-800">Toutes les factures</p>
              <p className="text-xs text-gray-400">{clients.reduce((s, c) => s + c.nb_factures_total, 0)} factures — vue filtrée actuelle</p>
            </div>
          </label>

          <div className="border rounded-lg overflow-hidden">
            <p className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Par client</p>
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
              {clients.map(c => (
                <label key={c.code_dso} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="radio" name="scope" value={c.code_dso} checked={selection === c.code_dso} onChange={() => setSelection(c.code_dso)} className="accent-ockham-teal flex-shrink-0" />
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-ockham-teal">{c.code_dso}</span>
                      <span className="ml-2 text-xs text-gray-700">{c.nom}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{c.nb_factures_total} fac.</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onFermer} disabled={chargement} className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40">
            Annuler
          </button>
          <button onClick={handleExport} disabled={chargement} className="flex-[2] flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
            {chargement ? '…' : <><IcDownload size={13} className="inline-block mr-1.5" />Télécharger XLSX</>}
          </button>
        </div>
      </div>
    </div>
  )
}
