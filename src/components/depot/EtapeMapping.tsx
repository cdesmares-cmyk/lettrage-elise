// Étape 3 : correspondance des colonnes fichier → champs base de données
import { CHAMPS_BANCAIRES, CHAMPS_FACTURES } from '../../lib/champsImport'
import type { LigneMapping, TypeFichier } from '../../types/import'

interface Props {
  typeFichier: TypeFichier
  mapping: LigneMapping[]
  onChangerMapping: (index: number, champCible: string | null) => void
  onSuivant: () => void
  onRetour: () => void
  chargement: boolean
  nbLignes: number
  nomFichier: string
}

export function EtapeMapping({
  typeFichier, mapping, onChangerMapping, onSuivant, onRetour, chargement, nbLignes, nomFichier,
}: Props) {
  const champs = typeFichier === 'csv_bancaire' ? CHAMPS_BANCAIRES : CHAMPS_FACTURES
  const champPivot = champs.find(c => c.est_pivot)

  const pivotMappe = mapping.some(m => m.champ_cible === champPivot?.cle)
  const champsRequisNonMappes = champs.filter(
    c => c.requis && !c.est_pivot && !mapping.some(m => m.champ_cible === c.cle)
  )

  return (
    <div>
      {/* En-tête fichier */}
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700">{nomFichier}</span>
        <span>·</span>
        <span>{nbLignes.toLocaleString('fr-FR')} lignes détectées</span>
      </div>

      {/* Avertissement pivot manquant */}
      {!pivotMappe && (
        <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-red-700">
          <span>⚠️</span>
          <span>La colonne <strong>{champPivot?.label}</strong> (clé pivot) doit être mappée pour continuer.</span>
        </div>
      )}

      {/* Avertissement champs requis */}
      {champsRequisNonMappes.length > 0 && pivotMappe && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-amber-700">
          <span>⚠️</span>
          <span>
            Champs recommandés non mappés :{' '}
            {champsRequisNonMappes.map(c => c.label).join(', ')}.
            Vous pouvez continuer mais ces données ne seront pas importées.
          </span>
        </div>
      )}

      {/* Tableau de mapping */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 mb-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Colonne dans votre fichier
              </th>
              <th className="px-2 py-2.5 w-8" />
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Champ base de données
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Exemple
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Statut
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mapping.map((m, i) => {
              const champInfo = champs.find(c => c.cle === m.champ_cible)
              return (
                <tr key={m.colonne_source} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      {m.colonne_source}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-gray-400 text-center">→</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={m.champ_cible ?? ''}
                      onChange={e => onChangerMapping(i, e.target.value || null)}
                      className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 bg-white w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Ignorer cette colonne —</option>
                      {champs.map(c => (
                        <option key={c.cle} value={c.cle}>
                          {c.label}{c.est_pivot ? ' ★' : ''}{c.requis && !c.est_pivot ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                    {champInfo?.hint && (
                      <p className="text-[10px] text-gray-400 mt-0.5 ml-0.5">{champInfo.hint}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-400 max-w-[160px] truncate">
                    {m.exemple || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {!m.champ_cible ? (
                      <span className="bg-gray-100 text-gray-500 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        Ignoré
                      </span>
                    ) : m.auto ? (
                      <span className="bg-emerald-100 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        ✓ Auto
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        ⚡ Manuel
                      </span>
                    )}
                    {champInfo?.est_pivot && (
                      <span className="ml-1 bg-blue-100 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        Pivot
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={onRetour}
          disabled={chargement}
          className="text-sm font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40 px-4 py-2 rounded-lg border border-gray-200 transition-colors"
        >
          ← Retour
        </button>
        <button
          onClick={onSuivant}
          disabled={!pivotMappe || chargement}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          {chargement ? (
            <><span className="animate-spin">⏳</span> Vérification en cours…</>
          ) : (
            'Prévisualiser l\'import →'
          )}
        </button>
      </div>
    </div>
  )
}
