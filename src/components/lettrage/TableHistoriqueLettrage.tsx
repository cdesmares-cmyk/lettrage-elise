import type { LigneHistorique } from '../../hooks/useHistoriqueLettrage'
import { HISTORIQUE_PAGE_SIZE } from '../../hooks/useHistoriqueLettrage'
import type { CompteClient } from '../../types/client'
import { NumeroPiece } from '../NumeroPiece'

interface Props {
  lignes: LigneHistorique[]
  lignesServeur: LigneHistorique[]
  chargement: boolean
  chargementServeur: boolean
  clients: CompteClient[]
  recherche: string
  onRecherche: (v: string) => void
  page: number
  onPage: (p: number) => void
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtDateHeure(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function normaliser(s: string | null | undefined) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}


export function TableHistoriqueLettrage({
  lignes, lignesServeur, chargement, chargementServeur,
  clients, recherche, onRecherche, page, onPage,
}: Props) {
  // Map code_client → nom depuis le cache AppDataContext
  const nomParCode = new Map(clients.map(c => [c.code_dso, c.nom]))

  // Fusion cache local + résultats serveur (dédoublonnés)
  const toutesLesLignes = recherche.length >= 2
    ? [...lignes, ...lignesServeur]
    : lignes

  // Filtre client-side
  const terme = normaliser(recherche)
  const filtrees = terme
    ? toutesLesLignes.filter(l => {
        const nom = normaliser(nomParCode.get(l.code_client))
        const montantStr = l.montant.toFixed(2).replace('.', ',')
        return (
          normaliser(l.code_client).includes(terme) ||
          nom.includes(terme) ||
          normaliser(l.numero_facture).includes(terme) ||
          normaliser(l.libelle_bancaire).includes(terme) ||
          montantStr.includes(terme) ||
          normaliser(l.commentaire).includes(terme)
        )
      })
    : toutesLesLignes

  const nbPages = Math.max(1, Math.ceil(filtrees.length / HISTORIQUE_PAGE_SIZE))
  const pageCourante = Math.min(page, nbPages)
  const lignesPage = filtrees.slice(
    (pageCourante - 1) * HISTORIQUE_PAGE_SIZE,
    pageCourante * HISTORIQUE_PAGE_SIZE,
  )

  return (
    <div className="flex flex-col h-full">

      {/* Barre de recherche */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="relative flex items-center gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path strokeLinecap="round" d="M13.5 13.5L17 17" />
              </svg>
            </div>
            <input
              type="text"
              value={recherche}
              onChange={e => onRecherche(e.target.value)}
              placeholder="Rechercher par client, facture, montant, libellé…"
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:border-ockham-teal focus:ring-2 focus:ring-ockham-teal/10 outline-none bg-white transition-all placeholder:text-gray-400"
            />
            {recherche && (
              <button
                onClick={() => onRecherche('')}
                className="absolute inset-y-0 right-2.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
                </svg>
              </button>
            )}
          </div>

          {/* Indicateurs */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {chargementServeur && (
              <span className="flex items-center gap-1.5 text-[11px] text-ockham-teal font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-ockham-teal animate-pulse" />
                Recherche étendue…
              </span>
            )}
            {recherche && !chargementServeur && (
              <span className="text-[11px] font-semibold bg-ockham-teal-muted text-ockham-teal-dark px-2.5 py-1 rounded-full border border-ockham-teal/20">
                {filtrees.length} résultat{filtrees.length !== 1 ? 's' : ''}
              </span>
            )}
            {!recherche && filtrees.length > 0 && (
              <span className="text-[11px] text-gray-400">
                {filtrees.length} action{filtrees.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-auto flex-1">
        {chargement ? (
          <div className="py-10 text-center text-sm text-gray-400">Chargement…</div>
        ) : lignesPage.length === 0 ? (
          <div className="py-10 text-center">
            {recherche ? (
              <div>
                <p className="text-sm font-medium text-gray-500">Aucun résultat pour « {recherche} »</p>
                <p className="text-xs text-gray-400 mt-1">Vérifiez l'orthographe ou élargissez la recherche</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Aucune action de lettrage enregistrée.</p>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Date · Heure</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ligne bancaire</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">N° Facture</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Montant</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Opérateur</th>
              </tr>
            </thead>
            <tbody>
              {lignesPage.map(l => {
                const isCorrection = !l.id_ligne_bancaire
                const isNegatif = l.montant < 0
                const nomClient = nomParCode.get(l.code_client)
                const isServeur = lignesServeur.some(s => s.id === l.id)
                return (
                  <tr key={l.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isServeur ? 'bg-ockham-teal-muted/30' : ''}`}>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap font-mono text-[11px]">
                      {fmtDateHeure(l.created_at)}
                    </td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      {isCorrection ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700">
                          ✏️ Correction
                        </span>
                      ) : (
                        <div>
                          <p className="truncate text-gray-700 font-medium">{l.libelle_bancaire ?? '—'}</p>
                          <p className="font-mono text-[10px] text-gray-400">{l.id_ligne_bancaire}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div>
                        <span className="font-mono text-[11px] font-bold text-ockham-teal bg-ockham-teal-muted px-1.5 py-0.5 rounded">
                          {l.code_client}
                        </span>
                        {nomClient && (
                          <p className="text-[10px] text-gray-400 mt-0.5 max-w-[130px] truncate">{nomClient}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {l.numero_facture ? (
                        <NumeroPiece
                          numero={l.numero_facture}
                          className="font-mono text-ockham-teal-dark font-semibold"
                        />
                      ) : (
                        <span className="text-amber-600 font-semibold text-[10px] bg-amber-50 px-1.5 py-0.5 rounded">
                          Autres{l.commentaire ? ` · ${l.commentaire}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
                      <span className={isNegatif ? 'text-red-600' : 'text-emerald-600'}>
                        {l.montant >= 0 ? '+' : ''}{fmt(l.montant)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-[11px] max-w-[160px] truncate">
                      {l.operateur ?? <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {nbPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <span className="text-[11px] text-gray-400">
            Page {pageCourante} / {nbPages} · {filtrees.length} ligne{filtrees.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPage(1)}
              disabled={pageCourante === 1}
              className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
              title="Première page"
            >«</button>
            <button
              onClick={() => onPage(pageCourante - 1)}
              disabled={pageCourante === 1}
              className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
            >‹</button>
            {Array.from({ length: nbPages }, (_, i) => i + 1)
              .filter(n => Math.abs(n - pageCourante) <= 2)
              .map(n => (
                <button
                  key={n}
                  onClick={() => onPage(n)}
                  className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${
                    n === pageCourante
                      ? 'bg-ockham-teal text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >{n}</button>
              ))
            }
            <button
              onClick={() => onPage(pageCourante + 1)}
              disabled={pageCourante === nbPages}
              className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
            >›</button>
            <button
              onClick={() => onPage(nbPages)}
              disabled={pageCourante === nbPages}
              className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
              title="Dernière page"
            >»</button>
          </div>
        </div>
      )}
    </div>
  )
}
