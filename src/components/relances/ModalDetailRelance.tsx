import { useState, useEffect, useRef, Fragment, useMemo } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { etatVue, SEUIL_SANS_SUITE_DEFAUT } from '../../hooks/useRelances'
import type { Relance, StatutRelance } from '../../hooks/useRelances'
import type { CommentaireFacture, StatutFacture } from '../../types/client'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'

const IcLitige = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)
const IcProv = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)
const IcComment = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

function fmtEuros(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}
function joursDepuis(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}
type EtatCom = { texte: string; saving: boolean }
type FactureRelance = { numero_piece: string; montant_ttc: number; reste_du: number; statut_facture: StatutFacture | null }

interface SauvegarderComData {
  numero_piece: string; contact: string; date_contact: string
  commentaire: string; operateur: string; ne_pas_relancer?: boolean
}

interface Props {
  relance: Relance | null
  onFermer: () => void
  onMajStatut: (id: string, statut: StatutRelance, dateRappel?: string) => Promise<boolean>
  onArchiver: (id: string) => Promise<boolean>
  onSauvegarderNote: (id: string, note: string) => Promise<boolean>
  commentaires: Map<string, CommentaireFacture>
  onSauvegarderCommentaire: (data: SauvegarderComData) => Promise<boolean>
}

// Rendu du badge statut — fonction simple (pas un composant) pour éviter les remounts
function renderStatutBadge(
  id: string,
  statut: StatutFacture | null,
  onOpen: (e: React.MouseEvent, id: string) => void
) {
  if (statut === 'litige')
    return <button onClick={e => onOpen(e, id)} className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 whitespace-nowrap"><IcLitige /> Litige</button>
  if (statut === 'provisionne')
    return <button onClick={e => onOpen(e, id)} className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 whitespace-nowrap"><IcProv /> Provisionné</button>
  return <button onClick={e => onOpen(e, id)} className="cursor-pointer inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600 whitespace-nowrap">Statut</button>
}

