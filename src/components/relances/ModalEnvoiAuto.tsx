// Détail d'un envoi du robot.
//
// Même grammaire visuelle que le modal des relances manuelles — en-tête navy,
// code client, date d'envoi, montant, badge J+, puis destinataire et tableau
// des factures. Un opérateur ne doit pas réapprendre à lire un écran parce que
// l'email vient d'une machine.
//
// Ce qu'il n'a pas, et ne peut pas avoir : note de suivi, changement de statut,
// archivage. Un envoi automatique n'est pas une ligne de la table relances, il
// n'a rien sur quoi écrire.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { IcLoader } from '../Icones'
import type { EnvoiAuto } from '../../hooks/useRelances'

interface Props {
  envoi: EnvoiAuto | null
  nomClient: string
  onFermer: () => void
}

interface FactureLigne {
  numero_piece: string
  montant_ttc: number
  reste_du: number
}

function euros(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export function ModalEnvoiAuto({ envoi, nomClient, onFermer }: Props) {
  // Indexé par clé d'envoi : l'effet n'écrit qu'au retour des requêtes, jamais
  // pendant le rendu. Et rouvrir un envoi déjà consulté est instantané.
  const [cache, setCache] = useState<Map<string, { corps: string | null; factures: FactureLigne[] }>>(new Map())

  const cle = envoi?.cle ?? null

  useEffect(() => {
    if (!envoi || cache.has(envoi.cle)) return
    const filtreLog = envoi.cle.includes('|')
      ? supabase.from('relances_auto_log').select('corps_html')
          .eq('code_client', envoi.code_client).eq('envoye_le', envoi.envoye_le).limit(1)
      : supabase.from('relances_auto_log').select('corps_html').eq('resend_id', envoi.cle).limit(1)

    Promise.all([
      filtreLog,
      // Les factures sont relues maintenant, pas figées à l'envoi : voir le
      // reste dû du jour est tout l'intérêt — il dit si le client a payé depuis.
      supabase.from('v_factures_avec_reste_du')
        .select('numero_piece, montant_ttc, reste_du')
        .in('numero_piece', envoi.numeros),
    ]).then(([{ data: logData }, { data: facData }]) => {
      const row = (logData ?? [])[0] as { corps_html: string | null } | undefined
      setCache(prev => new Map(prev).set(envoi.cle, {
        corps: row?.corps_html ?? null,
        factures: ((facData ?? []) as FactureLigne[]),
      }))
    })
  }, [cle, envoi, cache])

  if (!envoi) return null

  const donnees    = cache.get(envoi.cle)
  const chargement = !donnees
  const jours      = joursDepuis(envoi.envoye_le)
  const enRetard   = jours >= 10

  const statutLabel = envoi.statut === 'envoye' ? 'Envoyé'
    : envoi.statut === 'bounce' ? 'Rebond, le client n\'a rien reçu'
    : 'Erreur à l\'envoi'
  const statutStyle = envoi.statut === 'envoye' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : envoi.statut === 'bounce' ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'

  const TH = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 px-3 py-2 text-left whitespace-nowrap'

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="relative bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[88vh] overflow-hidden"
           onClick={e => e.stopPropagation()}>

        {/* En-tête navy — identique au modal des relances manuelles */}
        <div className="px-6 py-4 bg-ockham-navy flex items-start justify-between gap-4 flex-shrink-0 rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">{nomClient}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-[11px] text-white/50 bg-white/10 px-1.5 py-0.5 rounded">{envoi.code_client}</span>
              <span className="text-[11px] text-white/50">
                Envoyée le {new Date(envoi.envoye_le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              <span className="text-[10px] font-bold text-ockham-teal bg-ockham-teal/15 border border-ockham-teal/30 px-1.5 py-0.5 rounded">
                AUTO
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xl font-bold text-ockham-teal tabular-nums">{euros(envoi.montant_total)}</span>
            <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${enRetard ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-white/10 text-white/70 border-white/20'}`}>
              {jours === 0 ? 'Auj.' : `J+${jours}`}
            </span>
            <button onClick={onFermer}
                    className="w-7 h-7 rounded-lg border border-white/20 flex items-center justify-center text-white/60 hover:text-red-400 hover:border-red-400/40 hover:bg-red-500/10 transition-colors text-sm leading-none">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">

          <div className="px-6 pt-4">
            <p className="text-[11px] font-bold text-ockham-navy/60 uppercase tracking-wider mb-2">Destinataire</p>
            <div className="inline-flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
              <span className={`w-1.5 h-1.5 rounded-full ${envoi.statut === 'envoye' ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-700">{envoi.contact_email ?? '—'}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statutStyle}`}>{statutLabel}</span>
            </div>
            {/* Le journal ne conserve que la première adresse de l'envoi. S'il y
                en avait d'autres en copie, elles ne sont pas tracées. */}
            <p className="text-[10px] text-gray-400 mt-1.5">
              Seule la première adresse de l'envoi est conservée par le journal.
            </p>
          </div>

          <div className="px-6 pt-5">
            <p className="text-[11px] font-bold text-ockham-navy/60 uppercase tracking-wider mb-2">
              Factures relancées · {envoi.numeros.length}
            </p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/60 border-b border-gray-100">
                    <th className={TH}>N° Facture</th>
                    <th className={`${TH} text-right`}>Montant TTC</th>
                    <th className={`${TH} text-right`}>Reste dû</th>
                  </tr>
                </thead>
                <tbody>
                  {envoi.numeros.map(n => {
                    const f = donnees?.factures.find(x => x.numero_piece === n)
                    const solde = f ? f.reste_du <= 0.005 : false
                    return (
                      <tr key={n} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-ockham-teal-dark">{n}</td>
                        <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-600">
                          {f ? euros(f.montant_ttc) : chargement ? '…' : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {!f ? <span className="text-xs text-gray-400">{chargement ? '…' : '—'}</span>
                            : solde
                              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Payée</span>
                              : <span className="text-xs font-semibold tabular-nums text-red-600">{euros(f.reste_du)}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              Reste dû du jour, pas celui de l'envoi : il dit si le client a réglé depuis.
            </p>
          </div>

          <div className="px-6 py-5">
            <p className="text-[11px] font-bold text-ockham-navy/60 uppercase tracking-wider mb-2">
              Message reçu par le client
            </p>
            {chargement ? (
              <div className="flex items-center gap-2 py-10 justify-center text-sm text-gray-400">
                <IcLoader size={14} /> Chargement…
              </div>
            ) : donnees?.corps ? (
              // Le HTML vient de notre propre fonction d'envoi, pas d'une saisie
              // utilisateur : il est construit par buildHtml dans relance-auto.
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/40"
                   dangerouslySetInnerHTML={{ __html: donnees.corps }} />
            ) : (
              <p className="text-xs text-gray-400 py-8 text-center">
                Le corps du message n'a pas été conservé pour cet envoi.
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button onClick={onFermer}
                  className="text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 px-5 py-2 rounded-lg transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
