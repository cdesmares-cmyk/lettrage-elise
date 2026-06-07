// Onglet [Compte] — deux sections : Comptes 411 (indigo) + En attente 471 (orange)
import type { FactureDetail } from '../../types/client'
import type { LigneBancaireAvecStatut } from '../../types/lettrage'
import type { FiltreStatut } from '../../hooks/useLignesBancaires'
import { IcSearch, IcClock, IcX } from '../Icones'

const FILTRES: { val: FiltreStatut; label: string }[] = [
  { val: 'a_lettrer',        label: 'À lettrer' },
  { val: 'partiel',          label: 'Partielles' },
  { val: 'lettre',           label: 'Lettrées' },
  { val: 'compte',           label: 'Compte' },
  { val: 'autres_virements', label: 'Autres Virements' },
]

interface Props {
  factures411: FactureDetail[]
  lignes471: LigneBancaireAvecStatut[]
  selectedId: string | null
  onSelect411: (f: FactureDetail) => void
  onSelect471: (l: LigneBancaireAvecStatut) => void
  onAnnuler411: (f: FactureDetail) => void
  onAnnuler471: (l: LigneBancaireAvecStatut) => void
  chargement: boolean
  filtre: FiltreStatut
  onFiltre: (v: FiltreStatut) => void
  libelles411?: Record<string, string>
  recherche: string
  onRecherche: (v: string) => void
  dateDebut: string
  dateFin: string
  onDateDebut: (v: string) => void
  onDateFin: (v: string) => void
  onHistorique: () => void
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export function TableCompte({
  factures411, lignes471, selectedId, onSelect411, onSelect471, onAnnuler411, onAnnuler471,
  chargement, filtre, onFiltre, libelles411,
  recherche, onRecherche, dateDebut, dateFin, onDateDebut, onDateFin, onHistorique,
}: Props) {
  const term = recherche.trim().toLowerCase()

  const factures411Filtrees = term
    ? factures411.filter(f =>
        (f.nom_client ?? '').toLowerCase().includes(term) ||
        f.numero_piece.toLowerCase().includes(term) ||
        (libelles411?.[f.numero_piece] ?? '').toLowerCase().includes(term)
      )
    : factures411

  const rien = factures411Filtrees.length === 0 && lignes471.length === 0

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-2">
        {/* Ligne 1 : recherche + période + historique */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[180px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <IcSearch size={13} className="text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={recherche}
              onChange={e => onRecherche(e.target.value)}
              placeholder="Client, référence, libellé…"
              className="text-xs text-gray-700 placeholder-gray-400 outline-none flex-1 bg-transparent min-w-0"
            />
            {recherche && (
              <button onClick={() => onRecherche('')} className="text-gray-300 hover:text-gray-500 text-xs flex-shrink-0">✕</button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Du</span>
            <input
              type="date"
              value={dateDebut}
              onChange={e => onDateDebut(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-ockham-teal bg-white"
            />
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">au</span>
            <input
              type="date"
              value={dateFin}
              onChange={e => onDateFin(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-ockham-teal bg-white"
            />
            {(dateDebut || dateFin) && (
              <button
                onClick={() => { onDateDebut(''); onDateFin('') }}
                className="text-[10px] text-gray-400 hover:text-red-400 transition-colors px-1"
                title="Effacer les dates"
              >✕</button>
            )}
          </div>

          <button
            onClick={onHistorique}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-ockham-teal hover:text-ockham-teal transition-colors whitespace-nowrap flex-shrink-0"
          >
            <IcClock size={12} className="flex-shrink-0" /> Historique
          </button>
        </div>

        {/* Ligne 2 : filtres statut */}
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
      </div>

      {chargement ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Chargement…</div>
      ) : rien ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
          <p className="font-medium">{term ? 'Aucun résultat' : 'Aucune entrée en compte'}</p>
          {!term && <p className="text-xs mt-1 text-gray-300">Utilisez "Affecter ce paiement" pour alimenter cet onglet</p>}
        </div>
      ) : (
        <div>
          {/* Section 411 */}
          {factures411Filtrees.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-indigo-50/60 border-b border-indigo-100">
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                  Compte 411 — {factures411Filtrees.length} ligne{factures411Filtrees.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {factures411Filtrees.map(f => {
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
                          {libelles411?.[f.numero_piece] && (
                            <p className="text-[11px] text-gray-400 truncate max-w-[200px]">{libelles411[f.numero_piece]}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums text-indigo-600">{fmt(montant)}</p>
                          <p className="text-[10px] text-gray-400">à dispatcher</p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); onAnnuler411(f) }}
                          title="Annuler ce lettrage 411"
                          className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0"
                        >
                          <IcX size={13} />
                        </button>
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
                  Compte 411 Attente — {lignes471.length} ligne{lignes471.length > 1 ? 's' : ''}
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
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums text-orange-600">{fmt(l.restant)}</p>
                          <p className="text-[10px] text-gray-400">à dispatcher</p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); onAnnuler471(l) }}
                          title="Annuler ce lettrage en attente"
                          className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0"
                        >
                          <IcX size={13} />
                        </button>
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
