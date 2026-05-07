// Étape 4 : prévisualisation et confirmation avant insertion en base
import { CHAMPS_BANCAIRES, CHAMPS_FACTURES, CHAMPS_LETTRAGES } from '../../lib/champsImport'
import type { LigneMapping, ResultatValidation, TypeFichier } from '../../types/import'

interface Props {
  typeFichier: TypeFichier
  resultat: ResultatValidation
  mapping: LigneMapping[]
  onConfirmer: () => void
  onRetour: () => void
  chargement: boolean
}

function StatCard({
  valeur, label, couleur,
}: { valeur: number; label: string; couleur: string }) {
  return (
    <div className={`bg-gray-50 border rounded-xl px-5 py-4 ${couleur}`}>
      <p className="text-2xl font-bold tabular-nums">{valeur.toLocaleString('fr-FR')}</p>
      <p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

export function EtapeValidation({
  typeFichier, resultat, mapping, onConfirmer, onRetour, chargement,
}: Props) {
  const champs = typeFichier === 'csv_bancaire' ? CHAMPS_BANCAIRES
    : typeFichier === 'xlsx_factures' ? CHAMPS_FACTURES
    : CHAMPS_LETTRAGES
  const estLettrage = typeFichier === 'import_lettrage'

  // Colonnes mappées à afficher dans l'aperçu (max 6 pour éviter le débordement)
  const colonnesMappees = mapping
    .filter(m => m.champ_cible !== null)
    .slice(0, 6)

  function labelColonne(champCle: string): string {
    return champs.find(c => c.cle === champCle)?.label ?? champCle
  }

  return (
    <div>
      {/* Statistiques */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard valeur={resultat.nb_total} label="Lignes détectées" couleur="border-gray-200 text-blue-600" />
        <StatCard valeur={resultat.nb_nouvelles} label="À importer" couleur="border-emerald-200 text-emerald-600" />
        {estLettrage
          ? <StatCard valeur={resultat.nb_avertissements ?? 0} label="Sur-paiements" couleur="border-amber-200 text-amber-600" />
          : <StatCard valeur={resultat.nb_doublons} label="Doublons (ignorés)" couleur="border-amber-200 text-amber-600" />
        }
        {estLettrage
          ? <StatCard valeur={resultat.nb_invalides ?? 0} label="Factures introuvables" couleur="border-red-200 text-red-500" />
          : <StatCard valeur={0} label="Erreurs" couleur="border-gray-200 text-gray-400" />
        }
      </div>

      {/* Bannière sur-paiement (import_lettrage uniquement) */}
      {estLettrage && (resultat.nb_avertissements ?? 0) > 0 && (
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-3 text-sm text-amber-800">
          <span className="flex-shrink-0">⚠️</span>
          <span>
            <strong>{resultat.nb_avertissements} facture{(resultat.nb_avertissements ?? 0) > 1 ? 's' : ''} déjà soldée{(resultat.nb_avertissements ?? 0) > 1 ? 's' : ''}</strong> figurent dans ce fichier.
            {' '}Si vous confirmez, ces factures passeront en statut <strong>trop perçu (sur-lettré)</strong>.
          </span>
        </div>
      )}

      {/* Bannière factures introuvables (import_lettrage uniquement) */}
      {estLettrage && (resultat.nb_invalides ?? 0) > 0 && (
        <div className="flex gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-3 text-sm text-red-800">
          <span className="flex-shrink-0">🚫</span>
          <span>
            <strong>{resultat.nb_invalides} ligne{(resultat.nb_invalides ?? 0) > 1 ? 's' : ''} ignorée{(resultat.nb_invalides ?? 0) > 1 ? 's' : ''}</strong> — numéro de facture introuvable en base.
            {' '}Ces lignes ne seront pas importées.
          </span>
        </div>
      )}

      {resultat.nb_nouvelles === 0 && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-700">
          <span>⚠️</span>
          <span>Toutes les lignes sont déjà présentes en base. Aucune donnée ne sera importée.</span>
        </div>
      )}

      {/* Aperçu */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Aperçu — {resultat.apercu.length} premières lignes
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 mb-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Statut
              </th>
              {colonnesMappees.map(m => (
                <th key={m.colonne_source} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  {labelColonne(m.champ_cible!)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {resultat.apercu.map((ligne, i) => (
              <tr key={i} className={
                ligne.statut === 'doublon' || ligne.statut === 'sur_paiement' ? 'bg-amber-50' :
                ligne.statut === 'invalide' ? 'bg-red-50' :
                'hover:bg-gray-50'
              }>
                <td className="px-4 py-2">
                  {ligne.statut === 'doublon' ? (
                    <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">Doublon</span>
                  ) : ligne.statut === 'sur_paiement' ? (
                    <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">Sur-paiement</span>
                  ) : ligne.statut === 'invalide' ? (
                    <span className="bg-red-100 text-red-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">Introuvable</span>
                  ) : (
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">Nouveau</span>
                  )}
                </td>
                {colonnesMappees.map(m => (
                  <td key={m.colonne_source} className="px-4 py-2 text-gray-700 font-mono max-w-[180px] truncate">
                    {ligne.donnees[m.colonne_source] || '—'}
                  </td>
                ))}
              </tr>
            ))}
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
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {resultat.nb_nouvelles.toLocaleString('fr-FR')} ligne{resultat.nb_nouvelles > 1 ? 's' : ''} seront importées
          </span>
          <button
            onClick={onConfirmer}
            disabled={chargement || resultat.nb_nouvelles === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            {chargement ? (
              <><span className="animate-spin">⏳</span> Import en cours…</>
            ) : (
              '⬆️ Lancer l\'import'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
