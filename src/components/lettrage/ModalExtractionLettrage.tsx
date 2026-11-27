// Modale d'extraction des lettrages — onglets [Interne] et [Comptable]
import { useState } from 'react'
import { IcDownload, IcX } from '../Icones'
import { exporterLettrageXls } from '../../lib/exportLettrageXls'
import { TabExportComptable } from './TabExportComptable'
import type { ExportComptable } from '../../hooks/useExportComptable'
import { debutMoisLocal, todayLocal } from '../../lib/dates'
import toast from 'react-hot-toast'

interface Props {
  ouvert: boolean
  onFermer: () => void
  historique: ExportComptable[]
  chargementExport: boolean
  onApercu: (d: string, f: string) => Promise<{ nbLignes: number; montant: number; nbNonLettrees: number; nbCompensations: number; nbCorrections: number }>
  onApercuInterne: (d: string, f: string) => Promise<ApercuInterne>
  onExporter: (d: string, f: string) => Promise<void>
  onRetelecharger: (exp: ExportComptable) => Promise<void>
}

export interface ApercuInterne {
  nbLignesBancaires: number
  nbAffectations: number
  nbLettrees: number
  nbNonLettrees: number
  montantCredit: number
  montantLettre: number
}

type Onglet = 'interne' | 'comptable'

function fmtMontant(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtNombre(n: number) {
  return n.toLocaleString('fr-FR')
}

export function ModalExtractionLettrage({ ouvert, onFermer, historique, chargementExport, onApercu, onApercuInterne, onExporter, onRetelecharger }: Props) {
  const today = todayLocal()
  const debutMois = debutMoisLocal()

  const [onglet, setOnglet] = useState<Onglet>('interne')
  const [dateDebut, setDateDebut] = useState(debutMois)
  const [dateFin, setDateFin] = useState(today)
  const [chargement, setChargement] = useState(false)
  const [apercu, setApercu] = useState<ApercuInterne | null>(null)
  const [calcul, setCalcul] = useState(false)

  // Un aperçu calculé pour une autre période est pire que pas d'aperçu : il
  // donne des chiffres faux à côté de dates justes. On l'efface au changement.
  function changerDates(maj: () => void) {
    maj()
    setApercu(null)
  }

  async function handleApercuInterne() {
    if (!dateDebut || !dateFin) { toast.error('Veuillez sélectionner une période'); return }
    setCalcul(true)
    try {
      setApercu(await onApercuInterne(dateDebut, dateFin))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du calcul de l\'aperçu')
    } finally {
      setCalcul(false)
    }
  }

  async function handleExportInterne() {
    if (!dateDebut || !dateFin) { toast.error('Veuillez sélectionner une période'); return }
    setChargement(true)
    try {
      await exporterLettrageXls(dateDebut, dateFin)
      toast.success('Export généré')
    } catch (err) {
      // Le message de la cause, et non un « Erreur lors de l'export » muet.
      // C'est ce silence qui a rendu indiagnosticable l'échec du 2026-11-27 :
      // le filtre .in() dépassait la longueur d'URL acceptée, et personne ne
      // pouvait le savoir depuis l'écran.
      toast.error(err instanceof Error ? `Export impossible — ${err.message}` : 'Erreur lors de l\'export')
    } finally {
      setChargement(false)
    }
  }

  if (!ouvert) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] min-h-[380px] flex flex-col">

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
                  <input type="date" value={dateDebut} onChange={e => changerDates(() => setDateDebut(e.target.value))}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-ockham-teal bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Date de fin</label>
                  <input type="date" value={dateFin} onChange={e => changerDates(() => setDateFin(e.target.value))}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-ockham-teal bg-white" />
                </div>
                <button onClick={handleApercuInterne} disabled={calcul || !dateDebut || !dateFin}
                  className="text-sm font-semibold text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">
                  {calcul ? '⟳ Calcul…' : 'Aperçu du périmètre'}
                </button>
                <button onClick={handleExportInterne} disabled={chargement || !dateDebut || !dateFin}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">
                  {chargement
                    ? <>⟳ Export…</>
                    : <><IcDownload size={13} className="inline-block mr-1.5" />Extraire XLS</>}
                </button>
              </div>
            </div>

            {apercu ? (
              <div className="flex-1 overflow-auto px-6 py-5">
                <div className="border border-gray-200 rounded-xl p-5">
                  <p className="text-sm font-bold text-gray-900">Aperçu de l'export</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Période : {new Date(dateDebut).toLocaleDateString('fr-FR')} → {new Date(dateFin).toLocaleDateString('fr-FR')}
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-gray-50 rounded-xl px-4 py-3">
                      <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtNombre(apercu.nbAffectations)}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">lignes dans l'onglet Affectation</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-4 py-3">
                      <p className="text-2xl font-bold text-ockham-teal tabular-nums">{fmtMontant(apercu.montantLettre)}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">montant lettré</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="border border-gray-200 rounded-xl px-4 py-2.5">
                      <p className="text-sm font-bold text-gray-800 tabular-nums">{fmtNombre(apercu.nbLignesBancaires)}</p>
                      <p className="text-[11px] text-gray-500">lignes dans l'onglet Lignes bancaires</p>
                    </div>
                    <div className="border border-gray-200 rounded-xl px-4 py-2.5">
                      <p className="text-sm font-bold text-gray-800 tabular-nums">{fmtMontant(apercu.montantCredit)}</p>
                      <p className="text-[11px] text-gray-500">total des crédits de la période</p>
                    </div>
                  </div>

                  {apercu.nbNonLettrees > 0 && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                      <p className="text-xs font-semibold text-amber-700">
                        {fmtNombre(apercu.nbNonLettrees)} ligne{apercu.nbNonLettrees > 1 ? 's' : ''} non lettrée{apercu.nbNonLettrees > 1 ? 's' : ''} sur la période
                      </p>
                      <p className="text-[11px] text-amber-600 mt-0.5">
                        Elles figurent dans l'onglet Lignes bancaires et dans le cadrage, mais n'ont aucune
                        affectation à exporter. {fmtNombre(apercu.nbLettrees)} ligne{apercu.nbLettrees > 1 ? 's sont' : ' est'} intégralement lettrée{apercu.nbLettrees > 1 ? 's' : ''}.
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400 mt-4">
                    Ces nombres sont calculés en base et correspondent exactement au contenu du fichier :
                    ils permettent de recompter ce qui est transmis.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-end px-6 pb-8">
                <p className="text-center text-sm font-medium text-gray-500 mb-2">Export 3 onglets · Format de référence</p>
                <p className="text-center text-sm text-gray-400">Affectation · Lignes bancaires · Cadrage comptable</p>
              </div>
            )}
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
