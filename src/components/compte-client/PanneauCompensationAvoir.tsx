// Panneau latéral — compensation interne avoir/facture
// Flow : sélection avoir source → sélection facture(s) → validation
import type { FactureDetail } from '../../types/client'
import type { useCompensationAvoir } from '../../hooks/useCompensationAvoir'
import { TOLERANCE_CENT } from '../../lib/constantes'

type CompensationAvoir = ReturnType<typeof useCompensationAvoir>

interface Props {
  factures: FactureDetail[]
  compensation: CompensationAvoir
  onFermer: () => void
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const avoirs     = (fs: FactureDetail[]) => fs.filter(f => f.est_avoir && f.reste_du < -TOLERANCE_CENT)
const facturesDues = (fs: FactureDetail[], avoirCode: string) =>
  fs.filter(f => !f.est_avoir && f.reste_du > TOLERANCE_CENT && f.code_client === avoirCode)

export function PanneauCompensationAvoir({ factures, compensation, onFermer }: Props) {
  const { avoirSource, chargement, creditDisponible, montantAttribue, restant } = compensation

  const listeAvoirs = avoirs(factures)

  function fermerEtReset() { compensation.annuler(); onFermer() }

  const motif = compensation.motifInvalide()

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={fermerEtReset} />
      <div className="fixed top-0 right-0 bottom-0 w-[400px] bg-white shadow-2xl z-50 flex flex-col">

        {/* En-tête */}
        <div className="flex items-start justify-between px-5 py-4 bg-violet-900">
          <div>
            <p className="text-sm font-bold text-slate-100">Compensation avoir</p>
            <p className="text-xs text-violet-300 mt-0.5">
              {avoirSource
                ? `Source : ${avoirSource.numero_piece} — ${fmt(creditDisponible)} disponibles`
                : 'Sélectionnez un avoir ci-dessous'}
            </p>
          </div>
          <button
            onClick={fermerEtReset}
            className="w-7 h-7 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-slate-300 text-sm flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Section avoirs ── */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Avoirs disponibles
            </p>
            {listeAvoirs.length === 0 ? (
              <p className="text-xs text-gray-400 italic px-1">Aucun avoir avec solde disponible sur ce compte.</p>
            ) : (
              <div className="space-y-1.5">
                {listeAvoirs.map(f => {
                  const isSource = avoirSource?.numero_piece === f.numero_piece
                  return (
                    <button
                      key={f.numero_piece}
                      onClick={() => compensation.selectionnerAvoir(f)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        isSource
                          ? 'bg-violet-50 border-violet-400 ring-1 ring-violet-300'
                          : 'bg-white border-gray-200 hover:border-violet-300 hover:bg-violet-50/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 font-mono">{f.numero_piece}</p>
                        <p className="text-[10px] text-gray-400">{formatDate(f.date_emission)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-sm font-bold tabular-nums text-violet-700">{fmt(Math.abs(f.reste_du))}</span>
                        {isSource && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">
                            Source
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Section factures (visible uniquement si avoir source sélectionné) ── */}
          {avoirSource && (
            <div className="px-4 pt-4 pb-2 border-t border-gray-100 mt-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Factures à compenser
              </p>
              {facturesDues(factures, avoirSource.code_client).length === 0 ? (
                <p className="text-xs text-gray-400 italic px-1">Aucune facture impayée sur ce compte.</p>
              ) : (
                <div className="space-y-1.5">
                  {facturesDues(factures, avoirSource.code_client).map(f => {
                    const selectionne = compensation.estSelectionne(f.numero_piece)
                    const montantDispo = Math.min(f.reste_du, restant + (selectionne ? (compensation.selection.find(s => s.facture.numero_piece === f.numero_piece)?.montant ?? 0) : 0))
                    const horsPortee = !selectionne && restant < TOLERANCE_CENT
                    const entree = compensation.selection.find(s => s.facture.numero_piece === f.numero_piece)

                    return (
                      <div
                        key={f.numero_piece}
                        className={`rounded-lg border transition-all ${
                          selectionne
                            ? 'bg-violet-50/60 border-violet-300'
                            : horsPortee
                            ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                            : 'bg-white border-gray-200 hover:border-violet-300 cursor-pointer'
                        }`}
                        onClick={() => !horsPortee && compensation.toggleFacture(f)}
                      >
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                              selectionne ? 'bg-violet-600 border-violet-600' : 'border-gray-300 bg-white'
                            }`}>
                              {selectionne && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-800 font-mono">{f.numero_piece}</p>
                              <p className="text-[10px] text-gray-400">{formatDate(f.date_echeance ?? f.date_emission)}</p>
                            </div>
                          </div>
                          <div className="flex-shrink-0 ml-2 text-right">
                            <p className="text-xs font-bold tabular-nums text-gray-700">{fmt(f.reste_du)}</p>
                            {horsPortee && <p className="text-[9px] text-gray-400">Avoir insuffisant</p>}
                          </div>
                        </div>

                        {/* Champ montant si sélectionné */}
                        {selectionne && entree && (
                          <div
                            className="px-3 pb-2.5 flex items-center gap-2"
                            onClick={e => e.stopPropagation()}
                          >
                            <label className="text-[10px] text-violet-600 font-semibold flex-shrink-0">Montant à compenser :</label>
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min={0.01}
                                max={Math.min(f.reste_du, montantDispo)}
                                step={0.01}
                                value={entree.montant}
                                onChange={e => compensation.setMontant(f.numero_piece, parseFloat(e.target.value) || 0)}
                                className="w-full border border-violet-300 rounded-md px-2 py-1 text-xs font-mono text-gray-700 outline-none focus:border-violet-500 text-right pr-6"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">€</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Barre de total */}
        {avoirSource && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/70">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-gray-500">Alloué</span>
              <span className="font-bold tabular-nums text-violet-700">{fmt(montantAttribue)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Restant avoir</span>
              <span className={`font-semibold tabular-nums ${restant < -TOLERANCE_CENT ? 'text-red-600' : 'text-gray-600'}`}>
                {fmt(Math.max(0, restant))}
              </span>
            </div>
            {/* Barre de progression */}
            <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, creditDisponible > 0 ? (montantAttribue / creditDisponible) * 100 : 0)}%` }}
              />
            </div>
          </div>
        )}

        {/* Pied de page */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={fermerEtReset}
            disabled={chargement}
            className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={compensation.valider}
            disabled={!compensation.peutValider() || chargement}
            title={motif ?? undefined}
            className="flex-[2] flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            {chargement ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Enregistrement…
              </>
            ) : (
              <>Valider la compensation{montantAttribue > TOLERANCE_CENT ? ` (${fmt(montantAttribue)})` : ''}</>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
