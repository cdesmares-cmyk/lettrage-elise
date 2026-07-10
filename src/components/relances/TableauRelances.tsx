import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { IcSearch, IcFileText, IcClock } from '../Icones'
import type { Relance, StatutRelance } from '../../hooks/useRelances'
import { useRole } from '../../contexts/RoleContext'
import { useAppData } from '../../contexts/AppDataContext'
import type { StatsOperateur } from '../../hooks/useLeaderboard'
import type { FactureDetail, CommentaireFacture } from '../../types/client'

const STATUTS: { val: StatutRelance; label: string; cls: string; dot: string; menuCls: string }[] = [
  { val: 'brouillon',          label: 'Brouillon',            cls: 'bg-gray-100 text-gray-500 border-gray-200',         dot: 'bg-gray-400',    menuCls: 'text-gray-600' },
  { val: 'envoyee',            label: 'Relance en cours',     cls: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500',    menuCls: 'text-blue-700' },
  { val: 'repondue',           label: 'Prise de contact',     cls: 'bg-violet-50 text-violet-700 border-violet-200',    dot: 'bg-violet-500',  menuCls: 'text-violet-700' },
  { val: 'promesse_paiement',  label: 'Promesse de paiement', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',    dot: 'bg-indigo-500',  menuCls: 'text-indigo-700' },
  { val: 'sans_reponse',       label: 'Sans réponse',         cls: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400',   menuCls: 'text-amber-700' },
  { val: 'payee',              label: 'Payée',                cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', menuCls: 'text-emerald-700' },
]

const STATUTS_ORDRE = ['envoyee', 'repondue', 'promesse_paiement', 'sans_reponse', 'payee']

const TRANSITIONS: Partial<Record<StatutRelance, StatutRelance[]>> = {
  envoyee:           ['repondue', 'sans_reponse', 'payee'],
  sans_reponse:      ['repondue', 'payee'],
  repondue:          ['promesse_paiement', 'payee'],
  promesse_paiement: ['payee'],
}

const FILTRES_STATUT: { val: StatutRelance | 'tous'; label: string }[] = [
  { val: 'tous',              label: 'Tous les statuts' },
  { val: 'envoyee',           label: 'Relance en cours' },
  { val: 'repondue',          label: 'Prise de contact' },
  { val: 'promesse_paiement', label: 'Promesse de paiement' },
  { val: 'sans_reponse',      label: 'Sans réponse' },
  { val: 'payee',             label: 'Payée' },
]

type ColSort = 'code_client' | 'nom_client' | 'envoyee_le' | 'jours' | 'statut' | 'montant' | 'operateur'

function BadgeStatut({ statut, peutModifier, onClick }: { statut: StatutRelance; peutModifier: boolean; onClick: (e: React.MouseEvent) => void }) {
  const s = STATUTS.find(x => x.val === statut) ?? STATUTS[0]
  const hasTransitions = !!TRANSITIONS[statut]?.length
  const interactive = peutModifier && hasTransitions
  return (
    <button
      onClick={interactive ? onClick : undefined}
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap transition-all ${s.cls} ${
        interactive ? 'cursor-pointer hover:brightness-95 hover:shadow-sm' : 'cursor-default'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.label}
      {interactive && <span className="opacity-40 text-[8px] ml-0.5">▾</span>}
    </button>
  )
}

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

interface Props {
  relances: Relance[]
  chargement: boolean
  onMajStatut: (id: string, statut: StatutRelance) => Promise<boolean>
  onArchiver: (id: string) => Promise<boolean>
  onSauvegarderNote: (id: string, note: string) => Promise<boolean>
  onOuvrirCommentaire: (fac: FactureDetail) => void
  classement: StatsOperateur[]
  commentaires: Map<string, CommentaireFacture>
  filtreOp: string
  onFiltreOpChange: (op: string) => void
}

export function TableauRelances({ relances, chargement, onMajStatut, onArchiver, onSauvegarderNote, onOuvrirCommentaire, classement, commentaires, filtreOp, onFiltreOpChange }: Props) {
  const { peutModifier } = useRole()
  const { clients, facturesActives } = useAppData()
  const [filtreStatut, setFiltreStatut] = useState<StatutRelance | 'tous'>('tous')
  const [recherche, setRecherche] = useState('')
  const [popupStatut, setPopupStatut] = useState<{ id: string; top: number; left: number } | null>(null)
  const [ligneOuverte, setLigneOuverte] = useState<string | null>(null)
  const [noteTexte, setNoteTexte] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
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

  useEffect(() => {
    const r = relances.find(x => x.id === ligneOuverte)
    setNoteTexte(r?.note ?? '')
  }, [ligneOuverte])

  function getMontant(r: Relance): number {
    return (r.factures_ids ?? []).reduce((sum, id) => sum + (facturesMap.get(id)?.montant_ttc ?? 0), 0)
  }

  const actives = relances.filter(r => r.statut !== 'brouillon' && !r.archivee)
  const totalActives = filtreOp === 'tous' ? actives.length : actives.filter(r => r.operateur_id === filtreOp).length

  const filtrees = actives.filter(r => {
    if (filtreStatut !== 'tous' && r.statut !== filtreStatut) return false
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
      // Relances en alerte remontent en premier dans tous les cas
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
        case 'statut':   cmp = STATUTS_ORDRE.indexOf(a.statut) - STATUTS_ORDRE.indexOf(b.statut); break
        case 'montant':  cmp = getMontant(a) - getMontant(b); break
        case 'operateur': cmp = (opMap.get(a.operateur_id) ?? '').localeCompare(opMap.get(b.operateur_id) ?? ''); break
      }
      return triAsc ? cmp : -cmp
    })
  }, [filtrees, tri, triAsc, clientsMap, opMap])

  function toggleTri(col: ColSort) {
    if (tri === col) setTriAsc(v => !v)
    else { setTri(col); setTriAsc(false) }
  }

  function fleche(col: ColSort) {
    if (tri !== col) return <span className="text-gray-300 ml-0.5 text-[9px]">↕</span>
    return <span className="text-ockham-teal ml-0.5 text-[9px]">{triAsc ? '↑' : '↓'}</span>
  }

  if (chargement) return <div className="py-12 text-center text-sm text-gray-400">Chargement…</div>

  const nbCols = peutModifier ? 8 : 7

  return (
    <div className="space-y-3">
      {/* Barre filtres ligne 1 : pills statut + recherche */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
          {FILTRES_STATUT.map(f => (
            <button
              key={f.val}
              onClick={() => setFiltreStatut(f.val)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                filtreStatut === f.val
                  ? 'bg-ockham-navy text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

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
          <select
            value={filtreOp}
            onChange={e => onFiltreOpChange(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-ockham-teal bg-white text-gray-600"
          >
            <option value="tous">Tous les opérateurs</option>
            {operateursDispo.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
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
                  ['statut',      'Statut'],
                  ['montant',     'Montant TTC'],
                  ['operateur',   'Op.'],
                ] as [ColSort, string][]).map(([col, label]) => (
                  <th
                    key={col}
                    onClick={() => toggleTri(col)}
                    className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-3 cursor-pointer hover:text-ockham-teal select-none whitespace-nowrap"
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
                const enRetard = jours !== null && jours >= SEUIL_ALERTE && r.statut === 'envoyee'
                const alerte = estEnAlerte(r)
                const nomClient = clientsMap.get(r.code_client) ?? '—'
                const montant = getMontant(r)
                const opNom = opMap.get(r.operateur_id) ?? ''
                const ouvert = ligneOuverte === r.id
                const rowCls = enRetard ? 'bg-amber-50/50 hover:bg-amber-50' : ouvert ? 'bg-ockham-teal-muted' : 'hover:bg-gray-50/40'

                // Factures liées
                const factures = (r.factures_ids ?? []).map(id => facturesMap.get(id)).filter(Boolean)

                return (
                  <>
                    <tr
                      key={r.id}
                      onClick={() => setLigneOuverte(ouvert ? null : r.id)}
                      className={`transition-colors cursor-pointer border-t border-gray-50 first:border-t-0 ${rowCls}`}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-500">
                        <div className="flex items-center gap-1.5">
                          {alerte && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                          {r.code_client}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-700 max-w-[160px] truncate">{nomClient}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                        {r.envoyee_le ? fmtDate(r.envoyee_le) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {jours !== null ? (
                          <span className={`text-[11px] font-bold tabular-nums ${enRetard ? 'text-amber-600' : r.statut === 'payee' ? 'text-gray-300' : 'text-gray-500'}`}>
                            {jours === 0 ? 'Auj.' : `${jours}j`}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <BadgeStatut
                            statut={r.statut}
                            peutModifier={peutModifier && !r.archivee}
                            onClick={e => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              setPopupStatut(prev => prev?.id === r.id ? null : { id: r.id, top: rect.bottom + 6, left: rect.left })
                            }}
                          />
                          {enRetard && <span className="text-amber-500"><IcClock size={10} /></span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600 whitespace-nowrap">
                        {montant > 0 ? fmtEuros(montant) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {opNom ? (
                          <span className="text-[10px] font-bold text-ockham-navy/50 bg-ockham-teal-muted px-1.5 py-0.5 rounded tracking-wide">
                            {opNom}
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

                    {/* Ligne expandée — split : factures | note */}
                    {ouvert && (
                      <tr className="bg-ockham-teal-muted/60 border-t border-ockham-teal/10">
                        <td colSpan={nbCols} className="px-6 py-4">
                          <div className="flex gap-6">
                            {/* Gauche : factures liées */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-ockham-navy/50 uppercase tracking-wider mb-2">Factures liées</p>
                              {factures.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">Aucune facture liée trouvée</p>
                              ) : (
                                <div className="space-y-1">
                                  {factures.map(f => {
                                    if (!f) return null
                                    const com = commentaires.get(f.numero_piece)
                                    return (
                                      <div key={f.numero_piece} className="flex items-center gap-2 text-xs bg-white/70 border border-white rounded-lg px-3 py-1.5">
                                        <span className="font-mono font-semibold text-ockham-teal-dark w-28 flex-shrink-0">{f.numero_piece}</span>
                                        <span className="text-gray-600 font-medium tabular-nums w-20 flex-shrink-0">{fmtEuros(f.montant_ttc ?? 0)}</span>
                                        {com?.ne_pas_relancer && (
                                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">⛔ Ne pas relancer</span>
                                        )}
                                        <button
                                          onClick={e => { e.stopPropagation(); onOuvrirCommentaire(f) }}
                                          className={`ml-auto flex items-center gap-1 text-[10px] font-semibold border px-2 py-0.5 rounded transition-colors whitespace-nowrap flex-shrink-0 ${
                                            com?.ne_pas_relancer
                                              ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                              : (com?.commentaire ?? '').trim().length > 0
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                                : 'bg-ockham-teal-muted text-ockham-teal-dark border-ockham-teal/40 hover:bg-ockham-teal/10'
                                          }`}
                                        >
                                          <IcFileText size={10} /> Commentaire
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Droite : note libre */}
                            <div className="w-64 flex-shrink-0 flex flex-col gap-2">
                              <p className="text-[10px] font-bold text-ockham-navy/50 uppercase tracking-wider">Note de suivi</p>
                              {r.archivee ? (
                                <div className="flex-1 bg-white/70 border border-white rounded-lg px-3 py-2 text-xs text-gray-500 italic min-h-[80px]">
                                  {r.note || 'Aucune note'}
                                </div>
                              ) : (
                                <>
                                  <textarea
                                    value={noteTexte}
                                    onChange={e => setNoteTexte(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    placeholder="Saisir une note de suivi…"
                                    rows={4}
                                    className="w-full resize-y bg-white/80 border border-white focus:border-ockham-teal/40 rounded-lg px-3 py-2 text-xs text-gray-700 outline-none transition-colors placeholder-gray-300"
                                  />
                                  <button
                                    disabled={noteSaving}
                                    onClick={async e => {
                                      e.stopPropagation()
                                      setNoteSaving(true)
                                      await onSauvegarderNote(r.id, noteTexte)
                                      setNoteSaving(false)
                                    }}
                                    className="self-end text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-ockham-teal text-white hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors"
                                  >
                                    {noteSaving ? '…' : '✓ Enregistrer'}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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

          {/* Dots de scroll dynamiques */}
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

      {/* Overlay transparent pour fermer le popup au clic extérieur */}
      {popupStatut && (
        <div className="fixed inset-0 z-40" onClick={() => setPopupStatut(null)} />
      )}

      {/* Popover statut — design soigné */}
      {popupStatut && (() => {
        const relance = affichees.find(r => r.id === popupStatut.id)
        if (!relance) return null
        const options = TRANSITIONS[relance.statut] ?? []
        const current = STATUTS.find(s => s.val === relance.statut)
        return (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden"
            style={{ top: popupStatut.top, left: popupStatut.left, minWidth: 220 }}
          >
            {/* Statut actuel — en-tête du menu */}
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Statut actuel</p>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${current?.dot}`} />
                <span className="text-[12px] font-semibold text-gray-700">{current?.label}</span>
              </div>
            </div>

            {/* Options de transition */}
            <div className="py-1.5">
              <p className="px-4 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Passer à</p>
              {options.map(val => {
                const s = STATUTS.find(x => x.val === val)!
                return (
                  <button
                    key={val}
                    onClick={async () => {
                      setPopupStatut(null)
                      await onMajStatut(relance.id, val)
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left group"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
                    <span className={`text-[13px] font-semibold ${s.menuCls} group-hover:opacity-90`}>{s.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
