import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { buildHtml } from '../../lib/relanceEmail'
import type { GmailToken } from '../../hooks/useGmailAuth'
import type { CompteClient, CommentaireFacture } from '../../types/client'
import type { Contact } from '../../hooks/useContacts'

const SUJET_PREFIXE = '[ Elise Lyon ] - Relance factures impayées'

function fmtEncours(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`
  if (n >= 10_000)    return `${Math.round(n / 1_000)} k€`
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

interface GmailAuthProps {
  estConnecte: boolean
  token: GmailToken | null
  connecterGmail: () => void
  envoyerEmail: (p: { destinataires: string[]; objet: string; corpsHtml: string }) => Promise<{ threadId: string } | null>
  recupererSignature: () => Promise<string | null>
}

interface Props {
  clients: CompteClient[]
  gmailAuth: GmailAuthProps
  commentaires: Map<string, CommentaireFacture>
  onFermer: () => void
  onFini: () => void
}

interface EtatClient {
  client: CompteClient
  contacts: Contact[]
  nomForm: string
  emailForm: string
  ajoutEnCours: boolean
}

interface Resultat {
  nom: string
  succes: boolean
  raison?: string
}

export function ModalRelanceMasse({ clients, gmailAuth, commentaires, onFermer, onFini }: Props) {
  const { utilisateur } = useAuth()
  const { facturesActives } = useAppData()
  const { estConnecte, token: gmailToken, connecterGmail, envoyerEmail, recupererSignature } = gmailAuth

  const [etats, setEtats] = useState<EtatClient[]>(clients.map(c => ({ client: c, contacts: [], nomForm: '', emailForm: '', ajoutEnCours: false })))
  const [chargementContacts, setChargementContacts] = useState(true)
  const [sujet, setSujet] = useState(SUJET_PREFIXE)
  const [progression, setProgression] = useState<{ enCours: boolean; current: number; total: number; resultats: Resultat[]; termine: boolean }>({ enCours: false, current: 0, total: 0, resultats: [], termine: false })

  // Chargement des contacts pour tous les clients en une seule requête
  useEffect(() => {
    if (!clients.length) return
    const codes = clients.map(c => c.code_dso)
    supabase
      .from('contacts_client')
      .select('id, code_client, prenom, nom, email, telephone, role_contact, actif')
      .in('code_client', codes)
      .eq('actif', true)
      .then(({ data }) => {
        const contactsParClient = new Map<string, Contact[]>()
        for (const c of (data ?? []) as Contact[]) {
          const liste = contactsParClient.get(c.code_client) ?? []
          liste.push(c)
          contactsParClient.set(c.code_client, liste)
        }
        setEtats(prev => prev.map(e => ({ ...e, contacts: contactsParClient.get(e.client.code_dso) ?? [] })))
        setChargementContacts(false)
      })
  }, [])

  const ajouterContact = useCallback(async (idx: number) => {
    const e = etats[idx]
    if (!e.nomForm.trim() || !e.emailForm.trim()) return
    setEtats(prev => prev.map((x, i) => i === idx ? { ...x, ajoutEnCours: true } : x))
    const { data, error } = await supabase
      .from('contacts_client')
      .insert({ code_client: e.client.code_dso, nom: e.nomForm.trim(), prenom: null, email: e.emailForm.trim(), telephone: null, role_contact: 'relance', actif: true } as never)
      .select('id, code_client, prenom, nom, email, telephone, role_contact, actif')
      .single()
    if (error || !data) {
      toast.error('Erreur ajout contact')
      setEtats(prev => prev.map((x, i) => i === idx ? { ...x, ajoutEnCours: false } : x))
      return
    }
    toast.success('Contact ajouté')
    setEtats(prev => prev.map((x, i) => i === idx ? { ...x, contacts: [...x.contacts, data as Contact], nomForm: '', emailForm: '', ajoutEnCours: false } : x))
  }, [etats])

  const avecContact    = etats.filter(e => e.contacts.some(c => c.email))
  const sansContact    = etats.filter(e => !e.contacts.some(c => c.email))
  const totalEncours   = clients.reduce((s, c) => s + c.encours_total, 0)
  const peutEnvoyer    = !progression.enCours && !progression.termine && avecContact.length > 0

  async function handleEnvoyer() {
    if (!utilisateur || !peutEnvoyer) return
    const signature = estConnecte ? await recupererSignature() : null
    const cibles = etats.filter(e => e.contacts.some(c => c.email))
    setProgression({ enCours: true, current: 0, total: cibles.length, resultats: [], termine: false })

    const resultats: Resultat[] = []

    for (const e of cibles) {
      const contactsEmail = e.contacts.filter(c => c.email)
      const impayees = facturesActives.filter(f =>
        f.code_client === e.client.code_dso &&
        f.reste_du > 0.005 &&
        !commentaires.get(f.numero_piece)?.ne_pas_relancer
      )
      if (!impayees.length) {
        const r: Resultat = { nom: e.client.nom, succes: false, raison: 'Aucune facture impayée' }
        resultats.push(r)
        setProgression(prev => ({ ...prev, current: prev.current + 1, resultats: [...prev.resultats, r] }))
        continue
      }

      const factureLignes = impayees.map(f => ({ numero: f.numero_piece, montantTtc: f.montant_ttc, restedu: f.reste_du, echeance: f.date_echeance, pdfUrl: f.axonaut_pdf_url }))
      const corpsHtml     = buildHtml(factureLignes, signature)
      const objetClient   = `${sujet.trim()} - ${e.client.nom} - ${e.client.code_dso}`

      let gmailThreadId: string | undefined
      if (estConnecte) {
        const destinataires = contactsEmail.map(c => c.email!)
        const res = await envoyerEmail({ destinataires, objet: objetClient, corpsHtml })
        if (!res) {
          const r: Resultat = { nom: e.client.nom, succes: false, raison: 'Échec envoi Gmail' }
          resultats.push(r)
          setProgression(prev => ({ ...prev, current: prev.current + 1, resultats: [...prev.resultats, r] }))
          continue
        }
        gmailThreadId = res.threadId
      }

      const payload: Record<string, unknown> = {
        code_client:      e.client.code_dso,
        operateur_id:     utilisateur.id,
        contacts_ids:     contactsEmail.map(c => c.id),
        factures_ids:     impayees.map(f => f.numero_piece),
        objet:            objetClient,
        corps_html:       corpsHtml,
        statut:           'envoyee',
        envoyee_le:       new Date().toISOString(),
        points_attribues: 10,
      }
      if (gmailThreadId) payload.gmail_thread_id = gmailThreadId

      const { error } = await supabase.from('relances').insert(payload as never)
      const r: Resultat = error ? { nom: e.client.nom, succes: false, raison: 'Erreur enregistrement' } : { nom: e.client.nom, succes: true }
      resultats.push(r)
      setProgression(prev => ({ ...prev, current: prev.current + 1, resultats: [...prev.resultats, r] }))
    }

    const nbSucces = resultats.filter(r => r.succes).length
    setProgression(prev => ({ ...prev, enCours: false, termine: true }))
    toast.success(`${nbSucces} relance${nbSucces > 1 ? 's' : ''} envoyée${nbSucces > 1 ? 's' : ''} · +${nbSucces * 10} pts`)
    onFini()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={!progression.enCours ? onFermer : undefined} />
      <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[72px] pb-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[calc(100vh-88px)] flex flex-col overflow-hidden">

          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0E1A2B 0%, #1a2d44 100%)', borderTop: '2px solid #4CC5BB' }}
          >
            <div>
              <p className="text-sm font-bold text-white">Relance massive — <span className="text-ockham-teal">{clients.length} client{clients.length > 1 ? 's' : ''} sélectionné{clients.length > 1 ? 's' : ''}</span></p>
              <p className="text-xs text-white/50 mt-0.5">Encours total : {fmtEncours(totalEncours)} · {avecContact.length} prêt{avecContact.length > 1 ? 's' : ''} · {sansContact.length} sans contact</p>
            </div>
            {!progression.enCours && (
              <button onClick={onFermer} className="w-7 h-7 rounded-full border border-white/20 text-white/60 hover:bg-white/10 hover:text-white text-sm flex items-center justify-center transition-colors">✕</button>
            )}
          </div>

          {/* Corps */}
          <div className="flex-1 overflow-hidden flex min-h-0">

            {/* Colonne gauche */}
            <div className="w-2/5 border-r border-gray-100 overflow-y-auto px-5 py-4 space-y-5">

              {/* Statut Gmail */}
              {estConnecte ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <span className="text-emerald-600 text-sm">✓</span>
                  <p className="text-xs text-emerald-700">Envoi depuis <span className="font-semibold">{gmailToken?.gmail_email}</span></p>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">Gmail non connecté — les relances seront enregistrées sans envoi</p>
                  <button onClick={connecterGmail} className="text-xs font-semibold text-ockham-teal hover:underline ml-3 flex-shrink-0">Connecter →</button>
                </div>
              )}

              {/* Sujet */}
              <div>
                <label className="block text-[11px] font-bold text-ockham-teal uppercase tracking-wider mb-2">
                  <span className="text-ockham-navy/40 mr-1">1 —</span>Sujet commun
                </label>
                <input
                  value={sujet}
                  onChange={e => setSujet(e.target.value)}
                  disabled={progression.enCours || progression.termine}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal disabled:opacity-50"
                />
                <p className="text-[10px] text-gray-400 mt-1">Le nom et le code client seront ajoutés automatiquement par email.</p>
              </div>

              {/* Info */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 space-y-1">
                <p className="text-[11px] text-gray-600 font-medium">Chaque client reçoit un email individuel avec ses propres factures.</p>
                <p className="text-[10px] text-gray-400">Les factures marquées "Ne pas relancer" sont exclues automatiquement.</p>
              </div>

              {/* Récap */}
              {!chargementContacts && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">{avecContact.length} client{avecContact.length > 1 ? 's' : ''} prêt{avecContact.length > 1 ? 's' : ''} à envoyer</span>
                  </div>
                  {sansContact.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                      <span className="text-amber-700 font-medium">{sansContact.length} client{sansContact.length > 1 ? 's' : ''} sans contact — à compléter ci-contre</span>
                    </div>
                  )}
                </div>
              )}

              {/* Barre de progression */}
              {progression.enCours && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Envoi en cours…</span>
                    <span className="font-semibold tabular-nums">{progression.current}/{progression.total}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ockham-teal rounded-full transition-all duration-500"
                      style={{ width: `${progression.total > 0 ? (progression.current / progression.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Résultats */}
              {progression.resultats.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {progression.resultats.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${r.succes ? 'text-emerald-700' : 'text-red-600'}`}>
                      <span>{r.succes ? '✓' : '✗'}</span>
                      <span className="font-medium truncate">{r.nom}</span>
                      {!r.succes && r.raison && <span className="text-gray-400 truncate">— {r.raison}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Colonne droite — liste clients */}
            <div className="w-3/5 overflow-y-auto px-5 py-4">
              <p className="text-[11px] font-bold text-ockham-teal uppercase tracking-wider mb-3">
                <span className="text-ockham-navy/40 mr-1">2 —</span>Clients sélectionnés
              </p>

              {chargementContacts ? (
                <div className="flex items-center gap-2 py-8 justify-center text-xs text-gray-400">
                  <span className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
                  Chargement des contacts…
                </div>
              ) : (
                <div className="space-y-2">
                  {etats.map((e, idx) => {
                    const contactsEmail = e.contacts.filter(c => c.email)
                    const aContact = contactsEmail.length > 0
                    return (
                      <div
                        key={e.client.code_dso}
                        className={`border rounded-xl px-4 py-3 transition-colors ${aContact ? 'bg-white border-gray-200' : 'bg-amber-50/60 border-amber-200'}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Statut icône */}
                          <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${aContact ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                            {aContact ? '✓' : '⚠'}
                          </span>

                          <div className="flex-1 min-w-0">
                            {/* Identité */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-800 truncate">{e.client.nom}</span>
                              <span className="font-mono text-[10px] text-ockham-teal bg-ockham-teal-muted px-1.5 py-0.5 rounded">{e.client.code_dso}</span>
                              <span className="text-[10px] text-gray-400 tabular-nums">{fmtEncours(e.client.encours_total)}</span>
                              <span className="text-[10px] text-amber-600 tabular-nums">{e.client.nb_impayees} impayée{e.client.nb_impayees > 1 ? 's' : ''}</span>
                            </div>

                            {/* Contacts existants */}
                            {aContact && (
                              <div className="mt-1.5 space-y-0.5">
                                {contactsEmail.map(c => (
                                  <p key={c.id} className="text-[11px] text-ockham-teal">
                                    {[c.prenom, c.nom].filter(Boolean).join(' ')} — <span className="font-mono">{c.email}</span>
                                  </p>
                                ))}
                              </div>
                            )}

                            {/* Form ajout contact si aucun */}
                            {!aContact && (
                              <div className="mt-2 space-y-1.5">
                                <p className="text-[11px] text-amber-700 font-medium">Aucun contact — ajoutez-en un pour pouvoir envoyer</p>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    value={e.nomForm}
                                    onChange={ev => setEtats(prev => prev.map((x, i) => i === idx ? { ...x, nomForm: ev.target.value } : x))}
                                    placeholder="Nom *"
                                    className="flex-1 border border-amber-200 focus:border-ockham-teal rounded-lg px-2.5 py-1.5 text-xs outline-none bg-white"
                                  />
                                  <input
                                    type="email"
                                    value={e.emailForm}
                                    onChange={ev => setEtats(prev => prev.map((x, i) => i === idx ? { ...x, emailForm: ev.target.value } : x))}
                                    placeholder="Email *"
                                    className="flex-1 border border-amber-200 focus:border-ockham-teal rounded-lg px-2.5 py-1.5 text-xs outline-none bg-white"
                                  />
                                  <button
                                    onClick={() => ajouterContact(idx)}
                                    disabled={e.ajoutEnCours || !e.nomForm.trim() || !e.emailForm.trim()}
                                    className="text-[11px] font-semibold px-3 py-1.5 bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal-dark disabled:opacity-40 transition-colors whitespace-nowrap"
                                  >
                                    {e.ajoutEnCours ? '…' : '+ Ajouter'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            {!progression.termine ? (
              <>
                <button
                  onClick={onFermer}
                  disabled={progression.enCours}
                  className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 disabled:opacity-40 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleEnvoyer}
                  disabled={!peutEnvoyer}
                  className="flex-[2] flex items-center justify-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {progression.enCours
                    ? `Envoi en cours… ${progression.current}/${progression.total}`
                    : estConnecte
                      ? `✉ Envoyer ${avecContact.length} email${avecContact.length > 1 ? 's' : ''} via Gmail`
                      : `✉ Enregistrer ${avecContact.length} relance${avecContact.length > 1 ? 's' : ''}`}
                </button>
              </>
            ) : (
              <button
                onClick={onFermer}
                className="flex-1 text-sm font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark py-2.5 rounded-lg transition-colors"
              >
                ✓ Fermer
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
