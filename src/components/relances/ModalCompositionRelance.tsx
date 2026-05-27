import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useContacts } from '../../hooks/useContacts'
import { useAppData } from '../../contexts/AppDataContext'
import type { GmailToken } from '../../hooks/useGmailAuth'
import type { CompteClient, CommentaireFacture } from '../../types/client'
import { NumeroPiece } from '../NumeroPiece'
import { buildHtml, buildHtmlFromScenario, resolveBalises, fmtEuros, joursDepuis } from '../../lib/relanceEmail'

interface GmailAuthProps {
  estConnecte: boolean
  token: GmailToken | null
  connecterGmail: () => void
  envoyerEmail: (p: { destinataires: string[]; objet: string; corpsHtml: string }) => Promise<{ threadId: string } | null>
  recupererSignature: () => Promise<string | null>
}

interface Props {
  client: CompteClient | null
  onFermer: () => void
  onSent: () => void
  gmailAuth: GmailAuthProps
  commentaires?: Map<string, CommentaireFacture>
}

export function ModalCompositionRelance({ client, onFermer, onSent, gmailAuth, commentaires }: Props) {
  const { utilisateur } = useAuth()
  const { contacts, ajouter: ajouterContact } = useContacts(client?.code_dso ?? null)
  const { facturesActives } = useAppData()
  const { scenarios } = useAppData()
  const { estConnecte, token: gmailToken, connecterGmail, envoyerEmail, recupererSignature } = gmailAuth

  const impayees = facturesActives.filter(f =>
    f.code_client === client?.code_dso &&
    f.reste_du > 0.005 &&
    !commentaires?.get(f.numero_piece)?.ne_pas_relancer
  )

  const [contactsSel, setContactsSel] = useState<string[]>([])
  const [facturesSel, setFacturesSel] = useState<string[]>([])
  const [scenarioId, setScenarioId] = useState<string>('')
  const [objet, setObjet] = useState('')
  const [corps, setCorps] = useState('')
  const [emailFallback, setEmailFallback] = useState('')
  const [nomFallback, setNomFallback] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [onglet, setOnglet] = useState<'rediger' | 'apercu'>('rediger')
  const [tooltip, setTooltip] = useState<{ x: number; y: number; numero: string } | null>(null)
  const [signature, setSignature] = useState<string | null>(null)

  useEffect(() => {
    if (estConnecte) recupererSignature().then(setSignature)
  }, [estConnecte])

  useEffect(() => {
    if (!client) return
    setFacturesSel(impayees.map(f => f.numero_piece))
    setContactsSel(contacts.filter(c => c.email).map(c => c.id))
  }, [client?.code_dso, contacts.length, impayees.length])

  // Pré-remplissage auto dès que les scénarios sont chargés
  useEffect(() => {
    if (!client || !scenarios.length || scenarioId) return
    appliquerScenario(scenarios[0].id)
  }, [scenarios.length, client?.code_dso])

  function appliquerScenario(id: string) {
    const sc = scenarios.find(s => s.id === id)
    if (!sc || !client) return
    const montantDu = impayees.filter(f => facturesSel.includes(f.numero_piece)).reduce((s, f) => s + f.reste_du, 0)
    const ctx = { nomClient: client.nom, codeClient: client.code_dso, montantDu }
    setScenarioId(id)
    setObjet(resolveBalises(sc.objet, ctx))
    setCorps(resolveBalises(sc.corps_texte, ctx))
  }

  if (!client) return null

  const contactsAvecEmail = contacts.filter(c => c.email)
  const sanContacts = contactsAvecEmail.length === 0
  const nomClient = client.nom
  const codeClient = client.code_dso

  function toggleContact(id: string) {
    setContactsSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleFacture(num: string) {
    setFacturesSel(prev => prev.includes(num) ? prev.filter(x => x !== num) : [...prev, num])
  }

  const peutEnvoyer = !envoi && objet.trim() && corps.trim() && facturesSel.length > 0 &&
    (sanContacts ? emailFallback.trim() && nomFallback.trim() : contactsSel.length > 0)

  async function handleEnvoyer() {
    if (!utilisateur || !peutEnvoyer) return
    setEnvoi(true)

    let cIds = contactsSel
    if (sanContacts && emailFallback.trim()) {
      const ok = await ajouterContact({ nom: nomFallback.trim(), prenom: null, email: emailFallback.trim(), telephone: null, role_contact: 'relance' })
      if (!ok) { setEnvoi(false); return }
      cIds = []
    }

    // Envoi Gmail si l'opérateur a connecté sa boîte
    let gmailThreadId: string | undefined
    if (estConnecte) {
      const destinataires = sanContacts
        ? [emailFallback.trim()]
        : contactsAvecEmail.filter(c => contactsSel.includes(c.id)).map(c => c.email!).filter(Boolean)
      const selFactures = impayees.filter(f => facturesSel.includes(f.numero_piece))
        .map(f => ({ numero: f.numero_piece, montantTtc: f.montant_ttc, restedu: f.reste_du, echeance: f.date_echeance, pdfUrl: f.axonaut_pdf_url }))
      const htmlFinal = corps.includes('[Tableau Factures]')
        ? buildHtmlFromScenario(corps, selFactures, signature)
        : buildHtml(selFactures, signature)
      const res = await envoyerEmail({
        destinataires,
        objet:     objet.trim(),
        corpsHtml: htmlFinal,
      })
      if (!res) { toast.error('Échec de l\'envoi Gmail'); setEnvoi(false); return }
      gmailThreadId = res.threadId
    }

    const selFactures = impayees.filter(f => facturesSel.includes(f.numero_piece))
      .map(f => ({ numero: f.numero_piece, montantTtc: f.montant_ttc, restedu: f.reste_du, echeance: f.date_echeance, pdfUrl: f.axonaut_pdf_url }))
    const htmlFinal = corps.includes('[Tableau Factures]')
      ? buildHtmlFromScenario(corps, selFactures, signature)
      : buildHtml(selFactures, signature)

    const payload: Record<string, unknown> = {
      code_client:      codeClient,
      operateur_id:     utilisateur.id,
      contacts_ids:     cIds,
      factures_ids:     facturesSel,
      objet:            objet.trim(),
      corps_html:       htmlFinal,
      statut:           'envoyee',
      envoyee_le:       new Date().toISOString(),
      points_attribues: 10,
    }
    if (gmailThreadId) payload.gmail_thread_id = gmailThreadId

    const { error } = await supabase.from('relances').insert(payload as never)

    setEnvoi(false)
    if (error) { toast.error('Erreur lors de l\'enregistrement'); return }
    toast.success(estConnecte ? '✉ Envoyé · +10 pts' : '+10 pts · Relance enregistrée')
    onSent()
    onFermer()
  }

  const previewFactures = impayees.filter(f => facturesSel.includes(f.numero_piece))
    .map(f => ({ numero: f.numero_piece, montantTtc: f.montant_ttc, restedu: f.reste_du, echeance: f.date_echeance, pdfUrl: f.axonaut_pdf_url }))
  const previewHtml = corps.includes('[Tableau Factures]')
    ? buildHtmlFromScenario(corps, previewFactures, signature)
    : buildHtml(previewFactures, signature)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onFermer} />
      <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[72px] pb-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[calc(100vh-88px)] flex flex-col overflow-hidden">

          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0E1A2B 0%, #1a2d44 100%)', borderTop: '2px solid #4CC5BB' }}
          >
            <div>
              <p className="text-sm font-bold text-white">Nouvelle relance — <span className="text-ockham-teal">{nomClient}</span></p>
              <p className="text-xs text-white/50 mt-0.5 font-mono">{codeClient} · {impayees.length} facture{impayees.length > 1 ? 's' : ''} impayée{impayees.length > 1 ? 's' : ''} · {fmtEuros(client.encours_total)}</p>
            </div>
            <button onClick={onFermer} className="w-7 h-7 rounded-full border border-white/20 text-white/60 hover:bg-white/10 hover:text-white text-sm flex items-center justify-center transition-colors">✕</button>
          </div>

          {/* Corps — 2 colonnes */}
          <div className="flex-1 overflow-hidden flex min-h-0">

            {/* Colonne gauche : formulaire */}
            <div className="w-2/5 border-r border-gray-100 overflow-y-auto px-5 py-4 space-y-5">

              {/* Statut connexion Gmail */}
              {estConnecte ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <span className="text-emerald-600 text-sm">✓</span>
                  <p className="text-xs text-emerald-700">Envoi depuis <span className="font-semibold">{gmailToken?.gmail_email}</span></p>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">Gmail non connecté — la relance sera enregistrée sans envoi</p>
                  <button onClick={connecterGmail} className="text-xs font-semibold text-ockham-teal hover:underline ml-3 flex-shrink-0">
                    Connecter Gmail →
                  </button>
                </div>
              )}

              {/* Contacts */}
              <div>
                <label className="block text-[11px] font-bold text-ockham-teal uppercase tracking-wider mb-2"><span className="text-ockham-navy dark:text-white/40 mr-1">1 —</span>Destinataires</label>
                {sanContacts ? (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Aucun contact pour ce client. Renseignez un email pour envoyer et l'enregistrer.</p>
                    <input value={nomFallback} onChange={e => setNomFallback(e.target.value)} placeholder="Nom du contact *" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal" />
                    <input type="email" value={emailFallback} onChange={e => setEmailFallback(e.target.value)} placeholder="Email *" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal" />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {contactsAvecEmail.map(c => (
                      <label key={c.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${contactsSel.includes(c.id) ? 'border-ockham-teal/40 bg-ockham-teal-muted' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="checkbox" checked={contactsSel.includes(c.id)} onChange={() => toggleContact(c.id)} className="accent-ockham-teal" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800">{[c.prenom, c.nom].filter(Boolean).join(' ')}</p>
                          <p className="text-[10px] text-ockham-teal truncate">{c.email}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Factures */}
              <div>
                <label className="block text-[11px] font-bold text-ockham-teal uppercase tracking-wider mb-2"><span className="text-ockham-navy dark:text-white/40 mr-1">2 —</span>Factures à inclure</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {impayees.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucune facture impayée</p>
                  ) : impayees.map(f => {
                    const j = f.date_echeance ? joursDepuis(f.date_echeance) : 0
                    return (
                      <label key={f.numero_piece} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${facturesSel.includes(f.numero_piece) ? 'border-ockham-teal/40 bg-ockham-teal-muted' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="checkbox" checked={facturesSel.includes(f.numero_piece)} onChange={() => toggleFacture(f.numero_piece)} className="accent-ockham-teal" />
                        {f.axonaut_pdf_url ? (
                          <a
                            href={f.axonaut_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title="Voir le PDF"
                            className="font-mono text-[11px] text-ockham-teal hover:underline flex-1 truncate"
                          >{f.numero_piece} ↗</a>
                        ) : (
                          <NumeroPiece numero={f.numero_piece} className="font-mono text-[11px] text-gray-600 flex-1" />
                        )}
                        {commentaires?.has(f.numero_piece) && (
                          <span
                            className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-ockham-teal-muted text-ockham-teal border border-ockham-teal/30 cursor-default"
                            onMouseEnter={e => {
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              setTooltip({ x: r.left + r.width / 2, y: r.top, numero: f.numero_piece })
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >?</span>
                        )}
                        <span className="text-[11px] font-bold text-gray-700 tabular-nums">{fmtEuros(f.reste_du)}</span>
                        <span className={`text-[10px] font-bold px-1.5 rounded ${j > 90 ? 'bg-red-100 text-red-700' : j > 60 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{j}j</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Scénario */}
              <div>
                <label className="block text-[11px] font-bold text-ockham-teal uppercase tracking-wider mb-2"><span className="text-ockham-navy dark:text-white/40 mr-1">3 —</span>Scénario</label>
                <select
                  value={scenarioId}
                  onChange={e => appliquerScenario(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal cursor-pointer"
                >
                  {!scenarioId && <option value="">— Choisir un scénario</option>}
                  {scenarios.map(s => (
                    <option key={s.id} value={s.id}>Niveau {s.niveau} — {s.nom}</option>
                  ))}
                </select>
                {scenarios.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">Aucun scénario configuré — ajoutez-en depuis Mon compte → Scénarios de relance</p>
                )}
              </div>
            </div>

            {/* Colonne droite : rédiger + aperçu */}
            <div className="w-3/5 flex flex-col overflow-hidden">
              {/* Onglets */}
              <div className="flex border-b border-gray-100 px-5 pt-4 flex-shrink-0 gap-4">
                {(['rediger', 'apercu'] as const).map(o => (
                  <button
                    key={o}
                    onClick={() => setOnglet(o)}
                    className={`pb-2 text-[11px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
                      onglet === o ? 'border-ockham-teal text-ockham-teal' : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {o === 'rediger' ? 'Rédiger' : 'Aperçu email'}
                  </button>
                ))}
              </div>

              {onglet === 'rediger' ? (
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Objet</label>
                    <input value={objet} onChange={e => setObjet(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Corps du message</label>
                    <textarea
                      value={corps}
                      onChange={e => setCorps(e.target.value)}
                      rows={16}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-ockham-teal resize-none font-sans leading-relaxed"
                    />
                    <p className="text-[10px] text-gray-300 mt-1">[Tableau Factures] sera remplacé par le tableau des factures sélectionnées lors de l'envoi</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <div className="border border-gray-200 rounded-xl overflow-hidden text-sm">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 space-y-1">
                      {estConnecte && (
                        <p className="text-xs"><span className="text-gray-400 font-medium w-8 inline-block">De :</span> <span className="text-emerald-600">{gmailToken?.gmail_email}</span></p>
                      )}
                      <p className="text-xs"><span className="text-gray-400 font-medium w-8 inline-block">À :</span> <span className="text-gray-700">{sanContacts ? (emailFallback || '—') : contactsAvecEmail.filter(c => contactsSel.includes(c.id)).map(c => c.email).join(', ') || '—'}</span></p>
                      <p className="text-xs"><span className="text-gray-400 font-medium w-8 inline-block">Obj :</span> <span className="font-semibold text-gray-800">{objet || '—'}</span></p>
                    </div>
                    <div className="px-4 py-4 text-gray-700 text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                  <p className="text-[10px] text-gray-300 mt-3 text-center">{estConnecte ? `Envoyé depuis ${gmailToken?.gmail_email}` : 'Connectez Gmail pour envoyer automatiquement'}</p>
                </div>
              )}</div>
          </div>

          {/* Tooltip commentaire — fixed, hors de tout overflow */}
          {tooltip && commentaires?.has(tooltip.numero) && (() => {
            const com = commentaires.get(tooltip.numero)!
            return (
              <div
                className="pointer-events-none fixed z-[9999] w-60"
                style={{ left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)' }}
              >
                <div className="bg-slate-800 border border-slate-600 text-white rounded-xl shadow-2xl px-3.5 py-3 text-[11px] leading-relaxed">
                  {com.commentaire && <p className="mb-1.5 text-white">{com.commentaire}</p>}
                  {com.contact && <p className="text-slate-400">👤 {com.contact}</p>}
                  {com.date_contact && <p className="text-slate-400">📅 {new Date(com.date_contact).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
                  {com.operateur && <p className="text-slate-500 mt-1.5 border-t border-slate-600 pt-1.5">par {com.operateur}</p>}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-600" />
                </div>
              </div>
            )
          })()}

          {/* Footer */}
          <div className="flex gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button onClick={onFermer} className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 transition-colors">Annuler</button>
            <button onClick={handleEnvoyer} disabled={!peutEnvoyer} className="flex-[2] flex items-center justify-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
              {envoi ? '…' : estConnecte ? '✉ Envoyer via Gmail (+10 pts)' : '✉ Enregistrer la relance (+10 pts)'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
