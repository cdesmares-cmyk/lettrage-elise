// Bloc Export Lettrage : sélecteur de période + bouton d'export XLSX multi-onglets
import { useState } from 'react'
import toast from 'react-hot-toast'
import { exporterLettrageXls } from '../../lib/exportLettrageXls'

function debutMoisCourant() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}
function today() {
  return new Date().toISOString().split('T')[0]
}

export function BlocExportLettrage() {
  const [dateDebut, setDateDebut] = useState(debutMoisCourant)
  const [dateFin, setDateFin] = useState(today)
  const [chargement, setChargement] = useState(false)

  async function handleExport() {
    if (!dateDebut || !dateFin) { toast.error('Veuillez sélectionner une période'); return }
    setChargement(true)
    try {
      await exporterLettrageXls(dateDebut, dateFin)
      toast.success('Export généré')
    } catch {
      toast.error('Erreur lors de l\'export')
    } finally {
      setChargement(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-col gap-4">
      {/* En-tête du bloc */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-ockham-teal-muted flex items-center justify-center text-ockham-teal text-xl flex-shrink-0">
          📊
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">Export Lettrage</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Fichier Excel avec 2 onglets : <span className="font-medium text-gray-700">Affectation</span> · <span className="font-medium text-gray-700">Lignes bancaires</span>
          </p>
        </div>
      </div>

      {/* Sélecteur de période */}
      <div className="flex items-end gap-3 flex-wrap">
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
        <button
          onClick={handleExport}
          disabled={chargement || !dateDebut || !dateFin}
          className="flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
        >
          {chargement ? '⟳ Export…' : '⬇ Exporter .xlsx'}
        </button>
      </div>

      {/* Détail des colonnes */}
      <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3 text-[11px] text-gray-500">
        <div>
          <p className="font-semibold text-gray-600 mb-1">Onglet Affectation</p>
          <p>Date · Ligne bancaire · Code client</p>
          <p>N° Facture · Montant · Commentaire · Opérateur</p>
        </div>
        <div>
          <p className="font-semibold text-gray-600 mb-1">Onglet Lignes bancaires</p>
          <p>Date · Libellé · Crédit</p>
          <p>Type (Facture / Autres) · Commentaire</p>
        </div>
      </div>
    </div>
  )
}
