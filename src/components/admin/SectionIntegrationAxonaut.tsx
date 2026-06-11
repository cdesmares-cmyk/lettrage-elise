import { useState } from 'react'
import { useAxonautIntegration } from '../../hooks/useAxonautIntegration'

export function SectionIntegrationAxonaut() {
  const { integration, enCours, sauvegarderCle, tester, synchroniser, arreterSync } = useAxonautIntegration()
  const [saisie, setSaisie]     = useState('')
  const [editMode, setEditMode] = useState(false)

  async function handleSauvegarder() {
    if (!saisie.trim()) return
    const ok = await sauvegarderCle(saisie.trim())
    if (ok) { setSaisie(''); setEditMode(false) }
  }

  const clePresente  = !!integration?.api_key
  const syncActif    = !!integration?.sync_actif
  const stats        = integration?.sync_stats
  const rapport      = integration?.sync_dernier_rapport
  const pageCourante = integration?.sync_page_courante ?? 1

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-5 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Intégration Axonaut</h2>
          <p className="text-xs text-gray-400 mt-0.5">Connexion ERP — liens PDF des factures dans les relances</p>
        </div>
        {integration?.actif && integration.verifie_le && (
          <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            Actif · {new Date(integration.verifie_le).toLocaleDateString('fr-FR')}
          </span>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">

        {/* Clef API */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">
            Clef API
          </label>

          {clePresente && !editMode ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 font-mono text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-1.5">
                {'•'.repeat(28)}
              </span>
              <button
                onClick={() => setEditMode(true)}
                className="text-xs text-gray-500 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded transition-colors cursor-pointer"
              >Modifier</button>
              <button
                onClick={tester}
                disabled={enCours}
                className="text-xs font-semibold text-ockham-teal border border-ockham-teal/40 hover:bg-ockham-teal-muted px-3 py-1.5 rounded disabled:opacity-40 transition-colors cursor-pointer"
              >{enCours ? '...' : 'Tester la connexion'}</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="password"
                value={saisie}
                onChange={e => setSaisie(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSauvegarder()}
                placeholder="Coller la clef API Axonaut ici"
                autoFocus
                className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm font-mono outline-none focus:border-ockham-teal transition-colors"
              />
              <button
                onClick={handleSauvegarder}
                disabled={!saisie.trim() || enCours}
                className="text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark px-3 py-1.5 rounded disabled:opacity-40 transition-colors cursor-pointer"
              >Enregistrer</button>
              {editMode && (
                <button
                  onClick={() => { setEditMode(false); setSaisie('') }}
                  className="text-xs text-gray-400 border border-gray-200 px-3 py-1.5 rounded transition-colors hover:border-gray-300 cursor-pointer"
                >Annuler</button>
              )}
            </div>
          )}
        </div>

        {/* Synchronisation */}
        {clePresente && (
          <div className="border-t border-gray-100 pt-4 space-y-3">

            {/* En-tête + bouton */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-700">Synchronisation des liens PDF</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Récupère les <code className="text-[10px] bg-gray-100 px-1 rounded">public_path</code> depuis Axonaut
                  et les stocke sur chaque facture. La sync tourne en arrière-plan — vous pouvez continuer à travailler.
                </p>
              </div>
              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                {syncActif ? (
                  <button
                    onClick={arreterSync}
                    className="text-xs text-gray-500 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded transition-colors cursor-pointer"
                  >Arrêter</button>
                ) : (
                  <button
                    onClick={synchroniser}
                    disabled={enCours}
                    className="text-xs font-semibold text-ockham-teal border border-ockham-teal/40 hover:bg-ockham-teal-muted px-4 py-2 rounded disabled:opacity-40 transition-colors cursor-pointer"
                  >{enCours ? '...' : '↺ Synchroniser'}</button>
                )}
              </div>
            </div>

            {/* Progression en cours */}
            {syncActif && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-3">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-blue-700">Synchronisation en cours…</p>
                  <p className="text-[10px] text-blue-500 mt-0.5">
                    Page {pageCourante} en cours
                    {stats && stats.nbVues > 0 && (
                      <> · {stats.nbVues.toLocaleString('fr-FR')} factures vues · {stats.nbMaj.toLocaleString('fr-FR')} URLs mises à jour</>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Dernier rapport */}
            {!syncActif && rapport && (
              <div className="inline-flex flex-wrap items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                <span className="text-[11px] font-semibold text-emerald-700">
                  Dernière sync · {new Date(rapport.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className="text-[10px] text-emerald-600 border-l border-emerald-200 pl-3">
                  {rapport.nbVues.toLocaleString('fr-FR')} factures parcourues
                </span>
                <span className="text-[10px] text-emerald-600 border-l border-emerald-200 pl-3">
                  {rapport.nbMaj.toLocaleString('fr-FR')} URL{rapport.nbMaj !== 1 ? 's' : ''} mise{rapport.nbMaj !== 1 ? 's' : ''} à jour
                </span>
                {rapport.nbSansPdf > 0 && (
                  <span className="text-[10px] text-amber-600 border-l border-emerald-200 pl-3">
                    {rapport.nbSansPdf.toLocaleString('fr-FR')} sans PDF Axonaut
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
