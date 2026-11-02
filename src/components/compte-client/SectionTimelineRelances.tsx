// Cartouches minimalistes des relances d'un client — Date · Montant · Manuel/Auto · Initiales op.
// Limite 5 items visibles, bouton "X relances plus anciennes" pour tout voir.
// Clic sur une relance manuelle → ouvre ModalDetailRelance (identique à l'onglet Relances).
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import type { Relance, StatutRelance } from '../../hooks/useRelances'
import type { CommentaireFacture } from '../../types/client'
import { ModalDetailRelance } from '../relances/ModalDetailRelance'
import { ZoneTexteAuto } from './ZoneTexteAuto'
import { IcTelephone, IcEnveloppe } from '../Icones'

interface LogAuto {
  id: string
  envoye_le: string
  statut: 'envoye' | 'bounce' | 'erreur'
  contact_email: string | null
  montant_total: number | null
  resend_id: string | null
}

/** Un echange qui a eu lieu hors d'Ockham : un appel, ou un mail parti
 *  d'une boite personnelle. Table echanges_clients, migration 182. */
interface Echange {
  id: string
  canal: 'appel' | 'mail'
  echange_le: string
  contact_nom: string | null
  contact_prenom: string | null
  contact_telephone: string | null
  contact_email: string | null
  /** Historique (migration 182), avant la separation en quatre champs. Lu en
   *  repli pour les lignes deja saisies, plus jamais alimente. */
  contact_libre: string | null
  commentaire: string | null
  retour_client: string | null
  operateur: string | null
}

// date est porte par les trois variantes : c'est la cle de tri commune, et
// sans elle chaque ajout de source rallonge le ternaire du sort.
type Entree =
  | { type: 'manuelle'; date: string; relance: Relance; montant: number }
  | { type: 'auto'; date: string; groupe: LogAuto[]; montant: number }
  | { type: 'echange'; date: string; echange: Echange }

interface SauvegarderComData {
  numero_piece: string; contact: string; date_contact: string
  commentaire: string; operateur: string; ne_pas_relancer?: boolean
}

