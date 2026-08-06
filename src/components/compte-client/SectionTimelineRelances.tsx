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

interface LogAuto {
  id: string
  envoye_le: string
  statut: 'envoye' | 'bounce' | 'erreur'
  contact_email: string | null
  montant_total: number | null
  resend_id: string | null
}

type Entree =
  | { type: 'manuelle'; relance: Relance; montant: number }
  | { type: 'auto'; groupe: LogAuto[]; montant: number; date: string }

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

interface Props { codeClient: string }

export function SectionTimelineRelances({ codeClient }: Props) {
  const { facturesActives } = useAppData()
  const { profil } = useAuth()
  const [relances, setRelances]   = useState<Relance[]>([])
  const [logsAuto, setLogsAuto]   = useState<LogAuto[]>([])
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
      supabase.from('utilisateurs').select('id,nom,prenom'),
    ]).then(([{ data: r }, { data: a }, { data: u }]) => {
      if (!actif) return
      setRelances((r ?? []) as Relance[])
      setLogsAuto((a ?? []) as LogAuto[])
      const map = new Map<string, string>()
      for (const usr of (u ?? []) as { id: string; nom: string; prenom: string | null }[]) {
        map.set(usr.id, ((usr.nom[0] ?? '') + (usr.prenom?.[0] ?? '')).toUpperCase())
      }
      setInitOp(map)
      setChargement(false)
    })
    return () => { actif = false }
  }, [codeClient])

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
    ...relances.map(r => ({ type: 'manuelle' as const, relance: r, montant: montantR(r) })),
    ...Object.values(groupesAuto).map(g => ({
      type: 'auto' as const, groupe: g, montant: g[0].montant_total ?? 0, date: g[0].envoye_le,
    })),
  ].sort((a, b) => {
    const da = a.type === 'manuelle' ? (a.relance.envoyee_le ?? '') : a.date
    const db = b.type === 'manuelle' ? (b.relance.envoyee_le ?? '') : b.date
    return db.localeCompare(da)
  })

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
        Aucune relance envoyée pour ce client.
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
            const date = r.envoyee_le ? fmt(r.envoyee_le) : '—'
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
