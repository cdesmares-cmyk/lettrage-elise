// Modal d'export XLS Nébuleuse — sélection par groupe + téléchargement
import { useState } from 'react'
import type { GroupeNebuleuse, FactureDetail } from '../../types/client'
import { exporterNebuleuseXls } from '../../lib/exportXls'

interface Props {
  ouvert: boolean
  groupes: GroupeNebuleuse[]
  getFactures: (codes: string[]) => FactureDetail[]
  chargerFactures: (codes: string[]) => Promise<void>
  onFermer: () => void
}

export function ModalExportNebuleuse({ ouvert, groupes, getFactures, chargerFactures, onFermer }: Props) {
  const [selection, setSelection] = useState<'tous' | string>('tous')
  const [chargement, setChargement] = useState(false)

  if (!ouvert) return null

  async function handleExport() {
    setChargement(true)
    let codes: string[]
    let groupesCibles: GroupeNebuleuse[]
    if (selection === 'tous') {
      codes = groupes.flatMap(g => g.codes_clients)
      groupesCibles = groupes
    } else {
      const g = groupes.find(g => g.groupe_key === selection)
      if (!g) { setChargement(false); return }
      codes = g.codes_clients
      groupesCibles = [g]
    }
    await chargerFactures(codes)
    const factures = getFactures(codes)
    setChargement(false)
    if (!factures.length) return
    const nomFichier = selection === 'tous'
      ? `extraction_nebuleuse_${new Date().toISOString().split('T')[0]}`
      : `extraction_${selection}_${new Date().toISOString().split('T')[0]}`
    exporterNebuleuseXls(factures, groupesCibles, nomFichier)
    onFermer()
  }

  const totalFac = groupes.reduce((s, g) => s + g.nb_factures, 0)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900">⬇ Extraction XLS — Nébuleuse</h3>
            <p className="text-xs text-gray-400 mt-0.5">Factures par groupement · colonnes Groupe + Nom groupe</p>
          </div>
          <button onClick={onFermer} className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Périmètre</p>

          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50">
            <input type="radio" name="scope-neb" value="tous" checked={selection === 'tous'} onChange={() => setSelection('tous')} className="accent-ockham-teal" />
            <div>
              <p className="text-sm font-semibold text-gray-800">Tous les groupements</p>
              <p className="text-xs text-gray-400">{groupes.length} groupes · {totalFac} factures</p>
            </div>
          </label>

          <div className="border rounded-lg overflow-hidden">
            <p className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Par groupement</p>
            <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
              {groupes.map(g => (
                <label key={g.groupe_key} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="radio" name="scope-neb" value={g.groupe_key} checked={selection === g.groupe_key} onChange={() => setSelection(g.groupe_key)} className="accent-ockham-teal flex-shrink-0" />
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{g.groupe_key}</span>
                      <span className="ml-2 text-xs text-gray-700">{g.nom_groupe}</span>
                      <span className="ml-1 text-[10px] text-gray-400">{g.nb_clients} clients</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{g.nb_factures} fac.</span>
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
            {chargement ? '…' : '⬇ Télécharger XLSX'}
          </button>
        </div>
      </div>
    </div>
  )
}
