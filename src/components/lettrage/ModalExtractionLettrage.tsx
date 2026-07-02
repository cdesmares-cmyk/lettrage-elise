// Modale d'extraction des lettrages — onglets [Interne] et [Comptable]
import { useState } from 'react'
import { IcDownload, IcX } from '../Icones'
import { exporterLettrageXls } from '../../lib/exportLettrageXls'
import { TabExportComptable } from './TabExportComptable'
import type { ExportComptable } from '../../hooks/useExportComptable'
import toast from 'react-hot-toast'

interface Props {
  ouvert: boolean
  onFermer: () => void
  historique: ExportComptable[]
  chargementExport: boolean
  onApercu: (d: string, f: string) => Promise<{ nbLignes: number; montant: number; nbNonLettrees: number }>
  onExporter: (d: string, f: string) => Promise<void>
  onRetelecharger: (exp: ExportComptable) => Promise<void>
}

type Onglet = 'interne' | 'comptable'

export function ModalExtractionLettrage({ ouvert, onFermer, historique, chargementExport, onApercu, onExporter, onRetelecharger }: Props) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

  const [onglet, setOnglet] = useState<Onglet>('interne')
  const [dateDebut, setDateDebut] = useState(debutMois)
  const [dateFin, setDateFin] = useState(today)
  const [chargement, setChargement] = useState(false)

  async function handleExportInterne() {
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

  if (!ouvert) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] min-h-[480px] flex flex-col">

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Extraction Lettrage</h2>
            <p className="text-xs text-gray-500 mt-0.5">Export interne ou verrouillage comptable par période</p>
          </div>
          <button onClick={onFermer}
            className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            <IcX size={15} />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-gray-100 px-6">
          {(['interne', 'comptable'] as Onglet[]).map(o => (
            <button key={o} onClick={() => setOnglet(o)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors capitalize ${
                onglet === o
                  ? 'border-ockham-teal text-ockham-teal'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              {o === 'interne' ? 'Interne' : 'Comptable'}
            </button>
          ))}
        </div>

        {/* Onglet Interne */}
        {onglet === 'interne' && (
          <div className="flex-1 flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Date de début</label>
                  <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-ockham-teal bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Date de fin</label>
                  <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-ockham-teal bg-white" />
                </div>
                <button onClick={handleExportInterne} disabled={chargement || !dateDebut || !dateFin}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">
                  {chargement
                    ? <>⟳ Export…</>
                    : <><IcDownload size={13} className="inline-block mr-1.5" />Extraire XLS</>}
                </button>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-end px-6 pb-8">
              <p className="text-center text-sm font-medium text-gray-500 mb-2">Export 3 onglets · Format de référence</p>
              <p className="text-center text-sm text-gray-400">Affectation · Lignes bancaires · Cadrage comptable</p>
            </div>
          </div>
        )}

        {/* Onglet Comptable */}
        {onglet === 'comptable' && (
          <TabExportComptable
            historique={historique}
            chargement={chargementExport}
            onApercu={onApercu}
            onExporter={onExporter}
            onRetelecharger={onRetelecharger}
          />
        )}
      </div>
    </div>
  )
}
