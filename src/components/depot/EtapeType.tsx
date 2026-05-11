// Étape 1 : sélection du type de fichier à importer
import type { TypeFichier } from '../../types/import'

interface Props {
  valeur: TypeFichier | null
  onChange: (type: TypeFichier) => void
  onSuivant: () => void
}

const FORMATS_TOUS = ['CSV', 'XLSX']

const OPTIONS: {
  type: TypeFichier
  icone: string
  titre: string
  description: string
  pivot: string
  info: string
}[] = [
  {
    type: 'csv_bancaire',
    icone: '🏦',
    titre: 'Relevé bancaire',
    description: 'Lignes de transactions exportées depuis votre banque.',
    pivot: 'N° Opération',
    info: 'Toute ligne déjà présente en base sera ignorée automatiquement.',
  },
  {
    type: 'xlsx_factures',
    icone: '🧾',
    titre: 'Factures',
    description: 'Export de votre logiciel comptable ou ERP (numéros de pièce, montants, échéances).',
    pivot: 'N° de pièce',
    info: 'Toute ligne déjà présente en base sera ignorée automatiquement.',
  },
  {
    type: 'import_clients',
    icone: '👤',
    titre: 'Comptes clients',
    description: 'Création et mise à jour en masse des fiches clients (nom, commercial, opérateur, plateforme, groupement).',
    pivot: 'Code client',
    info: 'Les clients existants seront mis à jour. Les nouveaux codes clients seront créés.',
  },
]

export function EtapeType({ valeur, onChange, onSuivant }: Props) {
  const optionSelectionnee = OPTIONS.find(o => o.type === valeur)

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-5">
        {OPTIONS.map(opt => (
          <button
            key={opt.type}
            onClick={() => onChange(opt.type)}
            className={`relative text-left border-2 rounded-xl p-5 transition-all ${
              valeur === opt.type
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
            }`}
          >
            {valeur === opt.type && (
              <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">
                ✓
              </span>
            )}
            <div className="text-2xl mb-3">{opt.icone}</div>
            <p className="font-semibold text-sm text-gray-900 mb-1">{opt.titre}</p>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">{opt.description}</p>
            <div className="flex gap-1.5 flex-wrap">
              {FORMATS_TOUS.map(f => (
                <span key={f} className="bg-gray-100 text-gray-600 text-[11px] font-mono font-semibold px-2 py-0.5 rounded">
                  .{f.toLowerCase()}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Info clé pivot */}
      <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 text-sm text-blue-800">
        <span className="text-base flex-shrink-0">🔑</span>
        <span>
          {optionSelectionnee
            ? <>Clé pivot : <strong>{optionSelectionnee.pivot}</strong>. {optionSelectionnee.info}</>
            : <>Sélectionnez un type pour voir la clé pivot utilisée.</>
          }
        </span>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onSuivant}
          disabled={!valeur}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          Continuer →
        </button>
      </div>
    </div>
  )
}
