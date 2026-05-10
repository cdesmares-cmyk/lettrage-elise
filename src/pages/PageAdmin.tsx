import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAdmin } from '../hooks/useAdmin'
import { useAppData } from '../contexts/AppDataContext'
import { useRefValeurs } from '../hooks/useRefValeurs'
import type { ImportRecord } from '../hooks/useAdmin'

const ADMIN_EMAIL = 'cdesmares@elise.com.fr'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function BlocRefValeurs({ titre, categorie }: { titre: string; categorie: 'commercial' | 'operateur' | 'plateforme' }) {
  const { valeurs, chargement, ajouter, desactiver } = useRefValeurs(categorie)
  const [saisie, setSaisie] = useState('')

  async function handleAjouter() {
    const ok = await ajouter(saisie)
    if (ok) setSaisie('')
  }

  return (
    <div className="border border-gray-100 rounded-xl px-4 py-4">
      <p className="text-xs font-bold text-gray-700 mb-3">{titre}</p>
      <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
        {valeurs.length === 0 && <span className="text-xs text-gray-400">Aucune valeur</span>}
        {valeurs.map(v => (
          <span key={v} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200">
            {v}
            <button
              onClick={() => desactiver(v)}
              disabled={chargement}
              className="text-gray-400 hover:text-red-500 transition-colors ml-0.5 text-[10px] leading-none"
              title="Désactiver"
            >×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={saisie}
          onChange={e => setSaisie(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAjouter()}
          placeholder={`Nouvelle valeur…`}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-400 transition-colors"
        />
        <button
          onClick={handleAjouter}
          disabled={!saisie.trim() || chargement}
          className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
        >+ Ajouter</button>
      </div>
    </div>
  )
}

export function PageAdmin() {
  const { utilisateur } = useAuth()
  const { rafraichir } = useAppData()
  const admin = useAdmin()

  const [confirmImport, setConfirmImport] = useState<string | null>(null)
  const [debutLettrages, setDebutLettrages] = useState('')
  const [finLettrages, setFinLettrages] = useState('')
  const [confirmReset, setConfirmReset] = useState('')
  const [confirmResetEtape, setConfirmResetEtape] = useState(false)

  if (utilisateur?.email !== ADMIN_EMAIL) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <p className="text-gray-500 text-sm">Accès réservé à l'administrateur.</p>
        </div>
      </div>
    )
  }

  async function handleAnnulerImport(imp: ImportRecord) {
    const ok = await admin.annulerImport(imp)
    if (ok) { setConfirmImport(null); rafraichir() }
  }

  async function handleSupprimerLettrages() {
    if (!debutLettrages || !finLettrages) return
    await admin.supprimerLettrages(debutLettrages, finLettrages)
    rafraichir()
  }

  async function handleResetComplet() {
    if (confirmReset !== 'RESET') return
    const ok = await admin.resetComplet()
    if (ok) { setConfirmReset(''); setConfirmResetEtape(false); rafraichir() }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-xl">⚙️</div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Administration</h1>
          <p className="text-sm text-gray-400">Zone réservée — actions irréversibles</p>
        </div>
      </div>

      {/* ── Section 1 : Imports récents ─────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-800">Imports récents</h2>
            <p className="text-xs text-gray-400 mt-0.5">Annuler un import supprime les données associées et remet les factures à leur état précédent</p>
          </div>
          <button onClick={admin.chargerImports} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2.5 py-1 rounded transition-colors">↺ Actualiser</button>
        </div>

        {admin.imports.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">Aucun import enregistré.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fichier</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Lignes</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {admin.imports.map(imp => (
                <tr key={imp.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${imp.type === 'csv_bancaire' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-violet-50 border-violet-200 text-violet-700'}`}>
                      {imp.type === 'csv_bancaire' ? 'Bancaire' : 'Factures'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">{imp.nom_fichier ?? '—'}</td>
                  <td className="px-4 py-3 text-center font-mono text-gray-700">{imp.nb_lignes_inserees ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(imp.cree_le)}</td>
                  <td className="px-4 py-3 text-right">
                    {confirmImport === imp.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-[11px] text-red-600 font-medium">Confirmer la suppression ?</span>
                        <button onClick={() => handleAnnulerImport(imp)} disabled={admin.chargement} className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded disabled:opacity-50">Oui</button>
                        <button onClick={() => setConfirmImport(null)} className="text-[11px] text-gray-500 border border-gray-200 px-3 py-1 rounded">Non</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmImport(imp.id)} className="text-[11px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1 rounded transition-colors">
                        Annuler cet import
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Section 2 : Listes de référence ────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-800">Listes de référence</h2>
          <p className="text-xs text-gray-400 mt-0.5">Valeurs disponibles dans les menus déroulants des fiches client</p>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <BlocRefValeurs titre="Commerciaux" categorie="commercial" />
          <BlocRefValeurs titre="Opérateurs" categorie="operateur" />
          <BlocRefValeurs titre="Plateformes d'envoi" categorie="plateforme" />
        </div>
      </section>

      {/* ── Section 3 : Supprimer des lettrages ─────────────────────────────── */}
      <section className="bg-white border border-amber-200 rounded-xl shadow-sm mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-amber-100">
          <h2 className="text-sm font-bold text-gray-800">Supprimer des lettrages</h2>
          <p className="text-xs text-gray-400 mt-0.5">Réservé aux resets de test — en production, utilisez le module <strong>Correction</strong> (délettrage en négatif)</p>
        </div>
        <div className="mx-5 mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
          <span className="flex-shrink-0 mt-0.5">⚠️</span>
          <span>Supprimer des lettrages remet automatiquement les factures concernées en <strong>impayées</strong>. Les lignes bancaires redeviennent non lettrées. Cette action n'est pas réversible.</span>
        </div>
        <div className="px-5 py-4 flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Du</label>
            <input type="date" value={debutLettrages} onChange={e => setDebutLettrages(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Au</label>
            <input type="date" value={finLettrages} onChange={e => setFinLettrages(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white" />
          </div>
          <button
            onClick={handleSupprimerLettrages}
            disabled={!debutLettrages || !finLettrages || admin.chargement}
            className="flex items-center gap-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            🗑 Supprimer les lettrages
          </button>
        </div>
      </section>

      {/* ── Section 4 : Réinitialisation complète ───────────────────────────── */}
      <section className="bg-white border border-red-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-red-100">
          <h2 className="text-sm font-bold text-red-700">Réinitialisation complète</h2>
          <p className="text-xs text-gray-400 mt-0.5">Supprime : lettrages, factures, lignes bancaires, imports. Conserve : clients, dictionnaire SEPA.</p>
        </div>
        <div className="px-5 py-5">
          {!confirmResetEtape ? (
            <button
              onClick={() => setConfirmResetEtape(true)}
              className="text-sm font-semibold text-red-600 border border-red-300 hover:bg-red-50 px-5 py-2.5 rounded-lg transition-colors"
            >
              🔴 Lancer la réinitialisation
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-4">
              <p className="text-sm font-semibold text-red-700 mb-3">Cette action est irréversible. Tapez <strong>RESET</strong> pour confirmer :</p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={confirmReset}
                  onChange={e => setConfirmReset(e.target.value)}
                  placeholder="RESET"
                  className="border border-red-300 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-red-500 w-32 bg-white"
                />
                <button
                  onClick={handleResetComplet}
                  disabled={confirmReset !== 'RESET' || admin.chargement}
                  className="text-sm font-bold text-white bg-red-600 hover:bg-red-700 px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {admin.chargement ? '⏳ En cours…' : 'Confirmer le reset'}
                </button>
                <button onClick={() => { setConfirmResetEtape(false); setConfirmReset('') }} className="text-sm text-gray-500 hover:text-gray-700">Annuler</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
