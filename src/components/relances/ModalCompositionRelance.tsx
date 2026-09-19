import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useContacts } from '../../hooks/useContacts'
import { useAppData } from '../../contexts/AppDataContext'
import { useRole } from '../../contexts/RoleContext'
import { ModalParametresRelances } from '../admin/ModalParametresRelances'
import type { GmailToken } from '../../hooks/useGmailAuth'
import type { CompteClient, CommentaireFacture } from '../../types/client'
import { NumeroPiece } from '../NumeroPiece'
import { buildHtml, buildHtmlFromScenario, resolveBalises, fmtEuros, joursDepuis } from '../../lib/relanceEmail'

interface GmailAuthProps {
  estConnecte: boolean
  provider?: 'gmail' | 'outlook'
  token: GmailToken | null
  connecterGmail: () => void
  envoyerEmail: (p: { destinataires: string[]; objet: string; corpsHtml: string; cc?: string[] }) => Promise<{ threadId: string } | null>
  recupererSignature: () => Promise<string | null>
}

interface Props {
  client: CompteClient | null
  onFermer: () => void
  onSent: () => void
  gmailAuth: GmailAuthProps
  commentaires?: Map<string, CommentaireFacture>
  onOuvrirContacts?: () => void
}

export function ModalCompositionRelance({ client, onFermer, onSent, gmailAuth, commentaires, onOuvrirContacts }: Props) {
  const { utilisateur } = useAuth()
  const { peutModifier } = useRole()
  const { contacts, ajouter: ajouterContact } = useContacts(client?.code_dso ?? null)
  const { facturesActives, scenarios, membresOrg } = useAppData()
  const [scenariosOuvert, setScenariosOuvert] = useState(false)
  const [dropdownOuvert, setDropdownOuvert] = useState(false)
  const colonneGaucheRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (dropdownOuvert && colonneGaucheRef.current) {
      const el = colonneGaucheRef.current
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [dropdownOuvert])
  const { estConnecte, provider = 'gmail', token: gmailToken, envoyerEmail, recupererSignature } = gmailAuth
  const nomProvider = provider === 'outlook' ? 'Outlook' : 'Gmail'

  const impayees = facturesActives.filter(f =>
    f.code_client === client?.code_dso &&
    Math.abs(f.reste_du) > 0.005 &&
    !commentaires?.get(f.numero_piece)?.ne_pas_relancer
  )

  const [contactsSel, setContactsSel] = useState<string[]>([])
  const [operateursSel, setOperateursSel] = useState<string[]>([])
  const [facturesSel, setFacturesSel] = useState<string[]>([])
  const [scenarioId, setScenarioId] = useState<string>('')
  const [emailFallback, setEmailFallback] = useState('')
  const [prenomFallback, setPrenomFallback] = useState('')
  const [nomFallback, setNomFallback] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; numero: string } | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [signaturePanelOuvert, setSignaturePanelOuvert] = useState(false)
  const [signatureEdition, setSignatureEdition] = useState('')
  const [signatureApercu, setSignatureApercu] = useState(false)
  const [sauvegarde, setSauvegarde] = useState(false)
  const [emailCommercial, setEmailCommercial] = useState<string | null>(null)
  const [ccCommercial, setCcCommercial] = useState(false)

  useEffect(() => {
    if (estConnecte) recupererSignature().then(sig => { setSignature(sig); setSignatureEdition(sig ?? '') })
  }, [estConnecte])

  useEffect(() => {
    setEmailCommercial(null)
    setCcCommercial(false)
    if (!client?.commercial_id) return
    supabase.from('utilisateurs').select('email').eq('id', client.commercial_id).maybeSingle()
      .then(({ data }) => setEmailCommercial((data as { email: string } | null)?.email ?? null))
  }, [client?.commercial_id])

  useEffect(() => {
    if (!client) return
    setFacturesSel(impayees.map(f => f.numero_piece))
    setContactsSel(contacts.filter(c => c.email).map(c => c.id))
  }, [client?.code_dso, contacts.length, impayees.length])

  // Sélectionne le scénario niveau 1 externe par défaut
  useEffect(() => {
    if (!client || !scenarios.length || scenarioId) return
    const defaut = scenarios.find(s => s.niveau === 1 && s.type === 'externe') ?? scenarios.find(s => s.type === 'externe') ?? scenarios[0]
    setScenarioId(defaut.id)
  }, [scenarios.length, client?.code_dso])

  // Pré-sélectionne le commercial quand on bascule en mode interne
  useEffect(() => {
    const sc = scenarios.find(s => s.id === scenarioId)
    if (!sc || sc.type !== 'interne') { setOperateursSel([]); return }
    setOperateursSel(client?.commercial_id ? [client.commercial_id] : [])
  }, [scenarioId, scenarios, client?.commercial_id])

  if (!client) return null

  const contactsAvecEmail = contacts.filter(c => c.email)
  const sanContacts = contactsAvecEmail.length === 0

  // Valeurs calculées en direct — se mettent à jour à chaque changement de scénario ou de sélection
  const scenarioCourant = scenarios.find(s => s.id === scenarioId) ?? null
  const estInterne = scenarioCourant?.type === 'interne'
  const membresAvecEmail = membresOrg.filter(m => m.email)
  const facturesSélectionnées = impayees.filter(f => facturesSel.includes(f.numero_piece))
  const montantDu = facturesSélectionnées.reduce((s, f) => s + f.reste_du, 0)
  const ctx = { nomClient: client.nom, codeClient: client.code_dso, montantDu }

  const objetFinal = scenarioCourant ? resolveBalises(scenarioCourant.objet, ctx) : ''
  const corpsResolu = scenarioCourant ? resolveBalises(scenarioCourant.corps_texte, ctx) : ''

  const lignesFactures = facturesSélectionnées.map(f => ({
    numero: f.numero_piece, montantTtc: f.montant_ttc, restedu: f.reste_du,
    echeance: f.date_echeance, pdfUrl: f.axonaut_pdf_url,
  }))

  const previewHtml = corpsResolu
    ? corpsResolu.includes('[Tableau Factures]')
      ? buildHtmlFromScenario(corpsResolu, lignesFactures, signature)
      : buildHtml(lignesFactures, signature)
    : buildHtml(lignesFactures, signature)

  function toggleContact(id: string) {
    setContactsSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleFacture(num: string) {
    setFacturesSel(prev => prev.includes(num) ? prev.filter(x => x !== num) : [...prev, num])
  }

  const peutEnvoyer = !envoi && !!objetFinal.trim() && facturesSel.length > 0 &&
    (estInterne
      ? operateursSel.length > 0
      : (sanContacts ? !!emailFallback.trim() && !!nomFallback.trim() : contactsSel.length > 0)
    )

  async function handleEnvoyer() {
    if (!utilisateur || !peutEnvoyer) return
    setEnvoi(true)

    let gmailThreadId: string | undefined

    if (estInterne) {
      // Mode interne : envoi aux opérateurs sélectionnés
      if (estConnecte) {
        const destinataires = membresAvecEmail.filter(m => operateursSel.includes(m.id)).map(m => m.email).filter(Boolean)
        if (destinataires.length > 0) {
          const res = await envoyerEmail({ destinataires, objet: objetFinal.trim(), corpsHtml: previewHtml })
          if (!res) { toast.error(`Échec de l'envoi ${nomProvider}`); setEnvoi(false); return }
          gmailThreadId = res.threadId
        }
      }
      const operateursSnapshot = membresAvecEmail.filter(m => operateursSel.includes(m.id)).map(m => ({
        id: m.id, nom: m.nom, prenom: m.prenom ?? null, email: m.email, role_contact: null,
      }))
      const payload: Record<string, unknown> = {
        code_client:        client!.code_dso,
        operateur_id:       utilisateur.id,
        contacts_ids:       [],
        contacts_snapshot:  operateursSnapshot,
        factures_ids:       facturesSel,
        objet:              objetFinal.trim(),
        corps_html:         previewHtml,
        statut:             'envoyee',
        type:               'interne',
        envoyee_le:         new Date().toISOString(),
        points_attribues:   0,
        solde_snapshot:     montantDu,
        factures_snapshot:  facturesSélectionnées.map(f => ({ numero_piece: f.numero_piece, reste_du: f.reste_du })),
      }
      if (gmailThreadId) payload.gmail_thread_id = gmailThreadId
      const { error } = await supabase.from('relances').insert(payload as never)
      setEnvoi(false)
      if (error) { toast.error('Erreur lors de l\'enregistrement'); return }
      toast.success(estConnecte ? '✉ Notification envoyée' : 'Notification enregistrée')
      onSent()
      onFermer()
      return
    }

    // Mode externe (comportement inchangé)
    let cIds = contactsSel
    if (sanContacts && emailFallback.trim()) {
      const ok = await ajouterContact({ nom: nomFallback.trim(), prenom: prenomFallback.trim() || null, email: emailFallback.trim(), telephone: null, role_contact: 'relance' })
      if (!ok) { setEnvoi(false); return }
      cIds = []
    }

    if (estConnecte) {
      const destinataires = sanContacts
        ? [emailFallback.trim()]
        : contactsAvecEmail.filter(c => contactsSel.includes(c.id)).map(c => c.email!).filter(Boolean)
      const res = await envoyerEmail({
        destinataires,
        objet: objetFinal.trim(),
        corpsHtml: previewHtml,
        ...(ccCommercial && emailCommercial ? { cc: [emailCommercial] } : {}),
      })
      if (!res) { toast.error(`Échec de l'envoi ${nomProvider}`); setEnvoi(false); return }
      gmailThreadId = res.threadId
    }

    const contactsSnapshot = sanContacts
      ? [{ id: '', nom: nomFallback.trim(), prenom: prenomFallback.trim() || null, email: emailFallback.trim(), role_contact: null }]
      : contactsAvecEmail.filter(c => contactsSel.includes(c.id)).map(c => ({ id: c.id, nom: c.nom, prenom: c.prenom ?? null, email: c.email, role_contact: c.role_contact ?? null }))

    const payload: Record<string, unknown> = {
      code_client:        client!.code_dso,
      operateur_id:       utilisateur.id,
      contacts_ids:       cIds,
      contacts_snapshot:  contactsSnapshot,
      factures_ids:       facturesSel,
      objet:              objetFinal.trim(),
      corps_html:         previewHtml,
      statut:             'envoyee',
      type:               'externe',
      envoyee_le:         new Date().toISOString(),
      points_attribues:   10,
      solde_snapshot:     montantDu,
      factures_snapshot:  facturesSélectionnées.map(f => ({ numero_piece: f.numero_piece, reste_du: f.reste_du })),
    }
    if (gmailThreadId) payload.gmail_thread_id = gmailThreadId

    const { error } = await supabase.from('relances').insert(payload as never)
    setEnvoi(false)
    if (error) { toast.error('Erreur lors de l\'enregistrement'); return }
    toast.success(estConnecte ? '✉ Envoyé · +10 pts' : '+10 pts · Relance enregistrée')
    onSent()
    onFermer()
  }

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
              <p className="text-sm font-bold text-white">
                {estInterne ? 'Notification interne — ' : 'Nouvelle relance — '}
                <span className="text-ockham-teal">{client.nom}</span>
                {estInterne && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1E3A5F', color: '#93C5FD', border: '1px solid #3B82F6' }}>INTERNE</span>}
              </p>
              <p className="text-xs text-white/50 mt-0.5 font-mono">{client.code_dso} · {impayees.length} facture{impayees.length > 1 ? 's' : ''} impayée{impayees.length > 1 ? 's' : ''} · {fmtEuros(client.encours_total)}</p>
            </div>
            <button onClick={onFermer} className="w-7 h-7 rounded-full border border-white/20 text-white/60 hover:bg-white/10 hover:text-white text-sm flex items-center justify-center transition-colors">✕</button>
          </div>

          {/* Corps — 2 colonnes */}
          <div className="flex-1 overflow-hidden flex min-h-0">

            {/* Colonne gauche */}
            <div ref={colonneGaucheRef} className="w-2/5 border-r border-gray-100 overflow-y-auto px-5 py-4 space-y-4">

              {estConnecte ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-emerald-600 text-sm flex-shrink-0">✓</span>
                      <p className="text-xs text-emerald-700 truncate">Envoi depuis <span className="font-semibold">{nomProvider}</span> <span className="text-emerald-600 font-mono">({gmailToken?.gmail_email})</span></p>
                    </div>
                    {provider === 'outlook' && (
                      <button
                        onClick={() => setSignaturePanelOuvert(v => !v)}
                        className={`text-[10px] font-semibold px-2 py-1 rounded-md border flex-shrink-0 transition-colors ${
                          signature ? 'text-emerald-700 border-emerald-300 bg-emerald-100' : 'text-gray-500 border-gray-300 hover:border-gray-400 bg-white'
                        }`}
                      >
                        {signature ? '✓ Signature' : '+ Signature'}
                      </button>
                    )}
                  </div>

                  {provider === 'outlook' && signaturePanelOuvert && (
                    <div className="mt-2 pt-2 border-t border-emerald-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Signature HTML</p>
                        <button onClick={() => setSignatureApercu(v => !v)} className="text-[10px] text-ockham-teal hover:underline">
                          {signatureApercu ? 'Éditer' : 'Aperçu'}
                        </button>
                      </div>
                      {signatureApercu ? (
                        <div className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white min-h-[60px]" dangerouslySetInnerHTML={{ __html: signatureEdition }} />
                      ) : (
                        <textarea
                          value={signatureEdition}
                          onChange={e => setSignatureEdition(e.target.value)}
                          placeholder="Collez votre signature HTML ici…"
                          className="w-full text-[11px] font-mono border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-ockham-teal resize-none h-20"
                        />
                      )}
                      <button
                        onClick={async () => {
                          if (!utilisateur?.id) return
                          setSauvegarde(true)
                          await supabase.from('utilisateurs' as never).update({ signature_email: signatureEdition || null } as never).eq('id', utilisateur.id)
                          setSignature(signatureEdition || null)
                          setSauvegarde(false)
                          toast.success('Signature enregistrée')
                          setSignaturePanelOuvert(false)
                        }}
                        className="w-full text-[11px] font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {sauvegarde ? '…' : 'Enregistrer'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">Aucune boite mail connectée — la relance sera enregistrée sans envoi</p>
                  <button
                    onClick={() => { onFermer(); window.dispatchEvent(new CustomEvent('ockham:ouvrir-integrations')) }}
                    className="text-xs font-semibold text-ockham-teal hover:underline ml-3 flex-shrink-0"
                  >
                    → Intégrations
                  </button>
                </div>
              )}

              {/* 1 — Destinataires */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-ockham-teal uppercase tracking-wider">
                    <span className="text-ockham-navy/40 mr-1">1 —</span>
                    {estInterne ? 'Opérateurs à notifier' : 'Destinataires'}
                  </label>
                  {!estInterne && peutModifier && onOuvrirContacts && (
                    <button onClick={onOuvrirContacts} className="text-[10px] font-semibold text-gray-400 hover:text-ockham-teal transition-colors">
                      Gérer les contacts ↗
                    </button>
                  )}
                </div>

                {estInterne ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {membresAvecEmail.length === 0 ? (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Aucun opérateur disponible.</p>
                    ) : membresAvecEmail.map(m => (
                      <label key={m.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${operateursSel.includes(m.id) ? 'bg-blue-50 border-blue-300' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="checkbox" checked={operateursSel.includes(m.id)} onChange={() => setOperateursSel(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])} style={{ accentColor: '#3B82F6' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                            {[m.prenom, m.nom].filter(Boolean).join(' ')}
                            {m.id === client.commercial_id && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#FEF3C7', color: '#D97706' }}>Commercial</span>
                            )}
                          </p>
                          <p className="text-[10px] text-blue-500 truncate">{m.email}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <>
                    {sanContacts ? (
                      <div className="space-y-2">
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Aucun contact pour ce client. Renseignez un email pour envoyer et l'enregistrer.</p>
                        <div className="flex gap-2">
                          <input value={prenomFallback} onChange={e => setPrenomFallback(e.target.value)} placeholder="Prénom" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal" />
                          <input value={nomFallback} onChange={e => setNomFallback(e.target.value)} placeholder="Nom *" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal" />
                        </div>
                        <input type="email" value={emailFallback} onChange={e => setEmailFallback(e.target.value)} placeholder="Email *" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal" />
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
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
                    {emailCommercial && (
                      <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors mt-1.5 ${ccCommercial ? 'border-amber-400/60 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="checkbox" checked={ccCommercial} onChange={() => setCcCommercial(v => !v)} className="accent-amber-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800">
                            {client.commercial}
                            <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#FEF3C7', color: '#D97706' }}>Commercial · CC</span>
                          </p>
                          <p className="text-[10px] truncate" style={{ color: '#D97706' }}>{emailCommercial}</p>
                        </div>
                      </label>
                    )}
                  </>
                )}
              </div>

              {/* 2 — Factures */}
              <div>
                <label className="block text-[11px] font-bold text-ockham-teal uppercase tracking-wider mb-2"><span className="text-ockham-navy/40 mr-1">2 —</span>Factures à inclure</label>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                  {impayees.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucune pièce à inclure</p>
                  ) : impayees.map(f => {
                    const estCredit = f.reste_du < 0
                    const j = !estCredit && f.date_echeance ? joursDepuis(f.date_echeance) : 0
                    const is411 = f.numero_piece.startsWith('411_')
                    return (
                      <label key={f.numero_piece} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${facturesSel.includes(f.numero_piece) ? 'border-ockham-teal/40 bg-ockham-teal-muted' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="checkbox" checked={facturesSel.includes(f.numero_piece)} onChange={() => toggleFacture(f.numero_piece)} className="accent-ockham-teal" />
                        {f.axonaut_pdf_url ? (
                          <a href={f.axonaut_pdf_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="font-mono text-[11px] text-ockham-teal hover:underline flex-1 truncate">{f.numero_piece} ↗</a>
                        ) : (
                          <NumeroPiece numero={f.numero_piece} className="font-mono text-[11px] text-gray-600 flex-1" />
                        )}
                        {is411 && <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-200">411</span>}
                        {f.est_avoir && <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Avoir</span>}
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
                        <span className={`text-[11px] font-bold tabular-nums ${estCredit ? 'text-emerald-600' : 'text-gray-700'}`}>{fmtEuros(f.reste_du)}</span>
                        {!estCredit && <span className={`text-[10px] font-bold px-1.5 rounded ${j > 90 ? 'bg-red-100 text-red-700' : j > 60 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{j}j</span>}
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* 3 — Scénario */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-ockham-teal uppercase tracking-wider"><span className="text-ockham-navy/40 mr-1">3 —</span>Scénario</label>
                  {peutModifier && (
                    <button
                      onClick={() => setScenariosOuvert(true)}
                      className="text-[10px] font-semibold text-gray-400 hover:text-ockham-teal transition-colors"
                    >
                      Gérer ↗
                    </button>
                  )}
                </div>
                {scenarios.length > 0 ? (() => {
                  const externes = scenarios.filter(s => s.type === 'externe').sort((a, b) => a.niveau - b.niveau || a.nom.localeCompare(b.nom))
                  const internes = scenarios.filter(s => s.type === 'interne').sort((a, b) => a.niveau - b.niveau || a.nom.localeCompare(b.nom))
                  const selScenario = scenarios.find(s => s.id === scenarioId) ?? null
                  return (
                    <div className="relative">
                      {/* Bouton déclencheur */}
                      <button
                        type="button"
                        onClick={() => setDropdownOuvert(v => !v)}
                        className="w-full flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white hover:border-gray-300 transition-colors outline-none focus:border-ockham-teal"
                      >
                        {selScenario ? (
                          <span className="flex items-center gap-2 min-w-0">
                            <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${selScenario.type === 'interne' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-ockham-teal-muted text-ockham-teal border border-ockham-teal/20'}`}>
                              {selScenario.type === 'interne' ? 'INT' : 'EXT'}
                            </span>
                            <span className="truncate text-gray-700">{selScenario.type === 'externe' ? `Niveau ${selScenario.niveau} — ` : ''}{selScenario.nom}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">— Choisir un scénario</span>
                        )}
                        <svg className={`flex-shrink-0 w-3.5 h-3.5 text-gray-400 transition-transform ${dropdownOuvert ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 4l4 4 4-4"/>
                        </svg>
                      </button>

                      {/* Liste déroulante inline — pousse le contenu vers le bas */}
                      {dropdownOuvert && (
                        <>
                          <div className="fixed inset-0 z-[10]" onClick={() => setDropdownOuvert(false)} />
                          <div className="relative z-[11] mt-1.5 bg-white border border-gray-200 rounded-xl shadow-sm py-1">
                            {externes.map(s => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => { setScenarioId(s.id); setDropdownOuvert(false) }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-gray-50 ${scenarioId === s.id ? 'bg-ockham-teal-muted' : ''}`}
                              >
                                <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-ockham-teal-muted text-ockham-teal border border-ockham-teal/20">EXT</span>
                                <span className={`truncate ${scenarioId === s.id ? 'font-semibold text-ockham-teal' : 'text-gray-700'}`}>Niveau {s.niveau} — {s.nom}</span>
                              </button>
                            ))}
                            {internes.length > 0 && (
                              <>
                                <div className="mx-3 my-1 border-t border-gray-100" />
                                {internes.map(s => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => { setScenarioId(s.id); setDropdownOuvert(false) }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${scenarioId === s.id ? 'bg-blue-50' : 'bg-blue-50/30 hover:bg-blue-50/60'}`}
                                  >
                                    <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">INT</span>
                                    <span className={`truncate ${scenarioId === s.id ? 'font-semibold text-blue-700' : 'text-gray-600'}`}>{s.nom}</span>
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })() : (
                  <p className="text-[11px] text-amber-600">
                    Aucun scénario configuré
                    {peutModifier && <> — <button onClick={() => setScenariosOuvert(true)} className="underline">créer un scénario</button></>}
                  </p>
                )}
              </div>
            </div>

            {/* Colonne droite — aperçu live en lecture seule */}
            <div className="w-3/5 flex flex-col overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex-shrink-0">
                <p className="text-[11px] font-bold text-ockham-teal uppercase tracking-wider">Aperçu email</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-4">
                <div className="border border-gray-200 rounded-xl overflow-hidden text-sm">
                  {/* En-tête simulé */}
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 space-y-1">
                    {estConnecte && (
                      <p className="text-xs"><span className="text-gray-400 font-medium w-8 inline-block">De :</span> <span className="text-emerald-600">{gmailToken?.gmail_email}</span> <span className="text-gray-400">({nomProvider})</span></p>
                    )}
                    <p className="text-xs"><span className="text-gray-400 font-medium w-8 inline-block">À :</span> <span className="text-gray-700">{estInterne ? (membresAvecEmail.filter(m => operateursSel.includes(m.id)).map(m => m.email).join(', ') || '—') : (sanContacts ? (emailFallback || '—') : contactsAvecEmail.filter(c => contactsSel.includes(c.id)).map(c => c.email).join(', ') || '—')}</span></p>
                    {ccCommercial && emailCommercial && (
                      <p className="text-xs"><span className="text-gray-400 font-medium w-8 inline-block">Cc :</span> <span style={{ color: '#D97706' }}>{emailCommercial}</span></p>
                    )}
                    <p className="text-xs"><span className="text-gray-400 font-medium w-8 inline-block">Obj :</span> <span className="font-semibold text-gray-800">{objetFinal || '—'}</span></p>
                  </div>
                  {/* Corps HTML rendu */}
                  <div className="px-4 py-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
                <p className="text-[10px] text-gray-300 mt-3 text-center">
                  {estConnecte ? `Envoi depuis ${nomProvider} (${gmailToken?.gmail_email})` : 'Connectez votre boite mail pour envoyer automatiquement'}
                </p>
              </div>
            </div>
          </div>

          {/* Tooltip commentaire */}
          {tooltip && commentaires?.has(tooltip.numero) && (() => {
            const com = commentaires.get(tooltip.numero)!
            return (
              <div className="pointer-events-none fixed z-[9999] w-60" style={{ left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)' }}>
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
            <button
              onClick={handleEnvoyer}
              disabled={!peutEnvoyer}
              className={`flex-[2] flex items-center justify-center gap-2 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors ${estInterne ? 'bg-blue-500 hover:bg-blue-600' : 'bg-ockham-teal hover:bg-ockham-teal-dark'}`}
            >
              {envoi ? '…' : estInterne
                ? (estConnecte ? `✉ Notifier en interne via ${nomProvider}` : '✉ Enregistrer la notification')
                : (estConnecte ? `✉ Envoyer via ${nomProvider} (+10 pts)` : '✉ Enregistrer la relance (+10 pts)')}
            </button>
          </div>
        </div>
      </div>
      {scenariosOuvert && <ModalParametresRelances onClose={() => setScenariosOuvert(false)} ongletInitial="scenarios" />}
    </>
  )
}
