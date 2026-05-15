import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useContacts } from '../../hooks/useContacts'
import { useAppData } from '../../contexts/AppDataContext'
import type { GmailToken } from '../../hooks/useGmailAuth'
import type { CompteClient } from '../../types/client'
import { NumeroPiece } from '../NumeroPiece'

function fmtEuros(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}
function joursDepuis(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function buildCorps(factures: { numero: string; montant: number; echeance: string | null }[]) {
  const lignes = factures.map(f =>
    `  • Facture ${f.numero} — ${fmtEuros(f.montant)}${f.echeance ? ` — échéance le ${fmtDate(f.echeance)}` : ''}`
  ).join('\n')
  return `Bonjour,\n\nNous nous permettons de vous contacter au sujet des factures suivantes en attente de règlement :\n\n${lignes}\n\nNous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais, ou de nous contacter en cas de question ou de litige.\n\nCordialement`
}

interface GmailAuthProps {
  estConnecte: boolean
  token: GmailToken | null
  connecterGmail: () => void
  envoyerEmail: (p: { destinataires: string[]; objet: string; corpsHtml: string }) => Promise<{ threadId: string } | null>
}

interface Props {
  client: CompteClient | null
  onFermer: () => void
  onSent: () => void
  gmailAuth: GmailAuthProps
}

export function ModalCompositionRelance({ client, onFermer, onSent, gmailAuth }: Props) {
  const { utilisateur } = useAuth()
  const { contacts, ajouter: ajouterContact } = useContacts(client?.code_dso ?? null)
  const { facturesActives } = useAppData()
  const { estConnecte, token: gmailToken, connecterGmail, envoyerEmail } = gmailAuth

  const impayees = facturesActives.filter(f => f.code_client === client?.code_dso && f.reste_du > 0.005)

  const [contactsSel, setContactsSel] = useState<string[]>([])
  const [facturesSel, setFacturesSel] = useState<string[]>([])
  const [objet, setObjet] = useState('')
  const [corps, setCorps] = useState('')
  const [emailFallback, setEmailFallback] = useState('')
  const [nomFallback, setNomFallback] = useState('')
  const [envoi, setEnvoi] = useState(false)

  // Initialisation dès qu'on a les contacts et factures
  useEffect(() => {
    if (!client) return
    const toutesIds = impayees.map(f => f.numero_piece)
    setFacturesSel(toutesIds)
    setContactsSel(contacts.filter(c => c.email).map(c => c.id))
    setObjet(`Relance factures impayées — ${client.nom}`)
    setCorps(buildCorps(impayees.map(f => ({ numero: f.numero_piece, montant: f.reste_du, echeance: f.date_echeance }))))
  }, [client?.code_dso, contacts.length, impayees.length])

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
    const newSel = facturesSel.includes(num) ? facturesSel.filter(x => x !== num) : [...facturesSel, num]
    const sel = impayees.filter(f => newSel.includes(f.numero_piece))
    setCorps(buildCorps(sel.map(f => ({ numero: f.numero_piece, montant: f.reste_du, echeance: f.date_echeance }))))
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
      const res = await envoyerEmail({
        destinataires,
        objet:     objet.trim(),
        corpsHtml: corps.replace(/\n/g, '<br>'),
      })
      if (!res) { toast.error('Échec de l\'envoi Gmail'); setEnvoi(false); return }
      gmailThreadId = res.threadId
    }

    const payload: Record<string, unknown> = {
      code_client:      codeClient,
      operateur_id:     utilisateur.id,
      contacts_ids:     cIds,
      factures_ids:     facturesSel,
      objet:            objet.trim(),
      corps_html:       corps.replace(/\n/g, '<br>'),
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

  const previewHtml = corps.replace(/\n/g, '<br>')

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onFermer} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <p className="text-sm font-bold text-gray-900">Nouvelle relance — <span className="text-ockham-teal">{nomClient}</span></p>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">{codeClient} · {impayees.length} facture{impayees.length > 1 ? 's' : ''} impayée{impayees.length > 1 ? 's' : ''} · {fmtEuros(client.encours_total)}</p>
            </div>
            <button onClick={onFermer} className="w-7 h-7 rounded-full border border-gray-200 text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-sm flex items-center justify-center transition-colors">✕</button>
          </div>

          {/* Corps — 2 colonnes */}
          <div className="flex-1 overflow-hidden flex min-h-0">

            {/* Colonne gauche : formulaire */}
            <div className="w-1/2 border-r border-gray-100 overflow-y-auto px-5 py-4 space-y-5">

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
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Destinataires</label>
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
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Factures à inclure</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {impayees.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucune facture impayée</p>
                  ) : impayees.map(f => {
                    const j = f.date_echeance ? joursDepuis(f.date_echeance) : 0
                    return (
                      <label key={f.numero_piece} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${facturesSel.includes(f.numero_piece) ? 'border-ockham-teal/40 bg-ockham-teal-muted' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="checkbox" checked={facturesSel.includes(f.numero_piece)} onChange={() => toggleFacture(f.numero_piece)} className="accent-ockham-teal" />
                        <NumeroPiece numero={f.numero_piece} className="font-mono text-[11px] text-gray-600 flex-1" />
                        <span className="text-[11px] font-bold text-gray-700 tabular-nums">{fmtEuros(f.reste_du)}</span>
                        <span className={`text-[10px] font-bold px-1.5 rounded ${j > 90 ? 'bg-red-100 text-red-700' : j > 60 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{j}j</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Objet */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Objet</label>
                <input value={objet} onChange={e => setObjet(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal" />
              </div>

              {/* Corps */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Message</label>
                <textarea value={corps} onChange={e => setCorps(e.target.value)} rows={10} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal resize-none font-sans" />
              </div>
            </div>

            {/* Colonne droite : aperçu */}
            <div className="w-1/2 overflow-y-auto px-5 py-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Aperçu email</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden text-sm">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 space-y-1">
                  {estConnecte && (
                    <p className="text-xs"><span className="text-gray-400 font-medium w-8 inline-block">De :</span> <span className="text-emerald-600">{gmailToken?.gmail_email}</span></p>
                  )}
                  <p className="text-xs"><span className="text-gray-400 font-medium w-8 inline-block">À :</span> <span className="text-gray-700">{sanContacts ? (emailFallback || '—') : contactsAvecEmail.filter(c => contactsSel.includes(c.id)).map(c => c.email).join(', ') || '—'}</span></p>
                  <p className="text-xs"><span className="text-gray-400 font-medium w-8 inline-block">Obj :</span> <span className="font-semibold text-gray-800">{objet || '—'}</span></p>
                </div>
                <div
                  className="px-4 py-4 text-gray-700 text-[13px] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
              <p className="text-[10px] text-gray-300 mt-3 text-center">{estConnecte ? `Envoyé depuis ${gmailToken?.gmail_email}` : 'Connectez Gmail pour envoyer automatiquement'}</p>
            </div>
          </div>

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
