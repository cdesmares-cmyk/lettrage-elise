// Timeline unifiée — relances manuelles + automatiques, triées chronologiquement
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface RelanceManuelle {
  id: string
  note: string | null
  note_operateur: string | null
  envoyee_le: string
  contacts_ids: string[] | null
  factures_ids: string[] | null
}

interface LogAuto {
  id: string
  envoye_le: string
  statut: 'envoye' | 'bounce' | 'erreur'
  contact_email: string | null
  montant_total: number | null
  resend_id: string | null
}

type EntreeTimeline =
  | { type: 'manuelle'; data: RelanceManuelle; date: string }
  | { type: 'auto'; groupe: LogAuto[]; date: string }

interface Apercu {
  type: 'manuelle' | 'auto'
  id: string
  html: string | null
  chargement: boolean
}

interface Props {
  codeClient: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function formatMontant(v: number | null) {
  if (v == null) return null
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function SectionTimelineRelances({ codeClient }: Props) {
  const [relancesManuelles, setRelancesManuelles] = useState<RelanceManuelle[]>([])
  const [logsAuto, setLogsAuto] = useState<LogAuto[]>([])
  const [chargement, setChargement] = useState(true)
  const [apercu, setApercu] = useState<Apercu | null>(null)

  useEffect(() => {
    let actif = true
    setChargement(true)
    Promise.all([
      supabase
        .from('relances')
        .select('id, note, note_operateur, envoyee_le, contacts_ids, factures_ids')
        .eq('code_client', codeClient)
        .not('envoyee_le', 'is', null)
        .order('envoyee_le', { ascending: false })
        .limit(20),
      supabase
        .from('relances_auto_log')
        .select('id, envoye_le, statut, contact_email, montant_total, resend_id')
        .eq('code_client', codeClient)
        .order('envoye_le', { ascending: false })
        .limit(60),
    ]).then(([{ data: manuelles }, { data: auto }]) => {
      if (!actif) return
      setRelancesManuelles((manuelles ?? []) as RelanceManuelle[])
      setLogsAuto((auto ?? []) as LogAuto[])
      setChargement(false)
    })
    return () => { actif = false }
  }, [codeClient])

  // Grouper les logs auto par resend_id (= un email = une capsule)
  const groupesAuto = logsAuto.reduce<Record<string, LogAuto[]>>((acc, log) => {
    const key = log.resend_id ?? log.id
    if (!acc[key]) acc[key] = []
    acc[key].push(log)
    return acc
  }, {})

  const timeline: EntreeTimeline[] = [
    ...relancesManuelles.map(r => ({ type: 'manuelle' as const, data: r, date: r.envoyee_le })),
    ...Object.values(groupesAuto).map(logs => ({ type: 'auto' as const, groupe: logs, date: logs[0].envoye_le })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  async function ouvrirApercu(type: 'manuelle' | 'auto', id: string) {
    setApercu({ type, id, html: null, chargement: true })
    let html: string | null = null
    if (type === 'manuelle') {
      const { data } = await supabase.from('relances').select('corps_html').eq('id', id).maybeSingle()
      html = (data as { corps_html: string | null } | null)?.corps_html ?? null
    } else {
      const { data } = await supabase.from('relances_auto_log').select('corps_html').eq('id', id).maybeSingle()
      html = (data as { corps_html: string | null } | null)?.corps_html ?? null
    }
    setApercu(prev => prev?.id === id ? { ...prev, html, chargement: false } : prev)
  }

  if (chargement) {
    return (
      <div className="space-y-2 pt-3 border-t border-gray-100">
        {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
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
      <div className="space-y-2 pt-3 border-t border-gray-100">
        {timeline.map((entree, idx) => {
          if (entree.type === 'manuelle') {
            const r = entree.data
            const nbDest = r.contacts_ids?.length ?? 0
            const nbFact = r.factures_ids?.length ?? 0
            return (
              <button
                key={r.id}
                onClick={() => ouvrirApercu('manuelle', r.id)}
                className="w-full text-left bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-3 space-y-1.5 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-500">{formatDate(r.envoyee_le)}</span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Manuelle</span>
                  </div>
                  <span className="text-[9px] text-gray-400 flex-shrink-0">
                    {nbFact > 0 && `${nbFact} fact.`}
                    {nbFact > 0 && nbDest > 0 && ' · '}
                    {nbDest > 0 && `${nbDest} dest.`}
                  </span>
                </div>
                {r.note && <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{r.note}</p>}
                {r.note_operateur && <p className="text-[10px] text-gray-400">{r.note_operateur}</p>}
              </button>
            )
          }

          // Capsule auto
          const logs = entree.groupe
          const statut = logs.some(l => l.statut === 'bounce') ? 'bounce'
            : logs.some(l => l.statut === 'erreur') ? 'erreur'
            : 'envoye'
          const badgeClass = statut === 'envoye'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : statut === 'bounce'
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-red-50 text-red-700 border-red-200'
          const badgeLabel = statut === 'envoye' ? 'Envoyé' : statut === 'bounce' ? 'Bounce' : 'Erreur'
          const contact = logs[0].contact_email
          const montant = formatMontant(logs[0].montant_total)

          return (
            <button
              key={`auto-${idx}`}
              onClick={() => ouvrirApercu('auto', logs[0].id)}
              className="w-full text-left bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 space-y-1.5 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-500">{formatDate(entree.date)}</span>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 border border-blue-200">Auto</span>
                </div>
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${badgeClass}`}>{badgeLabel}</span>
              </div>
              {(contact || montant) && (
                <div className="flex items-center gap-3">
                  {contact && <span className="text-[11px] text-gray-500 truncate">{contact}</span>}
                  {montant && <span className="text-[11px] font-mono font-semibold text-gray-700 flex-shrink-0">{montant}</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Modal aperçu mail — rendu en fixed pour passer au-dessus du panneau */}
      {apercu && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => setApercu(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  apercu.type === 'auto'
                    ? 'bg-blue-50 text-blue-500 border-blue-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {apercu.type === 'auto' ? 'Auto' : 'Manuelle'}
                </span>
                <p className="text-sm font-semibold text-gray-800">Aperçu du mail envoyé</p>
              </div>
              <button
                onClick={() => setApercu(null)}
                className="w-7 h-7 rounded-full border border-gray-200 text-gray-400 text-sm hover:bg-gray-50 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-1 min-h-0">
              {apercu.chargement ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">Chargement…</div>
              ) : apercu.html ? (
                <iframe
                  srcDoc={apercu.html}
                  className="w-full border-0 rounded-b-2xl"
                  style={{ height: '70vh' }}
                  sandbox="allow-same-origin"
                  title="Aperçu mail"
                />
              ) : (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400 italic">
                  Contenu non disponible — ce mail a été envoyé avant l'activation de l'historique.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
