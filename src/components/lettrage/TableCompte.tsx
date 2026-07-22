// Onglet [Compte] — 411 Attente uniquement (lignes urgentes à dispatcher)
import type { LigneBancaireAvecStatut } from '../../types/lettrage'
import { IcX } from '../Icones'

interface Props {
  lignes411Attente: LigneBancaireAvecStatut[]
  selectedId: string | null
  onSelect411Attente: (l: LigneBancaireAvecStatut) => void
  onAnnuler411Attente: (l: LigneBancaireAvecStatut) => void
  chargement: boolean
  lignesExportees?: Map<string, string>
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export function TableCompte({
  lignes411Attente, selectedId,
  onSelect411Attente, onAnnuler411Attente,
  chargement, lignesExportees,
}: Props) {
  if (chargement) {
    return <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Chargement…</div>
  }

  if (lignes411Attente.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
        <p className="font-medium">Aucune ligne en attente 411</p>
        <p className="text-xs mt-1 text-gray-300">Les paiements affectés à un compte 411 apparaissent ici</p>
      </div>
    )
  }

  return (
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
                  <p className="text-sm font-bold tabular-nums text-orange-600">{fmt(l.credit_attente_411)}</p>
                  <p className="text-[10px] text-gray-400">à dispatcher</p>
                </div>
                {estExporte ? (
                  <span
                    title="Export comptable effectué — correction via le module Correction"
                    className="inline-flex items-center text-[10px] text-gray-400 bg-gray-100 border border-gray-200 px-2 py-1 rounded cursor-not-allowed"
                  >
                    Exporté
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
  )
}
