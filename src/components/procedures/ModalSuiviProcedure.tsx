import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { ModalBase } from '../admin/ModalBase'
import { IcFileText } from '../Icones'
import toast from 'react-hot-toast'
import type { ProcedureLigne } from '../../hooks/useProcedures'

const STATUT: Record<string, { label: string; badge: string }> = {
  liquidation:  { label: 'Liquidation judiciaire',  badge: 'bg-red-50 text-red-700 border-red-200' },
  redressement: { label: 'Redressement judiciaire', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  sauvegarde:   { label: 'Sauvegarde',              badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  cloture:      { label: 'Clôture',                 badge: 'bg-gray-50 text-gray-500 border-gray-200' },
  radiation:    { label: 'Radiation',               badge: 'bg-gray-50 text-gray-500 border-gray-200' },
}

const fmtEuros = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

interface DeclarationRow {
  id: string
  statut: string
  montant_creancier: number | null
  date_declaration: string | null
  reference_dossier: string | null
  contact_mandataire: string | null
  contact_mandataire_nom: string | null
  notes_interne: string | null
}

interface FactureLigne {
  numero_piece: string
  montant_ttc: number
  reste_du: number
  date_echeance: string | null
}

interface Props {
  ligne: ProcedureLigne
  onClose: () => void
  onDeclarationSaved: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export function ModalSuiviProcedure({ ligne, onClose, onDeclarationSaved }: Props) {
  const [declaration, setDeclaration]   = useState<DeclarationRow | null>(null)
  const [factures, setFactures]         = useState<FactureLigne[]>([])
  const [chargement, setChargement]     = useState(true)
  const [statut, setStatut]             = useState('brouillon')
  const [dateDeclaration, setDateDeclaration] = useState('')
  const [montant, setMontant]           = useState('')
  const [refDossier, setRefDossier]     = useState('')
  const [contactNom, setContactNom]     = useState('')
  const [contactCoord, setContactCoord] = useState('')
  const [notesInterne, setNotesInterne] = useState('')
  const [sauvegarde, setSauvegarde]     = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  // Auto-expand textarea à chaque modification des notes (y compris chargement initial)
  useEffect(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [notesInterne])

  useEffect(() => {
    let annule = false
    async function charger() {
      setChargement(true)
      const [declRes, factRes] = await Promise.all([
        db
          .from('declarations_creances')
          .select('id, statut, montant_creancier, date_declaration, reference_dossier, contact_mandataire, contact_mandataire_nom, notes_interne')
          .eq('alerte_id', ligne.alerteId)
          .maybeSingle(),
        supabase
          .from('v_factures_avec_reste_du')
          .select('numero_piece, montant_ttc, reste_du, date_echeance')
          .eq('code_client', ligne.codeClient)
          .gt('reste_du', 0.005)
          .order('date_echeance', { ascending: true }),
      ])
      if (annule) return

      const decl = (declRes.data as DeclarationRow | null) ?? null
      setDeclaration(decl)
      if (decl) {
        setStatut(decl.statut)
        setDateDeclaration(decl.date_declaration ?? '')
        setMontant(decl.montant_creancier != null ? String(decl.montant_creancier) : '')
        setRefDossier(decl.reference_dossier ?? '')
        setContactNom(decl.contact_mandataire_nom ?? '')
        setContactCoord(decl.contact_mandataire ?? '')
        setNotesInterne(decl.notes_interne ?? '')
      } else if (ligne.encours >= 0.01) {
        setMontant(String(ligne.encours))
      }
      setFactures((factRes.data ?? []) as FactureLigne[])
      setChargement(false)
    }
    charger()
    return () => { annule = true }
  }, [ligne.alerteId, ligne.codeClient, ligne.encours])

  async function sauvegarder() {
    setSauvegarde(true)
    try {
      const payload = {
        alerte_id: ligne.alerteId,
        code_client: ligne.codeClient,
        statut,
        date_declaration: dateDeclaration || null,
        montant_creancier: montant ? parseFloat(montant.replace(',', '.')) : null,
        reference_dossier: refDossier || null,
        contact_mandataire_nom: contactNom || null,
        contact_mandataire: contactCoord || null,
        notes_interne: notesInterne || null,
        mise_a_jour_le: new Date().toISOString(),
      }
      let erreur
      if (declaration) {
        const res = await db.from('declarations_creances').update(payload).eq('id', declaration.id)
        erreur = res.error
      } else {
        const res = await db.from('declarations_creances').insert(payload)
        erreur = res.error
      }
      if (erreur) throw erreur
      toast.success('Déclaration sauvegardée')
      onDeclarationSaved()
      onClose()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSauvegarde(false)
    }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const montantEchu    = factures.filter(f => f.date_echeance && new Date(f.date_echeance) < today).reduce((s, f) => s + f.reste_du, 0)
  const montantAEchoir = factures.filter(f => !f.date_echeance || new Date(f.date_echeance) >= today).reduce((s, f) => s + f.reste_du, 0)

  const joursDepuisParution = ligne.joursDepuis
  const delaiDepasse = joursDepuisParution > 60
  const st = STATUT[ligne.typeProcedure]
  const totalReste = factures.reduce((s, f) => s + f.reste_du, 0)
  const totalTtc   = factures.reduce((s, f) => s + f.montant_ttc, 0)
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-ockham-teal/30 focus:border-ockham-teal'

  return (
    <ModalBase titre="Suivi de la procédure" onClose={onClose} largeur="max-w-3xl" icon={<IcFileText size={15} />}>
      <div className="p-6 space-y-6">

        {/* Résumé client */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
          <span className="font-mono text-[11px] text-gray-400 shrink-0">{ligne.codeClient}</span>
          <span className="font-bold text-gray-900 flex-1 truncate">{ligne.nom}</span>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 ${st?.badge ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
            {st?.label ?? ligne.typeProcedure}
          </span>
          <span className="text-[11px] text-gray-400 shrink-0">{joursDepuisParution} j depuis parution</span>
        </div>

        {/* ── 1. Publication BODACC ── */}
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Publication BODACC</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {ligne.typeJugement && (
              <div className="col-span-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Type de jugement</p>
                <p className="text-sm text-gray-800">{ligne.typeJugement}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Tribunal</p>
              <p className="text-sm text-gray-800">{ligne.tribunal ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Date de jugement</p>
              <p className="text-sm text-gray-800">{fmtDate(ligne.dateJugement)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Date de parution BODACC</p>
              <p className="text-sm text-gray-800">{fmtDate(ligne.dateParution)}</p>
            </div>
            {ligne.sourceUrl && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Source</p>
                <a href={ligne.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-ockham-teal hover:underline">Voir sur BODACC ↗</a>
              </div>
            )}
            {(() => {
              // Mandataire structuré (JSONB) en priorité, sinon extrait de la description
              if (ligne.mandataire && (ligne.mandataire.nom || ligne.mandataire.qualite)) {
                return (
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Mandataire</p>
                    <p className="text-sm text-gray-800">
                      {[ligne.mandataire.qualite, ligne.mandataire.nom].filter(Boolean).join(' — ')}
                      {ligne.mandataire.adresse && <span className="text-gray-400"> · {ligne.mandataire.adresse}</span>}
                    </p>
                  </div>
                )
              }
              const complement = ligne.description
                ? ligne.description.split(' — ').slice(2).join(' — ').trim()
                : ''
              if (!complement) return null
              return (
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Mandataires désignés</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{complement}</p>
                </div>
              )
            })()}
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* ── 2. Déclaration de créances ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Déclaration de créances</p>
            {ligne.dateParution && (
              delaiDepasse
                ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Délai 60 j dépassé
                  </span>
                : <span className="text-[10px] text-gray-400">{60 - joursDepuisParution} j restants sur 60</span>
            )}
          </div>

          {chargement ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-9 bg-gray-50 rounded-lg animate-pulse" />)}</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Statut</label>
                  <select value={statut} onChange={e => setStatut(e.target.value)} className={inputCls}>
                    <option value="brouillon">Brouillon</option>
                    <option value="declaree">Déclarée</option>
                    <option value="acceptee">Acceptée</option>
                    <option value="rejetee">Rejetée</option>
                    <option value="remboursee">Remboursée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Date de déclaration</label>
                  <input type="date" value={dateDeclaration} onChange={e => setDateDeclaration(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Montant créancier (€)</label>
                  <input type="number" step="0.01" value={montant} onChange={e => setMontant(e.target.value)} placeholder="0" className={inputCls} />
                  {factures.length > 0 && (
                    <div className="mt-1.5 flex gap-3 text-[10px] text-gray-400">
                      <span>Échu : <span className="font-semibold text-gray-600">{fmtEuros(montantEchu)}</span></span>
                      <span>·</span>
                      <span>À échoir : <span className="font-semibold text-gray-600">{fmtEuros(montantAEchoir)}</span></span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Référence dossier</label>
                  <input type="text" value={refDossier} onChange={e => setRefDossier(e.target.value)} placeholder="N° dossier mandataire" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Contact mandataire — Nom Prénom</label>
                  <input type="text" value={contactNom} onChange={e => setContactNom(e.target.value)} placeholder="Nom et prénom" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Contact mandataire — Email / Tél</label>
                  <input type="text" value={contactCoord} onChange={e => setContactCoord(e.target.value)} placeholder="Email ou téléphone" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes internes</label>
                <textarea
                  ref={notesRef}
                  value={notesInterne}
                  onChange={e => setNotesInterne(e.target.value)}
                  rows={4}
                  placeholder="Observations, suivi…"
                  className={`${inputCls} resize-none overflow-hidden`}
                />
              </div>
            </div>
          )}
        </div>

        <div className="h-px bg-gray-100" />

        {/* ── 3. Encours client ── */}
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Encours client</p>
          {chargement ? (
            <div className="h-20 bg-gray-50 rounded-xl animate-pulse" />
          ) : factures.length === 0 ? (
            <p className="text-sm text-gray-300 py-2">Aucune facture en attente</p>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: '#0E1A2B' }}>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>N° pièce</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Montant TTC</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Reste dû</th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Échéance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {factures.map(f => (
                    <tr key={f.numero_piece} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5"><span className="font-mono text-[11px] text-gray-500">{f.numero_piece}</span></td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{fmtEuros(f.montant_ttc)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-ockham-copper">{fmtEuros(f.reste_du)}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500 text-xs">{fmtDate(f.date_echeance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td className="px-3 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Total</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-600">{fmtEuros(totalTtc)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-ockham-copper">{fmtEuros(totalReste)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer">
            Annuler
          </button>
          <button
            onClick={sauvegarder}
            disabled={sauvegarde || chargement}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            style={{ background: '#3BA89F' }}
          >
            {sauvegarde ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>

      </div>
    </ModalBase>
  )
}
