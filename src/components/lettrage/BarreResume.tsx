import { IcBuilding } from '../Icones'

interface Props {
  nbNonLettres: number
  montantRestant: number
  nbRemisesEnAttente: number
  nbLignesGlobal: number
  onCorrection: () => void
  onOuvrirRemises: () => void
  readOnly?: boolean
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function BarreResume({ nbNonLettres, montantRestant, nbRemisesEnAttente, nbLignesGlobal, onCorrection, onOuvrirRemises, readOnly = false }: Props) {
  const nbLettrees = Math.max(0, nbLignesGlobal - nbNonLettres)
  const pct = nbLignesGlobal > 0 ? Math.round((nbLettrees / nbLignesGlobal) * 100) : 0

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-5 py-4 mb-5 space-y-3">
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex flex-col">
          <span className="text-[22px] font-extrabold tabular-nums leading-tight text-red-600">{nbNonLettres}</span>
          <span className="text-[11px] text-gray-500 mt-0.5">Lignes non lettrées</span>
        </div>

        <div className="w-px h-9 bg-gray-100 self-stretch" />

        <div className="flex flex-col">
          <span className="text-[22px] font-extrabold tabular-nums leading-tight text-amber-600">{fmt(montantRestant)}</span>
          <span className="text-[11px] text-gray-500 mt-0.5">Restant à attribuer</span>
        </div>

        <div className="w-px h-9 bg-gray-100 self-stretch" />

        <div className="flex flex-col">
          <span className={`text-[22px] font-extrabold tabular-nums leading-tight ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
            {pct} %
          </span>
          <span className="text-[11px] text-gray-500 mt-0.5">Relevé lettré</span>
        </div>

        {!readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onOuvrirRemises}
              className="relative flex items-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <IcBuilding size={13} className="flex-shrink-0" /> Chèque / LCR
              {nbRemisesEnAttente > 0 && (
                <span className="bg-white text-ockham-teal text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                  {nbRemisesEnAttente}
                </span>
              )}
            </button>
            <button
              onClick={onCorrection}
              className="flex items-center gap-2 border border-gray-200 hover:border-ockham-teal hover:text-ockham-teal text-gray-600 text-sm font-semibold px-4 py-2 rounded-lg transition-all"
            >
              ✎ Correction
            </button>
          </div>
        )}
      </div>

      {/* Barre de progression */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #4CC5BB, #3BA89F)',
          }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-gray-400">
        <span>{nbLettrees} / {nbLignesGlobal} opérations lettrées</span>
        <span>Objectif : 100 %</span>
      </div>
    </div>
  )
}
