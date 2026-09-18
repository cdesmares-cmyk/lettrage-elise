import { useState } from 'react'
import { useOdooIntegration } from '../../hooks/useOdooIntegration'

export function SectionIntegrationOdoo() {
  const { integration, enCours, syncProgress, sauvegarderConfig, tester, synchroniser, arreterSync } = useOdooIntegration()

  const [url,      setUrl]      = useState('')
  const [db,       setDb]       = useState('')
  const [username, setUsername] = useState('')
  const [apiKey,   setApiKey]   = useState('')
  const [editMode, setEditMode] = useState(false)

  const configPresente = !!(integration?.api_key && integration?.config?.url)
  const syncEnCours    = enCours && syncProgress !== null

  function entrerEditMode() {
    setUrl(integration?.config?.url      ?? '')
    setDb(integration?.config?.db        ?? '')
    setUsername(integration?.config?.username ?? '')
    setApiKey('')
    setEditMode(true)
  }

  async function handleSauvegarder() {
    if (!url.trim() || !db.trim() || !username.trim() || !apiKey.trim()) return
    const ok = await sauvegarderConfig(url.trim(), db.trim(), username.trim(), apiKey.trim())
    if (ok) setEditMode(false)
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-5 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Intégration Odoo</h2>
          <p className="text-xs text-gray-400 mt-0.5">Import des factures depuis votre ERP Odoo</p>
        </div>
        {integration?.actif && integration.verifie_le && (
          <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            Actif · {new Date(integration.verifie_le).toLocaleDateString('fr-FR')}
          </span>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">

        {/* Formulaire de configuration */}
        {configPresente && !editMode ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <span className="text-gray-400 block mb-0.5">URL</span>
                <span className="font-mono text-gray-700 truncate block">{integration.config?.url}</span>
              </div>
              <div>
                <span className="text-gray-400 block mb-0.5">Base de données</span>
                <span className="font-mono text-gray-700">{integration.config?.db}</span>
              </div>
              <div>
                <span className="text-gray-400 block mb-0.5">Utilisateur</span>
                <span className="font-mono text-gray-700">{integration.config?.username}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="flex-1 font-mono text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-1.5">
                Clef API {'•'.repeat(20)}
              </span>
              <button
                onClick={entrerEditMode}
                className="text-xs text-gray-500 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded transition-colors cursor-pointer"
              >Modifier</button>
              <button
                onClick={tester}
                disabled={enCours}
                className="text-xs font-semibold text-ockham-teal border border-ockham-teal/40 hover:bg-ockham-teal-muted px-3 py-1.5 rounded disabled:opacity-40 transition-colors cursor-pointer"
              >{enCours && !syncEnCours ? '...' : 'Tester la connexion'}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
                URL Odoo
              </label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://mon-odoo.example.com"
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm font-mono outline-none focus:border-ockham-teal transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
                  Base de données
                </label>
                <input
                  type="text"
                  value={db}
                  onChange={e => setDb(e.target.value)}
                  placeholder="nom_base_odoo"
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm font-mono outline-none focus:border-ockham-teal transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
                  Utilisateur (email ou login)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm font-mono outline-none focus:border-ockham-teal transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
                Clef API Odoo
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSauvegarder()}
                placeholder="Clef API (Réglages → Technique → Clefs API)"
                autoFocus
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm font-mono outline-none focus:border-ockham-teal transition-colors"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSauvegarder}
                disabled={!url.trim() || !db.trim() || !username.trim() || !apiKey.trim() || enCours}
                className="text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark px-3 py-1.5 rounded disabled:opacity-40 transition-colors cursor-pointer"
              >Enregistrer</button>
              {editMode && (
                <button
                  onClick={() => setEditMode(false)}
                  className="text-xs text-gray-400 border border-gray-200 px-3 py-1.5 rounded transition-colors hover:border-gray-300 cursor-pointer"
                >Annuler</button>
              )}
            </div>
          </div>
        )}

        {/* Import historique */}
        {configPresente && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-700">Import des factures</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Récupère toutes les factures et avoirs validés depuis Odoo.
                  La synchronisation incrémentale s'exécute automatiquement toutes les 15 minutes.
                </p>
              </div>
              <div className="flex-shrink-0">
                {syncEnCours ? (
                  <button
                    onClick={arreterSync}
                    className="text-xs text-gray-500 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded transition-colors cursor-pointer"
                  >Arrêter</button>
                ) : (
                  <button
                    onClick={synchroniser}
                    disabled={enCours}
                    className="text-xs font-semibold text-ockham-teal border border-ockham-teal/40 hover:bg-ockham-teal-muted px-4 py-2 rounded disabled:opacity-40 transition-colors cursor-pointer"
                  >↺ Importer</button>
                )}
              </div>
            </div>

            {syncEnCours && syncProgress && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-3">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-blue-700">Import en cours…</p>
                  <p className="text-[10px] text-blue-500 mt-0.5">
                    {syncProgress.nbMaj.toLocaleString('fr-FR')} factures importées
                  </p>
                </div>
              </div>
            )}

            {!syncEnCours && integration?.verifie_le && (
              <div className="inline-flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                <span className="text-[11px] font-semibold text-emerald-700">
                  Dernière sync · {new Date(integration.verifie_le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className="text-[10px] text-emerald-500 border-l border-emerald-200 pl-3">
                  Sync incrémentale automatique activée
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
