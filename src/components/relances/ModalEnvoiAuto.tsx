// Détail d'un envoi du robot.
//
// Même architecture que le modal des relances manuelles : en-tête navy,
// destinataires, puis le tableau des factures avec ses six colonnes. Un
// opérateur ne doit pas réapprendre à lire un écran parce que l'email vient
// d'une machine.
//
// Statut, Exclure et Commentaire fonctionnent ici comme ailleurs : ces trois
// colonnes agissent sur la FACTURE, indexées par numero_piece, pas sur la
// relance. Elles n'ont aucune raison d'être absentes d'un envoi automatique.
//
// Ce que ce modal n'a pas : la note de suivi et le bouton Archiver. Ces
// deux-là écrivent sur une ligne de la table relances, qu'un envoi du robot
// ne possède pas. Les afficher reviendrait à proposer un bouton qui échoue.
import { useState, useEffect, Fragment } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { IcLoader } from '../Icones'
import type { EnvoiAuto } from '../../hooks/useRelances'
import type { CommentaireFacture, StatutFacture } from '../../types/client'

interface SauvegarderComData {
  numero_piece: string
  contact: string
  date_contact: string
  commentaire: string
  operateur: string
  ne_pas_relancer?: boolean
}

interface Props {
  envoi: EnvoiAuto | null
  nomClient: string
  commentaires: Map<string, CommentaireFacture>
  onSauvegarderCommentaire: (data: SauvegarderComData) => Promise<boolean>
  onFermer: () => void
}

interface FactureLigne {
  numero_piece: string
  montant_ttc: number
  reste_du: number
  statut_facture: StatutFacture | null
}

