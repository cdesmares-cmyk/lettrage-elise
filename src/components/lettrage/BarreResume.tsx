// Barre de résumé en haut de la page lettrage
interface Props {
  nbNonLettres: number
  montantRestant: number
  totalCreditImporte: number
  onCorrection: () => void
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function BarreResume({ nbNonLettres, montantRestant, totalCreditImporte, onCorrection }: Props) {
  return (
    <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-5 py-3 mb-5 shadow-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums text-red-600">{nbNonLettres}</span>
        <span className="text-xs font-medium text-gray-500">lignes non lettrées</span>
      </div>

      <div className="w-px h-7 bg-gray-200" />

      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums text-amber-600">{fmt(montantRestant)}</span>
        <span className="text-xs font-medium text-gray-500">restant à attribuer</span>
      </div>

      <div className="w-px h-7 bg-gray-200" />

      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums text-slate-700">{fmt(totalCreditImporte)}</span>
        <span className="text-xs font-medium text-gray-500">total crédits importés</span>
      </div>

      <div className="ml-auto">
        <button
          onClick={onCorrection}
          className="flex items-center gap-2 border-2 border-gray-200 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg transition-all"
        >
          ✏️ Correction
        </button>
      </div>
    </div>
  )
}