export function ModalDetailRelance({ relance, onFermer, onArchiver, onSauvegarderNote, commentaires, onSauvegarderCommentaire }: Props) {
  const { facturesActives, clients, mettreAJourStatutLocal } = useAppData()
  const { utilisateur } = useAuth()

  // ── Tous les hooks en tête, avant tout return conditionnel ──
  const [noteTexte, setNoteTexte]           = useState('')
  const [noteSaving, setNoteSaving]         = useState(false)
  const [etatsCom, setEtatsCom]             = useState<Map<string, EtatCom>>(new Map())
  const [nePasRelancer, setNePasRelancer]   = useState<Map<string, boolean>>(new Map())
  const [statutsFac, setStatutsFac]         = useState<Map<string, StatutFacture | null>>(new Map())
  const [comOuvertes, setComOuvertes]       = useState<Set<string>>(new Set())
  const [popupStatut, setPopupStatut]       = useState<{ id: string; top: number; left: number } | null>(null)
  const [statutSaving, setStatutSaving]     = useState(false)
  const [contacts, setContacts]             = useState<{ id: string; nom: string; prenom: string | null; email: string; role_contact?: string | null }[]>([])
  const [facturesRelance, setFacturesRelance] = useState<FactureRelance[]>([])
  const [lettragesRelanceMap, setLettragesRelanceMap] = useState<Map<string, string[]>>(new Map())
  const popupRef                            = useRef<HTMLDivElement>(null)

  const facturesMap = useMemo(() => new Map(facturesActives.map(f => [f.numero_piece, f])), [facturesActives])
  const clientsMap  = new Map(clients.map(c => [c.code_dso, c.nom]))
  const operateur   = utilisateur?.email?.split('@')[0] ?? ''
  const etatActuel  = useMemo(() => {
    if (!relance) return null
    // Attend le fetch DB avant de calculer (évite les flashs de faux état)
    if (relance.factures_ids?.length && facturesRelance.length === 0) return null
    return etatVue(relance, lettragesRelanceMap, SEUIL_SANS_SUITE_DEFAUT)
  }, [relance, lettragesRelanceMap, facturesRelance.length])

  // Afficher les contacts — priorité au snapshot sauvegardé (résistant aux suppressions)
  // Fallback live pour les relances antérieures à la migration 118
  useEffect(() => {
    setContacts([])
    if (!relance) return
    if (relance.contacts_snapshot?.length) {
      setContacts(relance.contacts_snapshot)
      return
    }
    const ids = relance.contacts_ids
    if (!ids?.length) return
    supabase
      .from('contacts_client')
      .select('id,nom,prenom,email,role_contact')
      .in('id', ids)
      .then(({ data }) => setContacts((data ?? []) as typeof contacts))
  }, [relance?.id])

  // Charge les factures et les lettrages de la relance (pour état et affichage)
  useEffect(() => {
    setFacturesRelance([])
    setLettragesRelanceMap(new Map())
    if (!relance?.factures_ids?.length) return
    const ids = relance.factures_ids
    Promise.all([
      supabase.from('v_factures_avec_reste_du').select('numero_piece, montant_ttc, reste_du, statut_facture').in('numero_piece', ids),
      supabase.from('lettrages').select('numero_facture, date_lettrage, annule').in('numero_facture', ids),
    ]).then(([{ data: fData }, { data: lData }]) => {
      if (fData) {
        const fetched = fData as FactureRelance[]
        setFacturesRelance(fetched)
        setStatutsFac(prev => {
          const n = new Map(prev)
          for (const f of fetched) n.set(f.numero_piece, f.statut_facture ?? null)
          return n
        })
      }
      if (lData) {
        const rows = (lData as { numero_facture: string; date_lettrage: string; annule: boolean | null }[])
          .filter(r => r.annule !== true)
        const lMap = new Map<string, string[]>()
        for (const row of rows) {
          const arr = lMap.get(row.numero_facture) ?? []
          arr.push(row.date_lettrage)
          lMap.set(row.numero_facture, arr)
        }
        for (const [k, v] of lMap) lMap.set(k, v.sort())
        setLettragesRelanceMap(lMap)
      }
    })
  }, [relance?.id])

  useEffect(() => {
    setNoteTexte(relance?.note ?? '')
    setComOuvertes(new Set())
    setPopupStatut(null)
    if (!relance) return
    const com = new Map<string, EtatCom>()
    const npr = new Map<string, boolean>()
    const stf = new Map<string, StatutFacture | null>()
    for (const id of relance.factures_ids ?? []) {
      const c = commentaires.get(id)
      const f = facturesMap.get(id)
      com.set(id, { texte: c?.commentaire ?? '', saving: false })
      npr.set(id, c?.ne_pas_relancer ?? false)
      stf.set(id, f?.statut_facture ?? null)
    }
    setEtatsCom(com)
    setNePasRelancer(npr)
    setStatutsFac(stf)
  }, [relance?.id])

  useEffect(() => {
    if (!relance) return
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [!!relance, onFermer])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopupStatut(null)
    }
    if (popupStatut) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [!!popupStatut])

  // ── Return conditionnel après tous les hooks ──
  if (!relance) return null

  // Affiche TOUTES les factures du snapshot (y compris lettrées) — fusion fetch DB + cache live
  const factures = (relance.factures_ids ?? []).map(id => {
    const fetched = facturesRelance.find(f => f.numero_piece === id)
    if (fetched) return fetched
    const live = facturesMap.get(id)
    if (live) return { numero_piece: id, montant_ttc: live.montant_ttc ?? 0, reste_du: live.reste_du, statut_facture: live.statut_facture ?? null } as FactureRelance
    return null
  }).filter(Boolean) as FactureRelance[]
  const nomClient = clientsMap.get(relance.code_client) ?? relance.code_client
  // Montant de référence = engagement initial de la relance
  const montant   = relance.solde_snapshot > 0
    ? relance.solde_snapshot
    : factures.reduce((s, f) => s + (f?.montant_ttc ?? 0), 0)
  const jours     = relance.envoyee_le ? joursDepuis(relance.envoyee_le) : null
  const enRetard  = jours !== null && jours >= 10

  function setCom(id: string, patch: Partial<EtatCom>) {
    setEtatsCom(prev => { const n = new Map(prev); n.set(id, { ...prev.get(id)!, ...patch }); return n })
  }

  async function sauvegarderCom(id: string) {
    if (!relance) return
    const etat = etatsCom.get(id)
    if (!etat) return
    setCom(id, { saving: true })
    const nr = nePasRelancer.get(id) ?? false
    await onSauvegarderCommentaire({ numero_piece: id, contact: '', date_contact: '', commentaire: etat.texte, operateur, ne_pas_relancer: nr })
    setCom(id, { saving: false })
    toast.success('Commentaire enregistré')
  }

  async function changerStatutFac(numeroPiece: string, statut: StatutFacture | null) {
    setStatutsFac(prev => { const n = new Map(prev); n.set(numeroPiece, statut); return n })
    mettreAJourStatutLocal(numeroPiece, statut)
    setPopupStatut(null)
    await supabase.from('factures').update({ statut_facture: statut } as never).eq('numero_piece', numeroPiece)
    toast.success(statut === 'litige' ? 'Facture passée en litige' : statut === 'provisionne' ? 'Facture provisionnée' : 'Statut effacé')
  }

  async function autoSaveNePasRelancer(numeroPiece: string, value: boolean) {
    setNePasRelancer(prev => { const n = new Map(prev); n.set(numeroPiece, value); return n })
    const etat = etatsCom.get(numeroPiece) ?? { texte: '', saving: false }
    await onSauvegarderCommentaire({ numero_piece: numeroPiece, contact: '', date_contact: '', commentaire: etat.texte, operateur, ne_pas_relancer: value })
    toast.success(value ? 'Facture exclue des prochaines relances' : 'Facture réintégrée aux relances')
  }

  function toggleCom(id: string) {
    setComOuvertes(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function openPopup(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (popupStatut?.id === id) { setPopupStatut(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPopupStatut({ id, top: rect.bottom + 6, left: rect.left })
  }

  return (
    <>
      {/* Popup statut — en dehors du modal pour éviter overflow:hidden */}
      {popupStatut && (
        <div
          ref={popupRef}
          className="fixed z-[60] bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[160px]"
          style={{ top: popupStatut.top, left: popupStatut.left }}
        >
          {(['litige', 'provisionne', null] as const).map(val => (
            <button
              key={String(val)}
              onClick={() => changerStatutFac(popupStatut.id, val)}
              className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-gray-50 transition-colors text-gray-700"
            >
              {val === 'litige' ? 'Litige' : val === 'provisionne' ? 'Provisionné' : '✕ Effacer'}
            </button>
          ))}
        </div>
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onFermer}>
        <div className="absolute inset-0 bg-ockham-navy/50" />
        <div
          className="relative bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[88vh] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* En-tête navy */}
          <div className="px-6 py-4 bg-ockham-navy flex items-start justify-between gap-4 flex-shrink-0 rounded-t-2xl">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate">{nomClient}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-[11px] text-white/50 bg-white/10 px-1.5 py-0.5 rounded">{relance.code_client}</span>
                {relance.envoyee_le && (
                  <span className="text-[11px] text-white/50">
                    Envoyée le {new Date(relance.envoyee_le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xl font-bold text-ockham-teal tabular-nums">{fmtEuros(montant)}</span>
              {jours !== null && (
                <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${enRetard ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-white/10 text-white/70 border-white/20'}`}>
                  {jours === 0 ? 'Auj.' : `J+${jours}`}
                </span>
              )}
              <button
                onClick={onFermer}
                className="w-7 h-7 rounded-lg border border-white/20 flex items-center justify-center text-white/60 hover:text-red-400 hover:border-red-400/40 hover:bg-red-500/10 transition-colors text-sm leading-none"
              >
                ✕
              </button>
            </div>
          </div>

          {/* État de la relance */}
          {etatActuel && (
            <div className="px-5 py-2.5 border-b border-gray-100 flex-shrink-0 flex items-center gap-2 bg-gray-50/40">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">État</span>
              {etatActuel === 'en_cours' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border border-ockham-teal/30 bg-ockham-teal-muted text-ockham-teal-dark">En cours</span>
              )}
              {etatActuel === 'payee' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-700">Payée — paiement détecté</span>
              )}
              {etatActuel === 'sans_suite' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border" style={{ borderColor: '#C07840', background: '#F5E9D8', color: '#C07840' }}>Sans suite</span>
              )}
            </div>
          )}

          {/* Note de suivi */}
          <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0 flex flex-col gap-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Note de suivi</p>
            <textarea
              value={noteTexte}
              onChange={e => setNoteTexte(e.target.value)}
              placeholder="Saisir une note de suivi…"
              rows={3}
              className="w-full text-xs text-gray-700 bg-white border border-gray-200 focus:border-ockham-teal/50 rounded-xl px-3 py-2.5 outline-none resize-none placeholder-gray-300 transition-colors"
            />
            <div className="flex justify-end">
              <button
                disabled={noteSaving}
                onClick={async () => {
                  setNoteSaving(true)
                  await onSauvegarderNote(relance.id, noteTexte)
                  setNoteSaving(false)
                  toast.success('Note enregistrée')
                }}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-ockham-teal text-white hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors cursor-pointer"
              >
                {noteSaving ? '…' : '✓ Enregistrer'}
              </button>
            </div>
          </div>

          {/* Ligne 2 : Destinataires */}
          {contacts.length > 0 && (
            <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Destinataires</p>
              <div className="flex flex-wrap gap-2">
                {contacts.map(c => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ockham-teal/25 bg-ockham-teal-muted/60"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-ockham-teal flex-shrink-0" />
                    <span className="text-[12px] font-semibold text-ockham-navy leading-none">
                      {c.prenom ? `${c.prenom} ${c.nom}` : c.nom}
                    </span>
                    {c.role_contact && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500 flex-shrink-0">
                        {c.role_contact}
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400 font-mono">{c.email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ligne 3 : Tableau factures */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">N° Facture</th>
                  <th className="text-right px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Montant TTC</th>
                  <th className="text-right px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Reste dû</th>
                  <th className="text-left px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                  <th className="text-left px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Exclure</th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Commentaire</th>
                </tr>
              </thead>
              <tbody>
                {factures.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-4 text-xs text-gray-400 italic">Chargement…</td>
                  </tr>
                )}
                {factures.map(f => {
                  if (!f) return null
                  const nr      = nePasRelancer.get(f.numero_piece) ?? false
                  const comOpen = comOuvertes.has(f.numero_piece)
                  const hasCom  = (commentaires.get(f.numero_piece)?.commentaire ?? '').trim().length > 0
                  const statut  = statutsFac.get(f.numero_piece) ?? null
                  const etat    = etatsCom.get(f.numero_piece) ?? { texte: '', saving: false }
                  return (
                    <Fragment key={f.numero_piece}>
                      <tr className="[&>td]:border-b [&>td]:border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-2.5">
                          <span className="font-mono text-[12px] font-bold text-ockham-teal-dark">{f.numero_piece}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-bold text-ockham-navy tabular-nums">{fmtEuros(f.montant_ttc ?? 0)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {f.reste_du <= 0.005
                            ? <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-700">Payée</span>
                            : f.reste_du < (f.montant_ttc ?? 0) - 0.005
                              ? <span className="font-bold text-amber-600 tabular-nums">{fmtEuros(f.reste_du)}</span>
                              : <span className="font-bold text-red-600 tabular-nums">{fmtEuros(f.reste_du)}</span>
                          }
                        </td>
                        <td className="px-3 py-2.5">
                          {renderStatutBadge(f.numero_piece, statut, openPopup)}
                        </td>
                        <td className="px-3 py-2.5">
                          <label className="flex items-center gap-2 cursor-pointer w-fit">
                            <input
                              type="checkbox"
                              checked={nr}
                              onChange={e => autoSaveNePasRelancer(f.numero_piece, e.target.checked)}
                              className="w-3.5 h-3.5 accent-amber-500"
                            />
                            {nr && <span className="text-[10px] text-amber-600 font-semibold">Exclue</span>}
                          </label>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => toggleCom(f.numero_piece)}
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors cursor-pointer whitespace-nowrap ${
                              hasCom
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-ockham-teal-muted text-ockham-teal-dark border-ockham-teal/40 hover:bg-ockham-teal/10'
                            }`}
                          >
                            <IcComment /> Commentaire
                          </button>
                        </td>
                      </tr>
                      {comOpen && (
                        <tr className="bg-gray-50/80">
                          <td colSpan={6} className="px-5 py-3 border-b border-gray-100">
                            <div className="flex gap-3 items-end pl-4">
                              <textarea
                                value={etat.texte}
                                onChange={e => setCom(f.numero_piece, { texte: e.target.value })}
                                placeholder="Note sur cette facture…"
                                rows={2}
                                className="flex-1 text-[12px] text-gray-700 bg-white border border-gray-200 focus:border-ockham-teal/50 rounded-lg px-2.5 py-2 outline-none resize-none placeholder-gray-300 transition-colors"
                              />
                              <button
                                disabled={etat.saving}
                                onClick={() => sauvegarderCom(f.numero_piece)}
                                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-ockham-teal text-white hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                {etat.saving ? '…' : '✓ Enregistrer'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pied de page */}
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between flex-shrink-0">
            <button
              disabled={statutSaving}
              onClick={async () => { setStatutSaving(true); await onArchiver(relance.id); setStatutSaving(false); onFermer() }}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 border border-gray-200 bg-white hover:border-red-300 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
              Archiver
            </button>
            <button
              onClick={onFermer}
              className="text-[11px] font-semibold text-ockham-navy border border-ockham-navy/20 bg-white hover:bg-ockham-navy hover:text-white px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
