// Onglet Export Comptable — verrouillage des lettrages par période
import { useState } from 'react'
import toast from 'react-hot-toast'
import { IcDownload, IcWarning, IcClock, IcLoader } from '../Icones'
import type { ExportComptable } from '../../hooks/useExportComptable'

interface Props {
  historique: ExportComptable[]
  chargement: boolean
  onApercu: (d: string, f: string) => Promise<{ nbLignes: number; montant: number; nbNonLettrees: number }>
  onExporter: (d: string, f: string) => Promise<void>
  onRetelecharger: (exp: ExportComptable) => Promise<void>
}

type Etape = 'filtres' | 'apercu' | 'confirmation'

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function TabExportComptable({ historique, chargement, onApercu, onExporter, onRetelecharger }: Props) {
  const now = new Date()
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]

  const [dateDebut, setDateDebut] = useState(debutMois)
  const [dateFin, setDateFin] = useState(today)
  const [etape, setEtape] = useState<Etape>('filtres')
  const [apercuData, setApercuData] = useState<{ nbLignes: number; montant: number; nbNonLettrees: number } | null>(null)
  const [calcul, setCalcul] = useState(false)

  async function handleApercu() {
    if (!dateDebut || !dateFin) { toast.error('Sélectionnez une période'); return }
    setCalcul(true)
    try {
      const result = await onApercu(dateDebut, dateFin)
      if (result.nbLignes === 0 && result.nbNonLettrees === 0) {
        toast.error('Aucune ligne bancaire trouvée sur cette période'); return
      }
      if (result.nbLignes === 0) {
        toast.error('Aucune ligne 100% lettrée — lettrez d\'abord toutes les lignes de la période'); return
      }
      setApercuData(result)
      setEtape('apercu')
    } catch {
      toast.error('Erreur lors du calcul')
    } finally {
      setCalcul(false)
    }
  }

  async function handleExporter() {
    try {
      await onExporter(dateDebut, dateFin)
      toast.success('Export comptable créé — lettrages verrouillés')
      setEtape('filtres')
      setApercuData(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'export')
      setEtape('filtres')
    }
  }

  function reset() { setEtape('filtres'); setApercuData(null) }

  return (
    <div className="flex-1 overflow-auto px-6 py-5 space-y-6">

      {/* Étape 1 — Filtres */}
      {etape === 'filtres' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
              <IcWarning size={13} className="flex-shrink-0" />
              Export comptable — action irréversible
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Les lignes verrouillées ne pourront plus être modifiées depuis le module Lettrage. Toute correction passera par le module Correction.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Période à exporter</p>
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
              <button onClick={handleApercu} disabled={calcul || !dateDebut || !dateFin}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">
                {calcul ? <><IcLoader size={13} /> Calcul…</> : 'Vérifier l\'éligibilité'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">Seules les lignes bancaires <strong>100% lettrées</strong> (restant = 0) sur cette période seront incluses.</p>
          </div>
        </div>
      )}

      {/* Étape 2 — Aperçu */}
      {etape === 'apercu' && apercuData && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <p className="text-sm font-bold text-gray-900">Aperçu de l'export</p>
            <p className="text-xs text-gray-500">Période : <span className="font-medium text-gray-700">{fmtDate(dateDebut)} → {fmtDate(dateFin)}</span></p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{apercuData.nbLignes}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">ligne{apercuData.nbLignes > 1 ? 's' : ''} 100% lettrée{apercuData.nbLignes > 1 ? 's' : ''}</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                <p className="text-2xl font-bold text-ockham-teal">{fmt(apercuData.montant)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">montant total lettré</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">Les lettrages déjà verrouillés dans cette période sont inclus dans l'export mais non re-verrouillés.</p>
          </div>

          {apercuData.nbNonLettrees > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                <IcWarning size={13} className="flex-shrink-0" />
                {apercuData.nbNonLettrees} ligne{apercuData.nbNonLettrees > 1 ? 's' : ''} non lettrée{apercuData.nbNonLettrees > 1 ? 's' : ''} sur la période
              </p>
              <p className="text-xs text-orange-600 mt-1">
                Ces lignes ne seront pas incluses dans l'export. Pour un export exhaustif, lettrez-les d'abord dans le module Lettrage.
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button onClick={reset} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              Annuler
            </button>
            <button onClick={() => setEtape('confirmation')}
              disabled={apercuData.nbNonLettrees > 0}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-ockham-navy hover:bg-ockham-navy/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Bloquer et exporter →
            </button>
          </div>
        </div>
      )}

      {/* Étape 3 — Confirmation */}
      {etape === 'confirmation' && apercuData && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 space-y-2">
            <p className="text-sm font-bold text-red-700 flex items-center gap-2">
              <IcWarning size={14} className="flex-shrink-0" /> Confirmation requise
            </p>
            <p className="text-xs text-red-600">
              Vous allez verrouiller <strong>{apercuData.nbLignes} ligne{apercuData.nbLignes > 1 ? 's' : ''}</strong> ({fmt(apercuData.montant)}) pour la période <strong>{fmtDate(dateDebut)} → {fmtDate(dateFin)}</strong>.
            </p>
            <p className="text-xs text-red-600">
              Ces lignes ne seront plus modifiables depuis le module Lettrage. Toute correction nécessitera de passer par le <strong>module Correction</strong>.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEtape('apercu')} disabled={chargement}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
              Retour
            </button>
            <button onClick={handleExporter} disabled={chargement}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50">
              {chargement ? <><IcLoader size={13} /> Verrouillage…</> : <><IcDownload size={12} /> Confirmer le verrouillage</>}
            </button>
          </div>
        </div>
      )}

      {/* Historique */}
      {historique.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <IcClock size={11} /> Historique des exports
          </p>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date export</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Période</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Lignes</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Montant</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {historique.map(exp => (
                  <tr key={exp.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(exp.created_at)}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(exp.date_debut)} → {fmtDate(exp.date_fin)}</td>
                    <td className="px-3 py-2 text-right text-gray-700 font-mono">{exp.nb_lettrages}</td>
                    <td className="px-3 py-2 text-right text-gray-900 font-mono font-semibold">{fmt(exp.montant_total)}</td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => onRetelecharger(exp)} title="Re-télécharger"
                        className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                        <IcDownload size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
