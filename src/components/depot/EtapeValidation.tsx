// Étape 4 : prévisualisation et confirmation avant insertion en base
import { CHAMPS_BANCAIRES, CHAMPS_FACTURES, CHAMPS_LETTRAGES, CHAMPS_CLIENTS } from '../../lib/champsImport'
import type { LigneMapping, ResultatValidation, TypeFichier } from '../../types/import'

interface Props {
  typeFichier: TypeFichier
  resultat: ResultatValidation
  mapping: LigneMapping[]
  onConfirmer: () => void
  onRetour: () => void
  chargement: boolean
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
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

function StatCardMontant({ valeur, label }: { valeur: number; label: string }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
      <p className="text-2xl font-bold tabular-nums text-blue-700">{fmt(valeur)}</p>
      <p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

export function EtapeValidation({
  typeFichier, resultat, mapping, onConfirmer, onRetour, chargement,
}: Props) {
  const champs = typeFichier === 'csv_bancaire' ? CHAMPS_BANCAIRES
    : typeFichier === 'xlsx_factures' ? CHAMPS_FACTURES
    : typeFichier === 'import_clients' ? CHAMPS_CLIENTS
    : CHAMPS_LETTRAGES
  const estLettrage = typeFichier === 'import_lettrage'
  const estClients = typeFichier === 'import_clients'

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
      <div className={`grid gap-3 mb-6 ${estLettrage || (!resultat.total_credit_fichier && !resultat.total_ttc_fichier) ? 'grid-cols-4' : 'grid-cols-5'}`}>
        <StatCard valeur={resultat.nb_total} label="Lignes détectées" couleur="border-gray-200 text-blue-600" />
        {estClients
          ? <StatCard valeur={resultat.nb_nouvelles} label="À créer" couleur="border-emerald-200 text-emerald-600" />
          : <StatCard valeur={resultat.nb_nouvelles} label="À importer" couleur="border-emerald-200 text-emerald-600" />
        }
        {estLettrage
          ? <StatCard valeur={resultat.nb_avertissements ?? 0} label="Sur-paiements" couleur="border-amber-200 text-amber-600" />
          : estClients
          ? <StatCard valeur={resultat.nb_doublons} label="À mettre à jour" couleur="border-blue-200 text-blue-600" />
          : <StatCard valeur={resultat.nb_doublons} label="Doublons (ignorés)" couleur="border-amber-200 text-amber-600" />
        }
        {estLettrage
          ? <StatCard valeur={resultat.nb_invalides ?? 0} label="Factures introuvables" couleur="border-red-200 text-red-500" />
          : estClients
          ? <StatCard valeur={0} label="Ignorés" couleur="border-gray-200 text-gray-400" />
          : <StatCard valeur={0} label="Erreurs" couleur="border-gray-200 text-gray-400" />
        }
        {resultat.total_credit_fichier != null && (
          <StatCardMontant valeur={resultat.total_credit_fichier} label="Total crédits (fichier)" />
        )}
        {resultat.total_ttc_fichier != null && (
          <StatCardMontant valeur={resultat.total_ttc_fichier} label="Total TTC (fichier)" />
        )}
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
          <div>
            <strong>{resultat.nb_invalides} ligne{(resultat.nb_invalides ?? 0) > 1 ? 's' : ''} ignorée{(resultat.nb_invalides ?? 0) > 1 ? 's' : ''}</strong> — numéro de facture introuvable en base.
            {' '}Ces lignes ne seront pas importées.
            {resultat.apercu.filter(l => l.statut === 'invalide').length > 0 && (
              <div className="mt-2">
                <span className="text-[11px] font-semibold text-red-700">Numéros cherchés (aperçu) : </span>
                <span className="font-mono text-[11px] text-red-700">
                  {resultat.apercu.filter(l => l.statut === 'invalide').slice(0, 5).map(l => `"${l.cle_pivot}"`).join(' · ')}
                </span>
                <div className="mt-1 text-[10px] text-red-500">Vérifiez que ces numéros correspondent exactement aux <code>numero_piece</code> dans la table factures Supabase.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bannière noms différents (import factures — informatif, non bloquant) */}
      {typeFichier === 'xlsx_factures' && (resultat.noms_differents?.length ?? 0) > 0 && (
        <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-3 text-sm text-blue-800">
          <span className="flex-shrink-0">ℹ️</span>
          <div>
            <strong>{resultat.noms_differents!.length} client{resultat.noms_differents!.length > 1 ? 's' : ''} avec un nom différent</strong> entre le fichier et la base.
            {' '}Le nom en base est conservé — modifiable depuis Compte Client.
            <div className="mt-2 flex flex-wrap gap-1.5">
              {resultat.noms_differents!.slice(0, 8).map(d => (
                <span key={d.code_client} className="font-mono text-[10px] bg-blue-100 px-1.5 py-0.5 rounded" title={`Fichier : ${d.nom_fichier}`}>
                  {d.code_client}
                </span>
              ))}
              {resultat.noms_differents!.length > 8 && (
                <span className="text-[10px] text-blue-600">+{resultat.noms_differents!.length - 8} autres</span>
              )}
            </div>
          </div>
        </div>
      )}

      {!estClients && resultat.nb_nouvelles === 0 && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-700">
          <span>⚠️</span>
          <span>Toutes les lignes sont déjà présentes en base. Aucune donnée ne sera importée.</span>
        </div>
      )}
      {estClients && resultat.nb_total === 0 && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-700">
          <span>⚠️</span>
          <span>Aucune ligne valide détectée dans le fichier.</span>
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
            {estClients
              ? `${resultat.nb_total.toLocaleString('fr-FR')} client${resultat.nb_total > 1 ? 's' : ''} seront traités`
              : `${resultat.nb_nouvelles.toLocaleString('fr-FR')} ligne${resultat.nb_nouvelles > 1 ? 's' : ''} seront importées`
            }
          </span>
          <button
            onClick={onConfirmer}
            disabled={chargement || (estClients ? resultat.nb_total === 0 : resultat.nb_nouvelles === 0)}
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
