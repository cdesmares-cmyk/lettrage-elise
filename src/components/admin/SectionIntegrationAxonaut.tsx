import { useState, useEffect, useRef } from 'react'
import { useAxonautIntegration } from '../../hooks/useAxonautIntegration'

export function SectionIntegrationAxonaut() {
  const { integration, enCours, sauvegarderCle, tester, synchroniser } = useAxonautIntegration()
  const [saisie, setSaisie] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [recap, setRecap] = useState<{ nbMaj: number; nbVues: number; nbSansPdf: number } | null>(null)
  const [tempsEcoule, setTempsEcoule] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (enCours) {
      setTempsEcoule(0)
      timerRef.current = setInterval(() => setTempsEcoule(t => t + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [enCours])

  function fmtTimer(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`
  }

  async function handleSauvegarder() {
    if (!saisie.trim()) return
    const ok = await sauvegarderCle(saisie.trim())
    if (ok) { setSaisie(''); setEditMode(false) }
  }

  async function handleSync() {
    setRecap(null)
    const result = await synchroniser()
    setRecap(result)
  }

  const clePresente = !!integration?.api_key

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-5 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Intégration Axonaut</h2>
          <p className="text-xs text-gray-400 mt-0.5">Connexion ERP — liens PDF des factures dans les relances</p>
        </div>
        {integration?.actif && integration.verifie_le && (
          <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            ✓ Active · {new Date(integration.verifie_le).toLocaleDateString('fr-FR')}
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
                className="text-xs text-gray-500 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded transition-colors"
              >Modifier</button>
              <button
                onClick={tester}
                disabled={enCours}
                className="text-xs font-semibold text-ockham-teal border border-ockham-teal/40 hover:bg-ockham-teal-muted px-3 py-1.5 rounded disabled:opacity-40 transition-colors"
              >{enCours ? '⏳' : 'Tester la connexion'}</button>
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
                className="text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark px-3 py-1.5 rounded disabled:opacity-40 transition-colors"
              >Enregistrer</button>
              {editMode && (
                <button
                  onClick={() => { setEditMode(false); setSaisie('') }}
                  className="text-xs text-gray-400 border border-gray-200 px-3 py-1.5 rounded transition-colors hover:border-gray-300"
                >Annuler</button>
              )}
            </div>
          )}
        </div>

        {/* Synchronisation */}
        {clePresente && (
          <div className="border-t border-gray-100 pt-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-700">Synchroniser les liens PDF</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Récupère les <code className="text-[10px] bg-gray-100 px-1 rounded">public_path</code> depuis Axonaut
                et les stocke sur chaque facture importée.
              </p>
              {recap !== null && (
                <div className="mt-2 inline-flex flex-wrap items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                  <span className="text-[11px] font-semibold text-emerald-700">
                    ✓ Sync terminée
                  </span>
                  <span className="text-[10px] text-emerald-600 border-l border-emerald-200 pl-3">
                    {recap.nbVues.toLocaleString('fr-FR')} factures Axonaut parcourues
                  </span>
                  <span className="text-[10px] text-emerald-600 border-l border-emerald-200 pl-3">
                    {recap.nbMaj.toLocaleString('fr-FR')} URL{recap.nbMaj !== 1 ? 's' : ''} mise{recap.nbMaj !== 1 ? 's' : ''} à jour
                  </span>
                  {recap.nbSansPdf > 0 && (
                    <span className="text-[10px] text-amber-600 border-l border-emerald-200 pl-3">
                      {recap.nbSansPdf.toLocaleString('fr-FR')} sans PDF Axonaut
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              <button
                onClick={handleSync}
                disabled={enCours}
                className="text-xs font-semibold text-ockham-teal border border-ockham-teal/40 hover:bg-ockham-teal-muted px-4 py-2 rounded disabled:opacity-40 transition-colors"
              >
                {enCours ? '⏳ Sync en cours…' : '↺ Synchroniser'}
              </button>
              {enCours && (
                <span className="text-[10px] text-gray-400 tabular-nums">
                  {fmtTimer(tempsEcoule)} — ~20 min pour un sync complet
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
