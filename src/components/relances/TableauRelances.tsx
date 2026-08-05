import { useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { IcSearch, IcSliders } from '../Icones'
import type { Relance, StatutRelance } from '../../hooks/useRelances'
import { useRole } from '../../contexts/RoleContext'
import { useAppData } from '../../contexts/AppDataContext'
import type { StatsOperateur } from '../../hooks/useLeaderboard'
import type { CommentaireFacture } from '../../types/client'
import { ModalDetailRelance } from './ModalDetailRelance'

type ColSort = 'code_client' | 'nom_client' | 'envoyee_le' | 'jours' | 'montant' | 'operateur'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function fmtEuros(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function joursDepuis(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

const SEUIL_ALERTE = 10

function estEnAlerte(r: Relance): boolean {
  return r.statut === 'sans_reponse' ||
    (r.statut === 'envoyee' && r.envoyee_le != null && joursDepuis(r.envoyee_le) > SEUIL_ALERTE)
}

interface SauvegarderComData {
  numero_piece: string; contact: string; date_contact: string
  commentaire: string; operateur: string; ne_pas_relancer?: boolean
}

interface Props {
  relances: Relance[]
  chargement: boolean
  onMajStatut: (id: string, statut: StatutRelance, dateRappel?: string) => Promise<boolean>
  onArchiver: (id: string) => Promise<boolean>
  onSauvegarderNote: (id: string, note: string) => Promise<boolean>
  onSauvegarderCommentaire: (data: SauvegarderComData) => Promise<boolean>
  classement: StatsOperateur[]
  commentaires: Map<string, CommentaireFacture>
  filtreOp: string
  onFiltreOpChange: (op: string) => void
}

export function TableauRelances({ relances, chargement, onMajStatut, onArchiver, onSauvegarderNote, onSauvegarderCommentaire, classement, commentaires, filtreOp, onFiltreOpChange }: Props) {
  const navigate = useNavigate()
  const { peutModifier } = useRole()
  const { clients, facturesActives } = useAppData()
  const [recherche, setRecherche] = useState('')
  const [relanceOuverteId, setRelanceOuverteId] = useState<string | null>(null)
  const relanceOuverte = relances.find(r => r.id === relanceOuverteId) ?? null
  const [filtreOpOuvert, setFiltreOpOuvert] = useState(false)
  const [tri, setTri] = useState<ColSort>('envoyee_le')
  const [triAsc, setTriAsc] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollRatio, setScrollRatio] = useState(0)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    setScrollRatio(max > 0 ? el.scrollTop / max : 0)
  }, [])

  const clientsMap = useMemo(() => new Map(clients.map(c => [c.code_dso, c.nom])), [clients])
  const facturesMap = useMemo(() => new Map(facturesActives.map(f => [f.numero_piece, f])), [facturesActives])
  const opMap = useMemo(() => new Map(classement.map(s => [s.operateur.id, s.operateur.initiales || s.operateur.email.slice(0, 3).toUpperCase()])), [classement])

  const operateursDispo = useMemo(() => {
    const ids = [...new Set(relances.filter(r => r.statut !== 'brouillon' && !r.archivee).map(r => r.operateur_id))]
    return ids.filter(id => opMap.has(id)).map(id => ({ id, nom: opMap.get(id)! }))
  }, [relances, opMap])

  function getMontant(r: Relance): number {
    return (r.factures_ids ?? []).reduce((sum, id) => sum + (facturesMap.get(id)?.montant_ttc ?? 0), 0)
  }

  const actives = relances.filter(r => r.statut !== 'brouillon' && !r.archivee)
  const totalActives = filtreOp === 'tous' ? actives.length : actives.filter(r => r.operateur_id === filtreOp).length

  const filtrees = actives.filter(r => {
    if (filtreOp !== 'tous' && r.operateur_id !== filtreOp) return false
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      const nom = (clientsMap.get(r.code_client) ?? '').toLowerCase()
      if (!nom.includes(q) && !r.code_client.toLowerCase().includes(q)) return false
    }
    return true
  })

  const affichees = useMemo(() => {
    return [...filtrees].sort((a, b) => {
      const aAlert = estEnAlerte(a) ? 0 : 1
      const bAlert = estEnAlerte(b) ? 0 : 1
      if (aAlert !== bAlert) return aAlert - bAlert

      let cmp = 0
      switch (tri) {
        case 'code_client':  cmp = a.code_client.localeCompare(b.code_client); break
        case 'nom_client':   cmp = (clientsMap.get(a.code_client) ?? '').localeCompare(clientsMap.get(b.code_client) ?? ''); break
        case 'envoyee_le':   cmp = (a.envoyee_le ?? '').localeCompare(b.envoyee_le ?? ''); break
        case 'jours': {
          const ja = a.envoyee_le ? joursDepuis(a.envoyee_le) : -1
          const jb = b.envoyee_le ? joursDepuis(b.envoyee_le) : -1
          cmp = ja - jb; break
        }
        case 'montant':   cmp = getMontant(a) - getMontant(b); break
        case 'operateur': cmp = (opMap.get(a.operateur_id) ?? '').localeCompare(opMap.get(b.operateur_id) ?? ''); break
      }
      return triAsc ? cmp : -cmp
    })
  }, [filtrees, tri, triAsc, clientsMap])

  function toggleTri(col: ColSort) {
    if (tri === col) setTriAsc(v => !v)
    else { setTri(col); setTriAsc(false) }
  }

  function fleche(col: ColSort) {
    if (tri !== col) return <span className="text-gray-300 ml-0.5 text-[9px]">↕</span>
    return <span className="text-ockham-teal ml-0.5 text-[9px]">{triAsc ? '↑' : '↓'}</span>
  }

  if (chargement) return <div className="py-12 text-center text-sm text-gray-400">Chargement…</div>

  return (
    <div className="space-y-3">
      {/* Barre : recherche + filtre opérateur */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 min-w-[200px] flex-1 max-w-xs">
          <IcSearch size={13} className="text-gray-300 flex-shrink-0" />
          <input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Client, code…"
            className="flex-1 text-xs outline-none bg-transparent text-gray-700 placeholder-gray-300"
          />
          {recherche && (
            <button onClick={() => setRecherche('')} className="text-gray-300 hover:text-gray-500 text-xs leading-none">✕</button>
          )}
        </div>

        {operateursDispo.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setFiltreOpOuvert(v => !v)}
              title="Filtrer par opérateur"
              className={`flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 transition-colors ${
                filtreOp !== 'tous'
                  ? 'border-ockham-teal text-ockham-teal bg-ockham-teal-muted'
                  : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500 bg-white'
              }`}
            >
              <IcSliders size={12} />
              <span className="font-semibold">
                {filtreOp !== 'tous' ? opMap.get(filtreOp) : 'Opérateur'}
              </span>
            </button>
            {filtreOpOuvert && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFiltreOpOuvert(false)} />
                <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-40 min-w-[160px] py-1 overflow-hidden">
                  <button
                    onClick={() => { onFiltreOpChange('tous'); setFiltreOpOuvert(false) }}
                    className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-50 transition-colors ${filtreOp === 'tous' ? 'font-semibold text-ockham-teal' : 'text-gray-600'}`}
                  >
                    Tous les opérateurs
                  </button>
                  {operateursDispo.map(o => (
                    <button
                      key={o.id}
                      onClick={() => { onFiltreOpChange(o.id); setFiltreOpOuvert(false) }}
                      className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-50 transition-colors ${filtreOp === o.id ? 'font-semibold text-ockham-teal' : 'text-gray-600'}`}
                    >
                      {o.nom}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-gray-400">
            <span className="font-bold text-ockham-navy/70">{totalActives}</span> active{totalActives !== 1 ? 's' : ''}
          </span>
          {filtrees.length !== totalActives && filtrees.length > 0 && (
            <span className="text-[10px] text-gray-300">· {filtrees.length} affichée{filtrees.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {filtrees.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400 bg-white border border-gray-100 rounded-xl">
          {actives.length === 0 ? 'Aucune relance envoyée pour le moment' : 'Aucune relance pour ce filtre'}
        </div>
      ) : (
        <div className="flex items-stretch gap-2">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 bg-white border border-gray-100 rounded-xl overflow-y-auto"
            style={{ height: 520, scrollbarWidth: 'none', msOverflowStyle: 'none', overscrollBehavior: 'contain' } as React.CSSProperties}
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_#f3f4f6]">
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {([
                    ['code_client', 'Code'],
                    ['nom_client',  'Client'],
                    ['envoyee_le',  'Envoyée le'],
                    ['jours',       'J+'],
                    ['montant',     'Montant TTC'],
                    ['operateur',   'Op.'],
                  ] as [ColSort, string][]).map(([col, label]) => (
                    <th
                      key={col}
                      onClick={() => toggleTri(col)}
                      className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider px-3 py-3 cursor-pointer hover:text-ockham-teal select-none whitespace-nowrap"
                    >
                      {label}{fleche(col)}
                    </th>
                  ))}
                  {peutModifier && <th className="px-3 py-3 w-16" />}
                </tr>
              </thead>
              <tbody>
                {affichees.map(r => {
                  const jours = r.envoyee_le ? joursDepuis(r.envoyee_le) : null

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setRelanceOuverteId(r.id)}
                      className="transition-colors cursor-pointer border-t border-gray-50 first:border-t-0 hover:bg-gray-50/40"
                    >
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/compte-client?client=${r.code_client}`)}
                          title="Ouvrir le compte client"
                          className="group/code flex items-center gap-1 font-mono text-xs text-ockham-teal whitespace-nowrap cursor-pointer"
                        >
                          {r.code_client}
                          <svg className="w-3 h-3 opacity-0 group-hover/code:opacity-100 transition-opacity flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 6h8M7 3l3 3-3 3" />
                          </svg>
                        </button>
                      </td>

                      <td className="px-3 py-2.5 text-xs font-medium text-gray-700 max-w-[200px] truncate">
                        {clientsMap.get(r.code_client) ?? '—'}
                      </td>

                      <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                        {r.envoyee_le ? fmtDate(r.envoyee_le) : '—'}
                      </td>

                      <td className="px-3 py-2.5">
                        {jours !== null ? (
                          <span className={`text-[11px] font-bold tabular-nums ${
                            r.statut === 'payee'                             ? 'text-gray-300'  :
                            jours >= 30 && r.statut === 'envoyee'           ? 'text-red-600'   :
                            jours >= SEUIL_ALERTE && r.statut === 'envoyee' ? 'text-amber-600' :
                            'text-gray-500'
                          }`}>
                            {jours === 0 ? 'Auj.' : `${jours}j`}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>

                      <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600 whitespace-nowrap">
                        {getMontant(r) > 0 ? fmtEuros(getMontant(r)) : '—'}
                      </td>

                      <td className="px-3 py-2.5">
                        {opMap.get(r.operateur_id) ? (
                          <span className="text-[10px] font-bold text-ockham-navy/50 bg-ockham-teal-muted px-1.5 py-0.5 rounded tracking-wide">
                            {opMap.get(r.operateur_id)}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>

                      {peutModifier && (
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          {!r.archivee && (
                            <button
                              onClick={() => onArchiver(r.id)}
                              title="Classer cette relance"
                              className="w-5 h-5 rounded-full border border-red-200 bg-red-50/60 flex items-center justify-center text-red-300 hover:text-red-500 hover:bg-red-100 hover:border-red-300 transition-colors"
                            >
                              <span className="text-[9px] leading-none font-bold">✕</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {affichees.length > 10 && (
              <div className="px-4 py-2 border-t border-gray-50 text-center text-[10px] text-gray-300">
                {affichees.length} relances · défiler pour toutes les voir
              </div>
            )}
          </div>

          {affichees.length > 10 && (() => {
            const active = scrollRatio < 0.33 ? 'top' : scrollRatio < 0.67 ? 'mid' : 'bot'
            const dot = (zone: 'top' | 'mid' | 'bot') =>
              active === zone ? 'w-2 h-2 bg-gray-500' : 'w-1 h-1 bg-gray-300'
            return (
              <div className="flex flex-col items-center justify-center gap-1.5 flex-shrink-0 w-3">
                <span className={`block rounded-full transition-all duration-300 ${dot('top')}`} />
                <span className={`block rounded-full transition-all duration-300 ${dot('mid')}`} />
                <span className={`block rounded-full transition-all duration-300 ${dot('bot')}`} />
              </div>
            )
          })()}
        </div>
      )}

      <ModalDetailRelance
        relance={relanceOuverte}
        onFermer={() => setRelanceOuverteId(null)}
        onMajStatut={onMajStatut}
        onArchiver={onArchiver}
        onSauvegarderNote={onSauvegarderNote}
        commentaires={commentaires}
        onSauvegarderCommentaire={onSauvegarderCommentaire}
      />
    </div>
  )
}
