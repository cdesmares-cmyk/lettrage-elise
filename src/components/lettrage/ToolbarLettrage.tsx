// Barre d'outils partagée — identique sur toutes les vues du module Lettrage
import { IcSearch, IcClock, IcX } from '../Icones'
import type { FiltreStatut } from '../../hooks/useLignesBancaires'

interface Props {
  recherche: string
  onRecherche: (v: string) => void
  filtre: FiltreStatut
  onFiltre: (v: FiltreStatut) => void
  dateDebut: string
  dateFin: string
  onDateDebut: (v: string) => void
  onDateFin: (v: string) => void
  onHistorique: () => void
  nbComptes?: number
}

const FILTRES: { val: FiltreStatut; label: string }[] = [
  { val: 'toutes',           label: 'Toutes' },
  { val: 'a_lettrer',        label: 'À lettrer' },
  { val: 'partiel',          label: 'Partielles' },
  { val: 'lettre',           label: 'Lettrées' },
  { val: 'compte',           label: 'Compte' },
  { val: 'autres_virements', label: 'Autres virements perçus' },
]

export function ToolbarLettrage({ recherche, onRecherche, filtre, onFiltre, dateDebut, dateFin, onDateDebut, onDateFin, onHistorique, nbComptes }: Props) {
  return (
    <div className="px-4 py-3 border-b border-gray-100 space-y-2">
      {/* Ligne 1 : recherche + période + historique */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
          <IcSearch size={13} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={recherche}
            onChange={e => onRecherche(e.target.value)}
            placeholder="Client, libellé, référence…"
            className="text-xs text-gray-700 placeholder-gray-400 outline-none flex-1 bg-transparent min-w-0"
          />
          {recherche && (
            <button onClick={() => onRecherche('')} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
              <IcX size={11} />
            </button>
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
              className="text-gray-400 hover:text-red-400 transition-colors px-1"
              title="Effacer les dates"
            >
              <IcX size={10} />
            </button>
          )}
        </div>

        <button
          onClick={onHistorique}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-ockham-teal hover:text-ockham-teal transition-colors whitespace-nowrap flex-shrink-0"
        >
          <IcClock size={12} className="flex-shrink-0" /> Historique
        </button>
      </div>

      {/* Ligne 2 : filtres + légende */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {FILTRES.map(f => (
            <button
              key={f.val}
              onClick={() => onFiltre(f.val)}
              className={`relative text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                filtre === f.val ? 'bg-ockham-teal text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {f.label}
              {f.val === 'compte' && !!nbComptes && nbComptes > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-400" />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-shrink-0">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Lettré</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Partiel</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Non lettré</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />411 Attente</span>
        </div>
      </div>
    </div>
  )
}
