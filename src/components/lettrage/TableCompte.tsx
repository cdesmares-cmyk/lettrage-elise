// Onglet [Compte] — deux sections : Comptes 411 Client (indigo) + 411 Attente (orange)
import type { FactureDetail } from '../../types/client'
import type { LigneBancaireAvecStatut } from '../../types/lettrage'
import { IcX } from '../Icones'
import { TOLERANCE_CENT } from '../../lib/constantes'

interface Props {
  factures411: FactureDetail[]
  lignes411Attente: LigneBancaireAvecStatut[]
  selectedId: string | null
  onSelect411: (f: FactureDetail) => void
  onSelect411Attente: (l: LigneBancaireAvecStatut) => void
  onAnnuler411: (f: FactureDetail) => void
  onAnnuler411Attente: (l: LigneBancaireAvecStatut) => void
  chargement: boolean
  libelles411?: Record<string, { libelle: string; detail: string | null }>
  recherche: string
  lignesExportees?: Map<string, string>
  comptes411AvecDispatch?: Set<string>
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export function TableCompte({
  factures411, lignes411Attente, selectedId, onSelect411, onSelect411Attente,
  onAnnuler411, onAnnuler411Attente,
  chargement, libelles411, recherche,
  lignesExportees, comptes411AvecDispatch,
}: Props) {
  const term = recherche.trim().toLowerCase()

  const factures411Filtrees = term
    ? factures411.filter(f =>
        (f.nom_client ?? '').toLowerCase().includes(term) ||
        f.numero_piece.toLowerCase().includes(term) ||
        (libelles411?.[f.numero_piece]?.libelle ?? '').toLowerCase().includes(term) ||
        (libelles411?.[f.numero_piece]?.detail ?? '').toLowerCase().includes(term)
      )
    : factures411

  const rien = factures411Filtrees.length === 0 && lignes411Attente.length === 0

  return (
    <>
      {chargement ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Chargement…</div>
      ) : rien ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
          <p className="font-medium">{term ? 'Aucun résultat' : 'Aucune entrée en compte'}</p>
          {!term && <p className="text-xs mt-1 text-gray-300">Utilisez "Affecter ce paiement" pour alimenter cet onglet</p>}
        </div>
      ) : (
        <div>
          {/* Section 411 Client */}
          {factures411Filtrees.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-indigo-50/60 border-b border-indigo-100">
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                  Compte 411 Client — {factures411Filtrees.length} ligne{factures411Filtrees.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {factures411Filtrees.map(f => {
                  const isActive = f.numero_piece === selectedId
                  const montant = Math.abs(f.reste_du)
                  const aDispatch = comptes411AvecDispatch?.has(f.numero_piece) ?? false
                  return (
                    <div
                      key={f.numero_piece}
                      onClick={() => onSelect411(f)}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all ${
                        isActive ? 'bg-indigo-50 border-l-[3px] border-indigo-500' : 'hover:bg-ockham-teal/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {f.nom_client ?? f.numero_piece.replace('411_', '')}
                          </p>
                          <p className="text-[11px] font-mono text-indigo-400">{f.numero_piece}</p>
                          {libelles411?.[f.numero_piece] && (
                            <p className="text-[11px] text-gray-400 truncate max-w-[200px]">
                              {libelles411[f.numero_piece].libelle}
                              {libelles411[f.numero_piece].detail ? ` · ${libelles411[f.numero_piece].detail}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums text-indigo-600">{fmt(montant)}</p>
                          <p className="text-[10px] text-gray-400">à dispatcher</p>
                        </div>
                        {aDispatch ? (
                          <span
                            title="Dispatch partiel effectué — impossible d'annuler"
                            className="inline-flex items-center text-[10px] text-indigo-400 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded cursor-not-allowed"
                          >
                            Partiel
                          </span>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); onAnnuler411(f) }}
                            title="Annuler ce compte 411"
                            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0"
                          >
                            <IcX size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Section 411 Attente */}
          {lignes411Attente.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-orange-50/60 border-b border-orange-100">
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                  Compte 411 Attente — {lignes411Attente.length} ligne{lignes411Attente.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {lignes411Attente.map(l => {
                  const isActive = l.id_operation === selectedId
                  const estExporte = lignesExportees?.has(l.id_operation) ?? false
                  const aLettrages = l.montant_lettre > TOLERANCE_CENT
                  return (
                    <div
                      key={l.id_operation}
                      onClick={() => onSelect411Attente(l)}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all ${
                        isActive ? 'bg-orange-50 border-l-[3px] border-orange-400' : 'hover:bg-orange-50/50'
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
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums text-orange-600">{fmt(l.restant)}</p>
                          <p className="text-[10px] text-gray-400">à dispatcher</p>
                        </div>
                        {estExporte ? (
                          <span
                            title="Export comptable effectué — correction via le module Correction"
                            className="inline-flex items-center text-[10px] text-gray-400 bg-gray-100 border border-gray-200 px-2 py-1 rounded cursor-not-allowed"
                          >
                            Exporté
                          </span>
                        ) : aLettrages ? (
                          <span
                            title="Lettrage(s) existant(s) sur cette ligne — impossible d'annuler"
                            className="inline-flex items-center text-[10px] text-orange-400 bg-orange-50 border border-orange-200 px-2 py-1 rounded cursor-not-allowed"
                          >
                            Partiel
                          </span>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); onAnnuler411Attente(l) }}
                            title="Annuler ce lettrage en attente"
                            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0"
                          >
                            <IcX size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
