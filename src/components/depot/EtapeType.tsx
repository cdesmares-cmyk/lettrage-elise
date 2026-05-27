// Étape 1 : sélection du type de fichier à importer
import type { ReactNode } from 'react'
import type { TypeFichier } from '../../types/import'
import { IcBuilding, IcFileText, IcLink, IcUser, IcContacts, IcKey } from '../Icones'

interface Props {
  valeur: TypeFichier | null
  onChange: (type: TypeFichier) => void
  onSuivant: () => void
}

const FORMATS_TOUS = ['CSV', 'XLSX']

const OPTIONS: {
  type: TypeFichier
  icone: ReactNode
  titre: string
  description: string
  pivot: string
  info: string
}[] = [
  {
    type: 'csv_bancaire',
    icone: <IcBuilding size={26} />,
    titre: 'Relevé bancaire',
    description: 'Lignes de transactions exportées depuis votre banque.',
    pivot: 'N° Opération',
    info: 'Toute ligne déjà présente en base sera ignorée automatiquement.',
  },
  {
    type: 'xlsx_factures',
    icone: <IcFileText size={26} />,
    titre: 'Factures',
    description: 'Export de votre logiciel comptable ou ERP (numéros de pièce, montants, échéances).',
    pivot: 'N° de pièce',
    info: 'Toute ligne déjà présente en base sera ignorée automatiquement.',
  },
  {
    type: 'import_lettrage',
    icone: <IcLink size={26} />,
    titre: 'Lettrage',
    description: 'Import en masse de lettrages pour la migration historique. Chaque ligne associe un montant à une facture existante.',
    pivot: 'N° de facture',
    info: 'Les factures absentes de la base seront ignorées. Aucun contrôle doublon — import réalisé en conscience.',
  },
  {
    type: 'import_clients',
    icone: <IcUser size={26} />,
    titre: 'Comptes clients',
    description: 'Création et mise à jour en masse des fiches clients (nom, commercial, opérateur, plateforme, groupement).',
    pivot: 'Code client',
    info: 'Les clients existants seront mis à jour. Les nouveaux codes clients seront créés.',
  },
  {
    type: 'import_contacts',
    icone: <IcContacts size={26} />,
    titre: 'Contacts',
    description: 'Import et mise à jour des contacts rattachés à vos clients (nom, email, téléphone, rôle).',
    pivot: 'Email + Code client',
    info: 'Upsert par email/code client. Colonne "delete" = désactivation. Les doublons email dans le fichier sont ignorés avec alerte.',
  },
]

export function EtapeType({ valeur, onChange, onSuivant }: Props) {
  const optionSelectionnee = OPTIONS.find(o => o.type === valeur)

  return (
    <div>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
        {OPTIONS.map(opt => (
          <button
            key={opt.type}
            onClick={() => onChange(opt.type)}
            className={`relative text-left border-2 rounded-xl p-5 transition-all ${
              valeur === opt.type
                ? 'border-ockham-teal bg-ockham-teal-muted'
                : 'border-gray-200 bg-white hover:border-ockham-teal/40 hover:bg-ockham-teal-muted/30'
            }`}
          >
            {valeur === opt.type && (
              <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-ockham-teal text-white text-[10px] font-bold">
                ✓
              </span>
            )}
            <div className="mb-3 text-gray-500">{opt.icone}</div>
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
      <div className="flex gap-3 bg-ockham-teal-muted border border-ockham-teal/40 rounded-lg px-4 py-3 mb-6 text-sm text-ockham-teal-dark">
        <span className="flex-shrink-0 text-ockham-teal-dark"><IcKey size={15} /></span>
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
          className="bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          Continuer →
        </button>
      </div>
    </div>
  )
}
