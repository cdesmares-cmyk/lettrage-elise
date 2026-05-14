// Panneau gauche : liste des lignes bancaires avec statut de lettrage
import type { LigneBancaireAvecStatut, StatutLettrage } from '../../types/lettrage'
import type { FiltreStatut } from '../../hooks/useLignesBancaires'

interface Props {
  lignes: LigneBancaireAvecStatut[]
  chargement: boolean
  ligneActiveId: string | null
  recherche: string
  filtre: FiltreStatut
  dateDebut: string
  dateFin: string
  onRecherche: (v: string) => void
  onFiltre: (v: FiltreStatut) => void
  onDateDebut: (v: string) => void
  onDateFin: (v: string) => void
  onSelectLigne: (l: LigneBancaireAvecStatut) => void
  onHistorique: () => void
}

function fmt(n: number | null) {
  if (n === null) return '—'
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function DotStatut({ statut }: { statut: StatutLettrage }) {
  if (statut === 'lettre')     return <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]" />
  if (statut === 'partiel')    return <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.2)]" />
  if (statut === 'non_lettre') return <span className="inline-block w-2 h-2 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.2)]" />
  return <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
}

const FILTRES: { val: FiltreStatut; label: string }[] = [
  { val: 'toutes', label: 'Toutes' },
  { val: 'non_lettre', label: 'Non lettrées' },
  { val: 'partiel', label: 'Partielles' },
  { val: 'lettre', label: 'Lettrées' },
]

export function TableLignesBancaires({
  lignes, chargement, ligneActiveId,
  recherche, filtre, dateDebut, dateFin,
  onRecherche, onFiltre, onDateDebut, onDateFin, onSelectLigne, onHistorique,
}: Props) {
  const hasActive = ligneActiveId !== null

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* En-tête avec filtres */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
        {/* Filtres statut */}
        <div className="flex gap-1">
          {FILTRES.map(f => (
            <button
              key={f.val}
              onClick={() => onFiltre(f.val)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                filtre === f.val ? 'bg-ockham-teal text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={onHistorique}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-200 text-gray-500 hover:border-ockham-teal hover:text-ockham-teal hover:bg-ockham-teal-muted transition-colors whitespace-nowrap"
        >
          📋 Historique
        </button>

        <div className="flex-1" />

        {/* Filtre période */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Du</span>
          <input
            type="date"
            value={dateDebut}
            onChange={e => onDateDebut(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-600 outline-none focus:border-ockham-teal bg-white"
          />
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">au</span>
          <input
            type="date"
            value={dateFin}
            onChange={e => onDateFin(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-600 outline-none focus:border-ockham-teal bg-white"
          />
          {(dateDebut || dateFin) && (
            <button
              onClick={() => { onDateDebut(''); onDateFin('') }}
              className="text-[10px] text-gray-400 hover:text-red-400 transition-colors px-1"
              title="Effacer le filtre date"
            >
              ✕
            </button>
          )}
        </div>

        {/* Recherche */}
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5">
          <span className="text-gray-400 text-xs">🔍</span>
          <input
            type="text"
            value={recherche}
            onChange={e => onRecherche(e.target.value)}
            placeholder="Libellé, réf…"
            className="text-xs text-gray-700 placeholder-gray-400 outline-none w-32 bg-transparent"
          />
        </div>
      </div>

      {/* Table */}
      {chargement ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Chargement…
        </div>
      ) : lignes.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Aucune ligne bancaire trouvée.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="w-8 px-3 py-2" />
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Date</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Libellé</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Débit</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Crédit</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Restant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lignes.map(ligne => {
                const isDebit = ligne.statut_lettrage === 'debit'
                const isActive = ligne.id_operation === ligneActiveId
                const isDimmed = hasActive && !isActive && !isDebit

                return (
                  <tr
                    key={ligne.id_operation}
                    onClick={() => !isDebit && onSelectLigne(ligne)}
                    className={`transition-all ${
                      isDebit ? 'bg-gray-50/60 cursor-default' :
                      isActive ? 'bg-ockham-teal-muted border-l-[3px] border-ockham-teal cursor-pointer' :
                      isDimmed ? 'opacity-30 cursor-pointer' :
                      'hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <DotStatut statut={ligne.statut_lettrage} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap font-mono">
                      {formatDate(ligne.date_operation)}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className={`text-sm font-medium truncate max-w-[280px] ${isDebit ? 'text-gray-400' : 'text-gray-800'}`}>
                        {ligne.libelle}
                      </p>
                      {(ligne.infos_complementaires || ligne.detail) && (
                        <p className="text-[11px] text-gray-400 truncate max-w-[280px] mt-0.5">
                          {ligne.infos_complementaires ?? ligne.detail}
                        </p>
                      )}
                      {isDebit && (
                        <span className="inline-flex items-center bg-red-50 text-red-400 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5">
                          Débit — lecture seule
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-red-500 font-mono whitespace-nowrap">
                      {ligne.debit !== null ? fmt(ligne.debit) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-700 font-mono whitespace-nowrap">
                      {ligne.credit !== null ? fmt(ligne.credit) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold font-mono whitespace-nowrap">
                      {isDebit ? (
                        <span className="text-gray-300">—</span>
                      ) : ligne.restant <= 0.005 ? (
                        <span className="text-emerald-600">0,00</span>
                      ) : (
                        <span className={ligne.statut_lettrage === 'partiel' ? 'text-amber-600' : 'text-blue-600'}>
                          {fmt(ligne.restant)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