const LIMITE = 5

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}
function fmtEuros(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

const STYLE_CANAL: Record<Echange['canal'], { label: string; Icone: typeof IcTelephone }> = {
  appel: { label: 'Appel client', Icone: IcTelephone },
  mail:  { label: 'Mail client',  Icone: IcEnveloppe },
}

/** Les quatre champs du contact, dans l'ordre de saisie. Seuls ceux qui sont
 *  remplis s'affichent : la migration 183 les veut tous facultatifs, et une
 *  grille de quatre lignes vides ne dit rien a personne. */
function champsContact(e: Echange): { label: string; valeur: string }[] {
  const paires = [
    { label: 'Nom',       valeur: e.contact_nom },
    { label: 'Prénom',    valeur: e.contact_prenom },
    { label: 'Téléphone', valeur: e.contact_telephone },
    { label: 'Mail',      valeur: e.contact_email },
  ]
  const remplis = paires.filter(p => p.valeur?.trim()).map(p => ({ label: p.label, valeur: p.valeur!.trim() }))
  // Repli pour les lignes d'avant la 183, qui n'ont que contact_libre.
  if (remplis.length === 0 && e.contact_libre?.trim()) {
    return [{ label: 'Contact', valeur: e.contact_libre.trim() }]
  }
  return remplis
}

interface PropsLigneEchange {
  echange: Echange
  isPremiere: boolean
  onEnregistrer: (id: string, commentaire: string, retour: string) => Promise<boolean>
}

function LigneEchange({ echange: e, isPremiere, onEnregistrer }: PropsLigneEchange) {
  const [deplie, setDeplie] = useState(false)
  const [commentaire, setCommentaire] = useState(e.commentaire ?? '')
  const [retour, setRetour] = useState(e.retour_client ?? '')
  const [enCours, setEnCours] = useState(false)
  const { label, Icone } = STYLE_CANAL[e.canal]

  const contact = champsContact(e)
  const modifie = commentaire !== (e.commentaire ?? '') || retour !== (e.retour_client ?? '')

  async function enregistrer() {
    setEnCours(true)
    await onEnregistrer(e.id, commentaire, retour)
    setEnCours(false)
  }

  return (
    <div className={`rounded-lg border ${isPremiere ? 'border-ockham-navy/25' : 'border-gray-200'}`}>
      {/* Replie : le canal, pas le contact. Le nom tronque au milieu d'un
          numero de telephone ne disait ni qui c'etait ni ce qui s'etait dit. */}
      <button
        onClick={() => setDeplie(d => !d)}
        className="w-full text-left flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
      >
        <span className={`text-[11px] font-medium w-[52px] flex-shrink-0 tabular-nums ${isPremiere ? 'text-ockham-navy' : 'text-gray-500'}`}>
          {fmt(e.echange_le)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold flex-1 truncate text-gray-700">
          <Icone size={12} className="flex-shrink-0 text-gray-400" />
          {label}
        </span>
        <span className="text-[10px] font-bold w-5 text-center flex-shrink-0 text-gray-400">
          {e.operateur ?? '?'}
        </span>
        <svg
          className={`w-3 h-3 flex-shrink-0 text-gray-300 transition-transform ${deplie ? 'rotate-90' : ''}`}
          viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M4.5 2.5l4 3.5-4 3.5" />
        </svg>
      </button>

      {deplie && (
        <div className="px-3 pb-3 pt-2 space-y-2.5 border-t border-gray-100">
          {contact.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Contact</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {contact.map(c => (
                  <div key={c.label} className="min-w-0">
                    <span className="block text-[9px] text-gray-400">{c.label}</span>
                    <span className="block text-[11px] font-semibold text-gray-700 truncate">{c.valeur}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Commentaire</p>
            <ZoneTexteAuto value={commentaire} onChange={setCommentaire} placeholder="Ce qui a été dit" />
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Retour du client</p>
            <ZoneTexteAuto value={retour} onChange={setRetour} placeholder="Ce que le client a répondu" />
          </div>

          {modifie && (
            <button
              onClick={enregistrer}
              disabled={enCours}
              className="text-[10px] font-bold text-ockham-teal border border-ockham-teal/30 px-2.5 py-1 rounded-lg hover:bg-ockham-teal/5 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  codeClient: string
  /** Incremente par le parent apres l'enregistrement d'un echange : c'est le
   *  signal de rechargement. Le formulaire vit au-dessus de ce composant,
   *  l'historique en dessous, et les deux doivent rester d'accord. */
  rafraichir?: number
}

export function SectionTimelineRelances({ codeClient, rafraichir = 0 }: Props) {
  const { facturesActives } = useAppData()
  const { profil } = useAuth()
  const [relances, setRelances]   = useState<Relance[]>([])
  const [logsAuto, setLogsAuto]   = useState<LogAuto[]>([])
  const [echanges, setEchanges]   = useState<Echange[]>([])
  const [initOp, setInitOp]       = useState<Map<string, string>>(new Map())
  const [commentaires, setCommentaires] = useState<Map<string, CommentaireFacture>>(new Map())
  const [chargement, setChargement] = useState(true)
  const [tout, setTout]           = useState(false)
  const [ouvert, setOuvert]       = useState<Relance | null>(null)

  useEffect(() => {
    let actif = true
    setChargement(true)
    Promise.all([
      supabase
        .from('relances')
        .select('id,code_client,operateur_id,contacts_ids,contacts_snapshot,factures_ids,objet,statut,points_attribues,cree_le,envoyee_le,mis_a_jour_le,archivee,note,note_operateur,note_archivee_le,date_rappel')
        .eq('code_client', codeClient)
        .eq('archivee', false)
        .not('envoyee_le', 'is', null)
        .order('envoyee_le', { ascending: false })
        .limit(50),
      supabase
        .from('relances_auto_log')
        .select('id,envoye_le,statut,contact_email,montant_total,resend_id')
        .eq('code_client', codeClient)
        .order('envoye_le', { ascending: false })
        .limit(100),
      supabase
        .from('echanges_clients')
        .select('id,canal,echange_le,contact_nom,contact_prenom,contact_telephone,contact_email,contact_libre,commentaire,retour_client,operateur')
        .eq('code_client', codeClient)
        .order('echange_le', { ascending: false })
        .limit(50),
      supabase.from('utilisateurs').select('id,initiales'),
    ]).then(([{ data: r }, { data: a }, { data: e }, { data: u }]) => {
      if (!actif) return
      setRelances((r ?? []) as Relance[])
      setLogsAuto((a ?? []) as LogAuto[])
      setEchanges((e ?? []) as Echange[])
      const map = new Map<string, string>()
      for (const usr of (u ?? []) as { id: string; initiales: string | null }[]) {
        if (usr.initiales) map.set(usr.id, usr.initiales)
      }
      setInitOp(map)
      setChargement(false)
    })
    return () => { actif = false }
  }, [codeClient, rafraichir])

  // Commentaires des factures de la relance ouverte
  useEffect(() => {
    const ids = ouvert?.factures_ids
    if (!ids?.length) return
    supabase
      .from('commentaires_factures')
      .select('id,numero_piece,contact,date_contact,commentaire,operateur,updated_at,ne_pas_relancer')
      .in('numero_piece', ids)
      .then(({ data }) => {
        const map = new Map<string, CommentaireFacture>()
        for (const c of (data ?? []) as CommentaireFacture[]) map.set(c.numero_piece, c)
        setCommentaires(map)
      })
  }, [ouvert?.id])

  const facturesMap = new Map(facturesActives.map(f => [f.numero_piece, f]))
  function montantR(r: Relance): number {
    return (r.factures_ids ?? []).reduce((s, id) => s + (facturesMap.get(id)?.montant_ttc ?? 0), 0)
  }

  const groupesAuto = logsAuto.reduce<Record<string, LogAuto[]>>((acc, l) => {
    const key = l.resend_id ?? l.id
    if (!acc[key]) acc[key] = []
    acc[key].push(l)
    return acc
  }, {})

  const timeline: Entree[] = [
    ...relances.map(r => ({
      type: 'manuelle' as const, date: r.envoyee_le ?? '', relance: r, montant: montantR(r),
    })),
    ...Object.values(groupesAuto).map(g => ({
      type: 'auto' as const, date: g[0].envoye_le, groupe: g, montant: g[0].montant_total ?? 0,
    })),
    ...echanges.map(e => ({ type: 'echange' as const, date: e.echange_le, echange: e })),
  ]
    // Tri sur le JOUR seul. echange_le est une date, envoyee_le un horodatage :
    // compares en entier, '2026-11-02' passerait toujours apres
    // '2026-11-02T09:00:00Z' parce que la chaine est plus courte, et un appel
    // du matin se retrouverait sous la relance de l'apres-midi.
    .sort((a, b) => b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)))

  const visible = tout ? timeline : timeline.slice(0, LIMITE)
  const hasMore = timeline.length > LIMITE

  // Handlers locaux pour ModalDetailRelance
  async function onMajStatut(id: string, statut: StatutRelance, dateRappel?: string): Promise<boolean> {
    setRelances(prev => prev.map(r => r.id === id ? { ...r, statut, date_rappel: dateRappel ?? r.date_rappel } : r))
    setOuvert(prev => prev?.id === id ? { ...prev, statut, date_rappel: dateRappel ?? prev?.date_rappel } : prev)
    const update: Record<string, unknown> = { statut }
    if (dateRappel) update.date_rappel = dateRappel
    const { error } = await supabase.from('relances').update(update as never).eq('id', id)
    return !error
  }

  async function onArchiver(id: string): Promise<boolean> {
    setRelances(prev => prev.filter(r => r.id !== id))
    const { error } = await supabase.from('relances').update({ archivee: true } as never).eq('id', id)
    return !error
  }

  async function onSauvegarderNote(id: string, note: string): Promise<boolean> {
    setRelances(prev => prev.map(r => r.id === id ? { ...r, note } : r))
    const { error } = await supabase.from('relances').update({ note } as never).eq('id', id)
    return !error
  }

  async function onSauvegarderCommentaire(data: SauvegarderComData): Promise<boolean> {
    const payload = {
      numero_piece:    data.numero_piece,
      organisation_id: profil?.organisation_id,
      contact:         data.contact.trim() || null,
      date_contact:    data.date_contact || null,
      commentaire:     data.commentaire.trim() || null,
      operateur:       data.operateur.trim() || null,
      ne_pas_relancer: data.ne_pas_relancer ?? false,
      updated_at:      new Date().toISOString(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from('commentaires_factures').upsert(payload as any, { onConflict: 'organisation_id,numero_piece' })
    if (!error) {
      setCommentaires(prev => {
        const n = new Map(prev)
        n.set(data.numero_piece, {
          id:              prev.get(data.numero_piece)?.id ?? '',
          numero_piece:    data.numero_piece,
          contact:         data.contact.trim() || null,
          date_contact:    data.date_contact || null,
          commentaire:     data.commentaire.trim() || null,
          operateur:       data.operateur.trim() || null,
          ne_pas_relancer: data.ne_pas_relancer ?? false,
          updated_at:      new Date().toISOString(),
        })
        return n
      })
    }
    return !error
  }

  // Le retour du client arrive apres coup : on raccroche au telephone sans
  // savoir ce qui sera paye. Le commentaire aussi se corrige, on note vite
  // pendant l'appel. Les deux restent modifiables.
  async function majEchange(id: string, commentaire: string, retour: string): Promise<boolean> {
    const maj = {
      commentaire:   commentaire.trim() || null,
      retour_client: retour.trim() || null,
    }
    const { error } = await supabase.from('echanges_clients').update(maj as never).eq('id', id)
    if (error) return false
    setEchanges(prev => prev.map(e => e.id === id ? { ...e, ...maj } : e))
    return true
  }

  if (chargement) {
    return (
      <div className="space-y-1.5 pt-3 border-t border-gray-100">
        {[1, 2, 3].map(i => <div key={i} className="h-9 rounded-lg bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  if (timeline.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic pt-3 border-t border-gray-100">
        Aucun contact client enregistré.
      </p>
    )
  }

  return (
    <>
      <div className="space-y-1.5 pt-3 border-t border-gray-100">
        {visible.map((entree, idx) => {
          const isPremiere = idx === 0

          if (entree.type === 'manuelle') {
            const r   = entree.relance
            const date = entree.date ? fmt(entree.date) : '—'
            const op   = initOp.get(r.operateur_id) ?? '?'

            return (
              <button
                key={r.id}
                onClick={() => setOuvert(r)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors group cursor-pointer ${
                  isPremiere
                    ? 'border-ockham-teal/40 bg-ockham-teal-muted/50 hover:bg-ockham-teal-muted'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className={`text-[11px] font-medium w-[52px] flex-shrink-0 tabular-nums ${isPremiere ? 'text-ockham-teal-dark' : 'text-gray-500'}`}>
                  {date}
                </span>
                <span className={`text-[11px] font-bold flex-1 tabular-nums ${isPremiere ? 'text-ockham-navy' : 'text-gray-700'}`}>
                  {fmtEuros(entree.montant)}
                </span>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${
                  isPremiere
                    ? 'bg-ockham-teal/10 text-ockham-teal-dark border-ockham-teal/30'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>Manuel</span>
                <span className={`text-[10px] font-bold w-5 text-center flex-shrink-0 ${isPremiere ? 'text-ockham-teal' : 'text-gray-400'}`}>
                  {op}
                </span>
                <svg
                  className={`w-3 h-3 flex-shrink-0 transition-colors ${isPremiere ? 'text-ockham-teal/60 group-hover:text-ockham-teal' : 'text-gray-300 group-hover:text-gray-400'}`}
                  viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M4.5 2.5l4 3.5-4 3.5" />
                </svg>
              </button>
            )
          }

          if (entree.type === 'echange') {
            return (
              <LigneEchange
                key={entree.echange.id}
                echange={entree.echange}
                isPremiere={isPremiere}
                onEnregistrer={majEchange}
              />
            )
          }

          // Capsule auto (non cliquable, pas de modal)
          const g     = entree.groupe
          const date  = fmt(entree.date)
          const bounce = g.some(l => l.statut === 'bounce')

          return (
            <div
              key={`auto-${entree.date}-${idx}`}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border ${
                isPremiere
                  ? 'border-ockham-teal/40 bg-ockham-teal-muted/50'
                  : 'border-gray-100 bg-gray-50/60'
              }`}
            >
              <span className={`text-[11px] font-medium w-[52px] flex-shrink-0 tabular-nums ${isPremiere ? 'text-ockham-teal-dark' : 'text-gray-500'}`}>
                {date}
              </span>
              <span className={`text-[11px] font-bold flex-1 tabular-nums ${isPremiere ? 'text-ockham-navy' : 'text-gray-600'}`}>
                {fmtEuros(entree.montant)}
              </span>
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${
                bounce ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-blue-500 border-blue-200'
              }`}>Auto</span>
              <span className="w-5 flex-shrink-0" />
              <span className="w-3 flex-shrink-0" />
            </div>
          )
        })}

        {hasMore && (
          <button
            onClick={() => setTout(p => !p)}
            className="w-full text-center text-[10px] font-semibold text-ockham-teal hover:text-ockham-teal-dark py-1.5 transition-colors cursor-pointer"
          >
            {tout ? '↑ Réduire' : `↓ ${timeline.length - LIMITE} relance${timeline.length - LIMITE > 1 ? 's' : ''} plus ancienne${timeline.length - LIMITE > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      <ModalDetailRelance
        relance={ouvert}
        onFermer={() => setOuvert(null)}
        onMajStatut={onMajStatut}
        onArchiver={onArchiver}
        onSauvegarderNote={onSauvegarderNote}
        commentaires={commentaires}
        onSauvegarderCommentaire={onSauvegarderCommentaire}
      />
    </>
  )
}