function euros(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

const STATUTS: { val: StatutFacture | null; label: string }[] = [
  { val: 'litige',      label: 'Litige' },
  { val: 'provisionne', label: 'Provisionné' },
  { val: null,          label: 'Effacer' },
]

function BadgeStatutFacture({ statut, onOuvrir }: { statut: StatutFacture | null; onOuvrir: () => void }) {
  const cls = statut === 'litige'
    ? 'bg-red-100 text-red-700 border-red-200'
    : statut === 'provisionne'
      ? 'bg-orange-100 text-orange-700 border-orange-200'
      : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600'
  const label = statut === 'litige' ? 'Litige' : statut === 'provisionne' ? 'Provisionné' : 'Statut'
  return (
    <button onClick={onOuvrir}
            className={`cursor-pointer inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap transition-colors ${cls}`}>
      {label}
    </button>
  )
}

export function ModalEnvoiAuto({ envoi, nomClient, commentaires, onSauvegarderCommentaire, onFermer }: Props) {
  const { mettreAJourStatutLocal } = useAppData()
  const { utilisateur } = useAuth()
  const operateur = utilisateur?.email?.split('@')[0] ?? ''

  const [cache, setCache] = useState<Map<string, FactureLigne[]>>(new Map())
  const [statutsFac, setStatutsFac] = useState<Map<string, StatutFacture | null>>(new Map())
  const [nePasRelancer, setNePasRelancer] = useState<Map<string, boolean>>(new Map())
  const [comOuvertes, setComOuvertes] = useState<Set<string>>(new Set())
  const [textes, setTextes] = useState<Map<string, string>>(new Map())
  const [popupStatut, setPopupStatut] = useState<string | null>(null)

  const cle = envoi?.cle ?? null

  // Factures relues maintenant, pas figées à l'envoi : voir le reste dû du jour
  // est tout l'intérêt, il dit si le client a réglé depuis.
  useEffect(() => {
    if (!envoi || cache.has(envoi.cle)) return
    supabase
      .from('v_factures_avec_reste_du')
      .select('numero_piece, montant_ttc, reste_du, statut_facture')
      .in('numero_piece', envoi.numeros)
      .then(({ data }) => {
        setCache(prev => new Map(prev).set(envoi.cle, (data ?? []) as FactureLigne[]))
      })
  }, [cle, envoi, cache])

  if (!envoi) return null

  const factures   = cache.get(envoi.cle)
  const chargement = !factures
  const jours      = joursDepuis(envoi.envoye_le)
  const enRetard   = jours >= 10

  async function changerStatut(numeroPiece: string, statut: StatutFacture | null) {
    setStatutsFac(prev => new Map(prev).set(numeroPiece, statut))
    mettreAJourStatutLocal(numeroPiece, statut)
    setPopupStatut(null)
    await supabase.from('factures').update({ statut_facture: statut } as never).eq('numero_piece', numeroPiece)
    toast.success(statut === 'litige' ? 'Facture passée en litige'
      : statut === 'provisionne' ? 'Facture provisionnée' : 'Statut effacé')
  }

  async function basculerExclure(numeroPiece: string, valeur: boolean) {
    setNePasRelancer(prev => new Map(prev).set(numeroPiece, valeur))
    await onSauvegarderCommentaire({
      numero_piece: numeroPiece, contact: '', date_contact: '',
      commentaire: textes.get(numeroPiece) ?? commentaires.get(numeroPiece)?.commentaire ?? '',
      operateur, ne_pas_relancer: valeur,
    })
    toast.success(valeur ? 'Facture exclue des prochaines relances' : 'Facture réintégrée aux relances')
  }

  async function enregistrerCommentaire(numeroPiece: string) {
    await onSauvegarderCommentaire({
      numero_piece: numeroPiece, contact: '', date_contact: '',
      commentaire: textes.get(numeroPiece) ?? '',
      operateur, ne_pas_relancer: nePasRelancer.get(numeroPiece) ?? false,
    })
    toast.success('Commentaire enregistré')
  }

  const TH = 'text-[10px] font-bold text-gray-500 uppercase tracking-wider py-3'

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
            <p className="text-[11px] font-bold text-ockham-navy/60 uppercase tracking-wider mb-2">Destinataires</p>
            {/* Meme cadre que le modal des relances manuelles. */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ockham-teal/25 bg-ockham-teal-muted/60">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${envoi.statut === 'envoye' ? 'bg-ockham-teal' : 'bg-red-500'}`} />
                <span className="text-[12px] font-semibold text-ockham-navy leading-none">Relance Auto</span>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500 flex-shrink-0">
                  Relance
                </span>
                <span className="text-[11px] text-gray-400 font-mono">{envoi.contact_email ?? '—'}</span>
                {envoi.statut !== 'envoye' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 flex-shrink-0">
                    {envoi.statut === 'bounce' ? 'Rebond' : 'Erreur'}
                  </span>
                )}
              </div>
            </div>
            {/* Le journal ne conserve que la première adresse de l'envoi. */}
            <p className="text-[10px] text-gray-400 mt-1.5">
              Le journal du robot ne conserve que la première adresse. Les copies éventuelles ne sont pas tracées.
            </p>
          </div>

          <div className="px-1 pt-5 pb-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className={`${TH} text-left px-5`}>N° Facture</th>
                  <th className={`${TH} text-right px-3`}>Montant TTC</th>
                  <th className={`${TH} text-right px-3`}>Reste dû</th>
                  <th className={`${TH} text-left px-3`}>Statut</th>
                  <th className={`${TH} text-left px-3`}>Exclure</th>
                  <th className={`${TH} text-center px-3`}>Commentaire</th>
                </tr>
              </thead>
              <tbody>
                {chargement && (
                  <tr><td colSpan={6} className="px-5 py-5 text-xs text-gray-400 italic">
                    <span className="inline-flex items-center gap-2"><IcLoader size={12} /> Chargement…</span>
                  </td></tr>
                )}
                {envoi.numeros.map(n => {
                  const f = factures?.find(x => x.numero_piece === n)
                  if (!f && !chargement) {
                    return (
                      <tr key={n} className="[&>td]:border-b [&>td]:border-gray-50">
                        <td className="px-5 py-2.5 font-mono text-[12px] font-bold text-ockham-teal-dark">{n}</td>
                        <td colSpan={5} className="px-3 py-2.5 text-[11px] text-gray-400 italic">Facture introuvable</td>
                      </tr>
                    )
                  }
                  if (!f) return null
                  const statut  = statutsFac.get(n) ?? f.statut_facture
                  const exclue  = nePasRelancer.get(n) ?? commentaires.get(n)?.ne_pas_relancer ?? false
                  const comOpen = comOuvertes.has(n)
                  const hasCom  = (commentaires.get(n)?.commentaire ?? '').trim().length > 0
                  const solde   = f.reste_du <= 0.005
                  return (
                    <Fragment key={n}>
                      <tr className="[&>td]:border-b [&>td]:border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-2.5">
                          <span className="font-mono text-[12px] font-bold text-ockham-teal-dark">{n}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{euros(f.montant_ttc)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {solde
                            ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Payée</span>
                            : <span className="font-semibold tabular-nums text-red-600">{euros(f.reste_du)}</span>}
                        </td>
                        <td className="px-3 py-2.5 relative">
                          <BadgeStatutFacture statut={statut} onOuvrir={() => setPopupStatut(popupStatut === n ? null : n)} />
                          {popupStatut === n && (
                            <div className="absolute z-30 top-9 left-3 bg-white border border-gray-200 rounded-lg shadow-xl p-1 min-w-[130px]">
                              {STATUTS.map(s => (
                                <button key={s.label} onClick={() => changerStatut(n, s.val)}
                                        className="block w-full text-left text-[11.5px] px-2.5 py-1.5 rounded hover:bg-ockham-teal-muted hover:text-ockham-teal-dark text-gray-600">
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={exclue}
                                 onChange={e => basculerExclure(n, e.target.checked)}
                                 title="Exclure cette facture des prochaines relances"
                                 className="accent-ockham-teal cursor-pointer" />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => setComOuvertes(prev => {
                                    const s = new Set(prev)
                                    if (s.has(n)) s.delete(n); else s.add(n)
                                    return s
                                  })}
                                  className={`text-[10px] font-semibold px-2 py-1 rounded border transition-colors ${
                                    hasCom ? 'bg-ockham-teal-muted text-ockham-teal-dark border-ockham-teal/30'
                                           : 'border-gray-200 text-gray-400 hover:border-gray-300'
                                  }`}>
                            Commentaire
                          </button>
                        </td>
                      </tr>
                      {comOpen && (
                        <tr>
                          <td colSpan={6} className="px-5 py-3 bg-gray-50/60 border-b border-gray-50">
                            <textarea
                              value={textes.get(n) ?? commentaires.get(n)?.commentaire ?? ''}
                              onChange={e => setTextes(prev => new Map(prev).set(n, e.target.value))}
                              placeholder="Saisir un commentaire…"
                              rows={2}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-ockham-teal resize-none"
                            />
                            <div className="flex justify-end mt-2">
                              <button onClick={() => enregistrerCommentaire(n)}
                                      className="text-[11px] font-semibold bg-ockham-teal text-white px-3 py-1.5 rounded-lg hover:bg-ockham-teal-dark transition-colors">
                                Enregistrer
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
            <p className="text-[10px] text-gray-400 px-5 mt-1.5">
              Reste dû du jour, pas celui de l'envoi : il dit si le client a réglé depuis.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <p className="text-[10px] text-gray-400 max-w-md leading-snug">
            Pas de note de suivi ni d'archivage : un envoi automatique n'est pas une ligne
            de la table des relances, il n'a rien sur quoi écrire.
          </p>
          <button onClick={onFermer}
                  className="text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 px-5 py-2 rounded-lg transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
