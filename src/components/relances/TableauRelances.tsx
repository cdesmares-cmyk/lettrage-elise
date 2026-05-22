import { useState, useMemo, useEffect } from 'react'
import type { Relance, StatutRelance } from '../../hooks/useRelances'
import { useRole } from '../../contexts/RoleContext'
import { useAppData } from '../../contexts/AppDataContext'
import type { StatsOperateur } from '../../hooks/useLeaderboard'
import type { FactureDetail, CommentaireFacture } from '../../types/client'

const STATUTS: { val: StatutRelance; label: string; cls: string }[] = [
  { val: 'brouillon',          label: 'Brouillon',             cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  { val: 'envoyee',            label: 'Relance en cours',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { val: 'repondue',           label: 'Prise de contact',      cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  { val: 'promesse_paiement',  label: 'Promesse de paiement',  cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { val: 'sans_reponse',       label: 'Sans réponse',          cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { val: 'payee',              label: 'Payée',                 cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
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

function badgeStatut(statut: StatutRelance) {
  const s = STATUTS.find(x => x.val === statut) ?? STATUTS[0]
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${s.cls}`}>{s.label}</span>
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

function initiales(nom: string): string {
  return nom.split(/[\s-]+/).map(p => p[0]?.toUpperCase() ?? '').join('').slice(0, 3)
}

const SEUIL_ALERTE = 10

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
  const [editStatut, setEditStatut] = useState<string | null>(null)
  const [ligneOuverte, setLigneOuverte] = useState<string | null>(null)
  const [noteTexte, setNoteTexte] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [tri, setTri] = useState<ColSort>('envoyee_le')
  const [triAsc, setTriAsc] = useState(false)

  const clientsMap = useMemo(() => new Map(clients.map(c => [c.code_dso, c.nom])), [clients])
  const facturesMap = useMemo(() => new Map(facturesActives.map(f => [f.numero_piece, f])), [facturesActives])
  const opMap = useMemo(() => new Map(classement.map(s => [s.operateur.id, s.operateur.nom_affiche || s.operateur.email.split('@')[0]])), [classement])

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

  const filtrees = actives.filter(r =>
    (filtreStatut === 'tous' || r.statut === filtreStatut) &&
    (filtreOp === 'tous' || r.operateur_id === filtreOp)
  )

  const affichees = useMemo(() => {
    return [...filtrees].sort((a, b) => {
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
    }).slice(0, 20)
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
      {/* Barre filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={filtreStatut}
          onChange={e => setFiltreStatut(e.target.value as StatutRelance | 'tous')}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-ockham-teal bg-white text-gray-600"
        >
          {FILTRES_STATUT.map(f => <option key={f.val} value={f.val}>{f.label}</option>)}
        </select>
        <select
          value={filtreOp}
          onChange={e => onFiltreOpChange(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-ockham-teal bg-white text-gray-600"
        >
          <option value="tous">Tous les opérateurs</option>
          {operateursDispo.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] text-gray-400">
            <span className="font-bold text-ockham-navy/70">{totalActives}</span> active{totalActives !== 1 ? 's' : ''}
          </span>
          {filtrees.length !== totalActives && filtrees.length > 0 && (
            <span className="text-[10px] text-gray-300">{filtrees.length} affichée{filtrees.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {filtrees.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400 bg-white border border-gray-100 rounded-xl">
          {actives.length === 0 ? 'Aucune relance envoyée pour le moment' : 'Aucune relance pour ce filtre'}
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
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
                const actions = TRANSITIONS[r.statut] ?? []
                const jours = r.envoyee_le ? joursDepuis(r.envoyee_le) : null
                const enRetard = jours !== null && jours >= SEUIL_ALERTE && r.statut === 'envoyee'
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
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.code_client}</td>
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
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {badgeStatut(r.statut)}
                          {enRetard && <span className="text-[9px] text-amber-500">⏰</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600 whitespace-nowrap">
                        {montant > 0 ? fmtEuros(montant) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {opNom ? (
                          <span className="text-[10px] font-bold text-ockham-navy/50 bg-ockham-teal-muted px-1.5 py-0.5 rounded tracking-wide" title={opNom}>
                            {initiales(opNom)}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      {peutModifier && (
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            {!r.archivee && actions.length > 0 && (
                              editStatut === r.id ? (
                                <select
                                  autoFocus
                                  defaultValue=""
                                  onBlur={() => setEditStatut(null)}
                                  onChange={async e => {
                                    if (!e.target.value) return
                                    setEditStatut(null)
                                    await onMajStatut(r.id, e.target.value as StatutRelance)
                                  }}
                                  className="text-[10px] border border-ockham-teal rounded px-1.5 py-1 outline-none bg-white text-gray-700 min-w-[130px]"
                                >
                                  <option value="" disabled>→ Choisir…</option>
                                  {actions.map(a => (
                                    <option key={a} value={a}>{STATUTS.find(s => s.val === a)?.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <button
                                  onClick={() => setEditStatut(r.id)}
                                  className="text-[10px] font-semibold px-2 py-1 rounded border border-gray-200 text-gray-400 hover:border-ockham-teal hover:text-ockham-teal hover:bg-ockham-teal-muted transition-colors whitespace-nowrap"
                                >
                                  → Statut
                                </button>
                              )
                            )}
                            {!r.archivee && (
                              <button
                                onClick={() => onArchiver(r.id)}
                                title="Classer cette relance"
                                className="w-5 h-5 rounded-full border border-red-200 bg-red-50/60 flex items-center justify-center text-red-300 hover:text-red-500 hover:bg-red-100 hover:border-red-300 transition-colors flex-shrink-0"
                              >
                                <span className="text-[9px] leading-none font-bold">✕</span>
                              </button>
                            )}
                          </div>
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
                                          💬 Commentaire
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
          {filtrees.length > 20 && (
            <div className="px-4 py-2 border-t border-gray-50 text-center text-[10px] text-gray-300">
              20 premières lignes sur {filtrees.length}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
