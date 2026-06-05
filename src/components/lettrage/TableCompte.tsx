// Onglet [Compte] — deux sections : Comptes 411 (indigo) + En attente 471 (orange)
import type { FactureDetail } from '../../types/client'
import type { LigneBancaireAvecStatut } from '../../types/lettrage'
import type { FiltreStatut } from '../../hooks/useLignesBancaires'

const FILTRES: { val: FiltreStatut; label: string }[] = [
  { val: 'a_lettrer',        label: 'À lettrer' },
  { val: 'partiel',          label: 'Partielles' },
  { val: 'lettre',           label: 'Lettrées' },
  { val: 'toutes',           label: 'Toutes' },
  { val: 'compte',           label: 'Compte' },
  { val: 'autres_virements', label: 'Autres Virements' },
]

interface Props {
  factures411: FactureDetail[]
  lignes471: LigneBancaireAvecStatut[]
  selectedId: string | null
  onSelect411: (f: FactureDetail) => void
  onSelect471: (l: LigneBancaireAvecStatut) => void
  chargement: boolean
  filtre: FiltreStatut
  onFiltre: (v: FiltreStatut) => void
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export function TableCompte({ factures411, lignes471, selectedId, onSelect411, onSelect471, chargement, filtre, onFiltre }: Props) {
  const rien = factures411.length === 0 && lignes471.length === 0

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 space-y-2">
        <div className="flex gap-1 flex-wrap">
          {FILTRES.map(f => (
            <button
              key={f.val}
              onClick={() => onFiltre(f.val)}
              className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                filtre === f.val ? 'bg-ockham-teal text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">Comptes clients 411 et lignes en attente d'affectation</p>
      </div>

      {chargement ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Chargement…</div>
      ) : rien ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
          <p className="font-medium">Aucune entrée en compte</p>
          <p className="text-xs mt-1 text-gray-300">Utilisez "Affecter ce paiement" pour alimenter cet onglet</p>
        </div>
      ) : (
        <div>
          {/* Section 411 */}
          {factures411.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-indigo-50/60 border-b border-indigo-100">
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                  Comptes 411 — {factures411.length} entrée{factures411.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {factures411.map(f => {
                  const isActive = f.numero_piece === selectedId
                  const montant = Math.abs(f.reste_du)
                  return (
                    <div
                      key={f.numero_piece}
                      onClick={() => onSelect411(f)}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all ${
                        isActive ? 'bg-indigo-50 border-l-[3px] border-indigo-500' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {f.nom_client ?? f.numero_piece.replace('411_', '')}
                          </p>
                          <p className="text-[11px] font-mono text-indigo-400">{f.numero_piece}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold tabular-nums text-indigo-600">{fmt(montant)}</p>
                        <p className="text-[10px] text-gray-400">à dispatcher</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Section 471 */}
          {lignes471.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-orange-50/60 border-b border-orange-100">
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                  411 Attente — {lignes471.length} ligne{lignes471.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {lignes471.map(l => {
                  const isActive = l.id_operation === selectedId
                  return (
                    <div
                      key={l.id_operation}
                      onClick={() => onSelect471(l)}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all ${
                        isActive ? 'bg-orange-50 border-l-[3px] border-orange-400' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-block w-2 h-2 rounded-full bg-orange-400 flex-shrink-0 shadow-[0_0_0_3px_rgba(251,146,60,0.15)]" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{l.libelle}</p>
                          <p className="text-[11px] text-gray-400">
                            {formatDate(l.date_operation)}
                            {l.infos_complementaires && <> · {l.infos_complementaires}</>}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold tabular-nums text-orange-600">{fmt(l.restant)}</p>
                        <p className="text-[10px] text-gray-400">à dispatcher</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
