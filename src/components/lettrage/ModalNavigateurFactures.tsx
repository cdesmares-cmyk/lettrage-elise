// Modal de navigation des factures — recherche + suggestions intelligentes
import { useRef, useEffect } from 'react'
import { IcSearch } from '../Icones'
import type { LigneBancaireAvecStatut } from '../../types/lettrage'
import {
  useNavigateurFactures,
  type FactureNavigateur,
  type SourceSuggestion,
} from '../../hooks/useNavigateurFactures'

interface Props {
  ouvert: boolean
  ligneActive: LigneBancaireAvecStatut | null
  onFermer: () => void
  onInjecter: (factures: LigneAInjecter[]) => void
}

export interface LigneAInjecter {
  numero_facture: string
  montant: number
  code_client: string
  nom_client: string | null
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR')
}

const SOURCE_META: Record<SourceSuggestion, { label: string; cls: string }> = {
  numero_detecte: { label: 'N° détecté', cls: 'bg-purple-100 text-purple-700' },
  client_reconnu: { label: 'Client reconnu', cls: 'bg-blue-100 text-blue-700' },
  historique:     { label: 'Historique', cls: 'bg-emerald-100 text-emerald-700' },
}

function ConfidenceDots({ n }: { n: 1 | 2 | 3 }) {
  return (
    <span className="flex items-center gap-0.5">
      {([1, 2, 3] as const).map(i => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= n ? 'bg-ockham-teal' : 'bg-gray-200'}`} />
      ))}
    </span>
  )
}

function LigneFacture({
  facture, selectionne, onToggle, source, confiance,
}: {
  facture: FactureNavigateur
  selectionne: boolean
  onToggle: () => void
  source?: SourceSuggestion
  confiance?: 1 | 2 | 3
}) {
  return (
    <tr
      onClick={onToggle}
      className={`cursor-pointer transition-colors ${selectionne ? 'bg-ockham-teal-muted' : 'hover:bg-gray-50'}`}
    >
      <td className="px-4 py-2.5 text-xs font-mono text-gray-600">{facture.code_client}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-semibold text-gray-800">{facture.numero_piece}</span>
          {source && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${SOURCE_META[source].cls}`}>
              {SOURCE_META[source].label}
            </span>
          )}
        </div>
        {facture.nom_client && (
          <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[200px]">{facture.nom_client}</div>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs font-mono text-right text-gray-600 tabular-nums">{fmt(facture.montant_ttc)}</td>
      <td className="px-4 py-2.5 text-xs font-mono text-right font-semibold text-amber-700 tabular-nums">{fmt(facture.reste_du)}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400 text-right">{fmtDate(facture.date_echeance)}</td>
      {confiance !== undefined && (
        <td className="px-4 py-2.5"><ConfidenceDots n={confiance} /></td>
      )}
      <td className="px-4 py-2.5 text-right pr-4">
        <button
          onClick={e => { e.stopPropagation(); onToggle() }}
          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
            selectionne
              ? 'bg-ockham-teal text-white'
              : 'bg-gray-100 text-gray-400 hover:bg-ockham-teal/10 hover:text-ockham-teal'
          }`}
        >
          {selectionne ? '✓' : '+'}
        </button>
      </td>
    </tr>
  )
}

function EnteteTable({ avecConfiance }: { avecConfiance: boolean }) {
  const ths = ['Code client', 'N° Facture', 'Montant TTC', 'Restant dû', 'Échéance']
  return (
    <thead>
      <tr className="border-b border-gray-100">
        {ths.map(h => (
          <th key={h} className={`px-4 pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide ${h === 'Montant TTC' || h === 'Restant dû' || h === 'Échéance' ? 'text-right' : 'text-left'}`}>
            {h}
          </th>
        ))}
        {avecConfiance && (
          <th className="px-4 pb-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Confiance</th>
        )}
        <th className="px-4 pb-2 w-10" />
      </tr>
    </thead>
  )
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-2.5 px-4 py-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.18 }} />
      ))}
    </div>
  )
}

export function ModalNavigateurFactures({ ouvert, ligneActive, onFermer, onInjecter }: Props) {
  const nav = useNavigateurFactures(ligneActive, ouvert)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ouvert) setTimeout(() => inputRef.current?.focus(), 80)
  }, [ouvert])

  useEffect(() => {
    if (!ouvert) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ouvert, onFermer])

  if (!ouvert || !ligneActive) return null

  function handleInjecter() {
    onInjecter(nav.selectionArray.map(f => ({
      numero_facture: f.numero_piece,
      montant: Math.round(f.reste_du * 100) / 100,
      code_client: f.code_client,
      nom_client: f.nom_client,
    })))
    onFermer()
  }

  const montreResultats = nav.query.length >= 2
  const montreSuggestions = !montreResultats && (nav.suggestions.length > 0 || nav.chargementSugg)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden">

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <IcSearch size={15} className="text-ockham-teal flex-shrink-0" />
            <h3 className="text-base font-bold text-gray-900">Navigateur de factures</h3>
          </div>
          <button
            onClick={onFermer}
            className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors"
          >✕</button>
        </div>

        {/* Bandeau contextuel — ligne bancaire active */}
        <div className="px-6 py-3 bg-ockham-navy flex items-center gap-6 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-ockham-teal uppercase tracking-widest mb-0.5">Ligne en cours de lettrage</p>
            <p className="text-sm font-semibold text-white truncate">{ligneActive.libelle}</p>
            {ligneActive.detail && (
              <p className="text-[11px] text-white/50 truncate mt-0.5">{ligneActive.detail}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-white/50 mb-0.5">Restant à lettrer</p>
            <p className="text-lg font-extrabold tabular-nums text-ockham-teal">{fmt(ligneActive.restant ?? 0)}</p>
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <IcSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={nav.query}
              onChange={e => nav.setQuery(e.target.value)}
              placeholder="Code client, nom, N° facture… (2 caractères min)"
              className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-ockham-teal transition-colors"
            />
            {nav.chargement && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ockham-teal animate-pulse">⟳</span>
            )}
          </div>
        </div>

        {/* Zone défilable */}
        <div className="flex-1 overflow-auto">

          {/* Section suggestions intelligentes */}
          {montreSuggestions && (
            <div className="px-6 pt-5 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-ockham-teal uppercase tracking-widest">Suggestions intelligentes</span>
                {nav.chargementSugg && (
                  <span className="text-[10px] text-gray-400 animate-pulse">Analyse en cours…</span>
                )}
              </div>
              {nav.chargementSugg && nav.suggestions.length === 0 ? (
                <SkeletonRows n={3} />
              ) : (
                <table className="w-full">
                  <EnteteTable avecConfiance />
                  <tbody className="divide-y divide-gray-50">
                    {nav.suggestions.map(s => (
                      <LigneFacture
                        key={s.facture.numero_piece}
                        facture={s.facture}
                        selectionne={nav.selection.has(s.facture.numero_piece)}
                        onToggle={() => nav.toggleSelection(s.facture)}
                        source={s.source}
                        confiance={s.confiance}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Séparateur si les deux sections sont visibles */}
          {montreSuggestions && montreResultats && (
            <div className="mx-6 my-3 border-t border-dashed border-gray-200" />
          )}

          {/* Section résultats de recherche */}
          {montreResultats && (
            <div className="px-6 pt-5 pb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                {nav.chargement
                  ? 'Recherche…'
                  : `${nav.resultats.length} résultat${nav.resultats.length > 1 ? 's' : ''}`}
              </p>
              {nav.chargement ? (
                <SkeletonRows n={6} />
              ) : nav.resultats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-2 opacity-20 text-gray-400"><IcSearch size={30} /></div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Aucune facture trouvée</p>
                  <p className="text-xs text-gray-400">Aucune facture ouverte ne correspond à « {nav.query} »</p>
                </div>
              ) : (
                <table className="w-full">
                  <EnteteTable avecConfiance={false} />
                  <tbody className="divide-y divide-gray-50">
                    {nav.resultats.map(f => (
                      <LigneFacture
                        key={f.numero_piece}
                        facture={f}
                        selectionne={nav.selection.has(f.numero_piece)}
                        onToggle={() => nav.toggleSelection(f)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* État vide — aucune recherche, aucune suggestion */}
          {!montreResultats && !montreSuggestions && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-8">
              <div className="mb-3 opacity-20 text-gray-400"><IcSearch size={36} /></div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Recherchez une facture</p>
              <p className="text-xs text-gray-400 max-w-xs">
                Saisissez un code client, un nom ou un numéro de facture.<br />
                Les suggestions apparaîtront automatiquement si un historique est disponible.
              </p>
            </div>
          )}
        </div>

        {/* Pied de page — sélection + injection */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-4 flex-shrink-0 bg-white">
          {nav.selectionArray.length > 0 ? (
            <p className="text-sm text-gray-600">
              <span className="font-bold text-gray-900">{nav.selectionArray.length}</span>
              {' '}facture{nav.selectionArray.length > 1 ? 's' : ''} sélectionnée{nav.selectionArray.length > 1 ? 's' : ''}
              {' · '}Total :{' '}
              <span className="font-bold text-ockham-teal">{fmt(nav.totalSelection)}</span>
            </p>
          ) : (
            <p className="text-sm text-gray-400">Sélectionnez au moins une facture</p>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onFermer}
              className="text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700 px-4 py-2 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleInjecter}
              disabled={nav.selectionArray.length === 0}
              className="flex items-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              ↗ Injecter dans le formulaire
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
