import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import type { Relance, StatutRelance } from '../../hooks/useRelances'
import type { CommentaireFacture } from '../../types/client'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { useRole } from '../../contexts/RoleContext'

const TRANSITIONS: Partial<Record<StatutRelance, StatutRelance[]>> = {
  envoyee:           ['repondue', 'sans_reponse', 'payee'],
  sans_reponse:      ['repondue', 'payee'],
  repondue:          ['promesse_paiement', 'payee'],
  promesse_paiement: ['payee'],
}

const PIPELINE: StatutRelance[] = ['envoyee', 'repondue', 'promesse_paiement', 'payee']
const LABELS_PIPELINE = ['Envoyée', 'Prise de contact', 'Promesse', 'Payée']

function fmtEuros(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}
function joursDepuis(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

type EtatCom = { texte: string; nePasRelancer: boolean; saving: boolean }

interface SauvegarderComData {
  numero_piece: string; contact: string; date_contact: string
  commentaire: string; operateur: string; ne_pas_relancer?: boolean
}

interface Props {
  relance: Relance | null
  onFermer: () => void
  onMajStatut: (id: string, statut: StatutRelance, dateRappel?: string) => Promise<boolean>
  onArchiver: (id: string) => Promise<boolean>
  onSauvegarderNote: (id: string, note: string) => Promise<boolean>
  commentaires: Map<string, CommentaireFacture>
  onSauvegarderCommentaire: (data: SauvegarderComData) => Promise<boolean>
}

export function ModalDetailRelance({ relance, onFermer, onMajStatut, onArchiver, onSauvegarderNote, commentaires, onSauvegarderCommentaire }: Props) {
  const { facturesActives, clients } = useAppData()
  const { utilisateur } = useAuth()
  const { peutModifier } = useRole()

  const [noteTexte, setNoteTexte] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [etatsCom, setEtatsCom] = useState<Map<string, EtatCom>>(new Map())
  const [statutSaving, setStatutSaving] = useState(false)
  const [sansReponseOpen, setSansReponseOpen] = useState(false)
  const [dateRappel, setDateRappel] = useState('')

  const facturesMap = new Map(facturesActives.map(f => [f.numero_piece, f]))
  const clientsMap  = new Map(clients.map(c => [c.code_dso, c.nom]))

  useEffect(() => {
    setNoteTexte(relance?.note ?? '')
    setSansReponseOpen(false)
    setDateRappel('')
    if (!relance) return
    const m = new Map<string, EtatCom>()
    for (const id of relance.factures_ids ?? []) {
      const com = commentaires.get(id)
      m.set(id, { texte: com?.commentaire ?? '', nePasRelancer: com?.ne_pas_relancer ?? false, saving: false })
    }
    setEtatsCom(m)
  }, [relance?.id])

  useEffect(() => {
    if (!relance) return
    function handleEsc(e: KeyboardEvent) { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [!!relance, onFermer])

  if (!relance) return null

  const factures    = (relance.factures_ids ?? []).map(id => facturesMap.get(id)).filter(Boolean)
  const nomClient   = clientsMap.get(relance.code_client) ?? relance.code_client
  const montant     = factures.reduce((s, f) => s + (f?.montant_ttc ?? 0), 0)
  const jours       = relance.envoyee_le ? joursDepuis(relance.envoyee_le) : null
  const enRetard    = jours !== null && jours >= 10
  const pipelineIdx = PIPELINE.indexOf(relance.statut)
  // sans_reponse n'est pas un step du pipeline — on marque step 0 (envoyée) comme fait
  const displayIdx  = relance.statut === 'sans_reponse' ? 0 : pipelineIdx
  const transitions = TRANSITIONS[relance.statut] ?? []
  const operateur   = utilisateur?.email?.split('@')[0] ?? ''

  function setCom(id: string, patch: Partial<EtatCom>) {
    setEtatsCom(prev => { const n = new Map(prev); n.set(id, { ...prev.get(id)!, ...patch }); return n })
  }

  async function sauvegarderCom(id: string) {
    const etat = etatsCom.get(id)
    if (!etat) return
    setCom(id, { saving: true })
    await onSauvegarderCommentaire({ numero_piece: id, contact: '', date_contact: '', commentaire: etat.texte, operateur, ne_pas_relancer: etat.nePasRelancer })
    setCom(id, { saving: false })
    toast.success('Commentaire enregistré')
  }

  async function changerStatut(statut: StatutRelance, rappel?: string) {
    if (!relance || statutSaving) return
    setStatutSaving(true)
    await onMajStatut(relance.id, statut, rappel)
    setStatutSaving(false)
    setSansReponseOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onFermer}>
      <div className="absolute inset-0 bg-ockham-navy/50" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[88vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* En-tête navy */}
        <div className="px-6 py-4 bg-ockham-navy flex items-start justify-between gap-4 flex-shrink-0 rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">{nomClient}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-[11px] text-white/50 bg-white/10 px-1.5 py-0.5 rounded">{relance.code_client}</span>
              {relance.envoyee_le && (
                <span className="text-[11px] text-white/50">
                  Envoyée le {new Date(relance.envoyee_le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xl font-bold text-ockham-teal tabular-nums">{fmtEuros(montant)}</span>
            {jours !== null && (
              <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${enRetard ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-white/10 text-white/70 border-white/20'}`}>
                {jours === 0 ? 'Auj.' : `J+${jours}`}
              </span>
            )}
            <button
              onClick={onFermer}
              className="w-7 h-7 rounded-lg border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Corps */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Colonne gauche : Factures + commentaires inline */}
          <div className="w-[55%] border-r border-gray-100 px-5 py-4 overflow-y-auto flex flex-col gap-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Factures liées</p>
            {factures.length === 0 && <p className="text-xs text-gray-400 italic">Aucune facture trouvée</p>}
            {factures.map(f => {
              if (!f) return null
              const etat = etatsCom.get(f.numero_piece) ?? { texte: '', nePasRelancer: false, saving: false }
              return (
                <div key={f.numero_piece} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] font-bold text-ockham-teal-dark">{f.numero_piece}</span>
                    <span className="text-sm font-bold text-ockham-navy">{fmtEuros(f.montant_ttc ?? 0)}</span>
                  </div>
                  {f.date_echeance && (
                    <p className="text-[11px] text-gray-400">Échéance : {new Date(f.date_echeance).toLocaleDateString('fr-FR')}</p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={etat.nePasRelancer}
                      onChange={e => setCom(f.numero_piece, { nePasRelancer: e.target.checked })}
                      className="w-3.5 h-3.5 accent-amber-500"
                    />
                    <span className={`text-[11px] font-semibold ${etat.nePasRelancer ? 'text-amber-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                      Ne pas relancer
                    </span>
                    {etat.nePasRelancer && <span className="text-[10px] text-amber-500 ml-auto">Exclue des prochaines relances</span>}
                  </label>
                  <textarea
                    value={etat.texte}
                    onChange={e => setCom(f.numero_piece, { texte: e.target.value })}
                    placeholder="Note sur cette facture…"
                    rows={2}
                    className="w-full text-[12px] text-gray-700 bg-white border border-gray-200 focus:border-ockham-teal/50 rounded-lg px-2.5 py-2 outline-none resize-none placeholder-gray-300 transition-colors"
                  />
                  <button
                    disabled={etat.saving}
                    onClick={() => sauvegarderCom(f.numero_piece)}
                    className="self-end text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-ockham-teal text-white hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {etat.saving ? '…' : '✓ Enregistrer'}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Colonne droite : Statut + Note */}
          <div className="flex-1 px-5 py-4 overflow-y-auto flex flex-col gap-5">

            {/* Pipeline statut */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Statut de la relance</p>
              <div className="flex items-start gap-0 mb-3">
                {PIPELINE.map((step, i) => {
                  const done      = displayIdx > i
                  const active    = pipelineIdx === i
                  const canClick  = peutModifier && !statutSaving && transitions.includes(step) && !done && !active
                  // Premier step cliquable du pipeline : hint visuel renforcé
                  const isNext    = canClick && !PIPELINE.slice(0, i).some(s => transitions.includes(s))
                  return (
                    <div key={step} className="flex items-center flex-1">
                      <button
                        disabled={!canClick}
                        onClick={() => canClick && changerStatut(step)}
                        className={`flex flex-col items-center gap-1 flex-1 group ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                          done    ? 'bg-ockham-teal border-ockham-teal text-white' :
                          active  ? 'bg-white border-ockham-teal text-ockham-teal shadow-[0_0_0_3px_#E6F7F5]' :
                          isNext  ? 'bg-white border-ockham-teal/50 text-ockham-teal/70 group-hover:border-ockham-teal group-hover:text-ockham-teal' :
                          canClick? 'bg-white border-gray-300 text-gray-400 group-hover:border-ockham-teal group-hover:text-ockham-teal' :
                                    'bg-white border-gray-200 text-gray-300'
                        }`}>
                          {done ? '✓' : i + 1}
                        </div>
                        <span className={`text-[9px] font-semibold text-center leading-tight ${
                          done    ? 'text-ockham-navy' :
                          active  ? 'text-ockham-teal' :
                          isNext  ? 'text-ockham-teal/70 group-hover:text-ockham-teal' :
                          canClick? 'text-gray-400 group-hover:text-ockham-teal' :
                                    'text-gray-200'
                        }`}>
                          {LABELS_PIPELINE[i]}
                        </span>
                      </button>
                      {i < PIPELINE.length - 1 && (
                        <div className={`h-0.5 w-3 flex-shrink-0 mb-4 ${done ? 'bg-ockham-teal' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Bouton "Sans réponse" ou panneau date de rappel */}
              {peutModifier && transitions.includes('sans_reponse') && !sansReponseOpen && (
                <button
                  disabled={statutSaving}
                  onClick={() => setSansReponseOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <span className="text-[11px] font-semibold flex-1 text-left">Marquer « Sans réponse »</span>
                  <span className="text-[10px] text-amber-400">Alerte J+10</span>
                </button>
              )}

              {sansReponseOpen && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex flex-col gap-2.5">
                  <p className="text-[11px] font-semibold text-amber-700">Fixer une date de rappel (facultatif)</p>
                  <input
                    type="date"
                    value={dateRappel}
                    onChange={e => setDateRappel(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="text-[12px] text-gray-700 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-amber-400 transition-colors"
                  />
                  <p className="text-[10px] text-amber-500">Un rappel sera généré à cette date si la relance reste sans réponse.</p>
                  <div className="flex gap-2">
                    <button
                      disabled={statutSaving}
                      onClick={() => changerStatut('sans_reponse', dateRappel || undefined)}
                      className="flex-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {statutSaving ? '…' : 'Confirmer'}
                    </button>
                    <button
                      onClick={() => setSansReponseOpen(false)}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {relance.statut === 'payee' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[11px] font-semibold text-emerald-700">Relance payée — terminée</span>
                </div>
              )}
              {relance.statut === 'sans_reponse' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-[11px] font-semibold text-amber-700">Sans réponse</span>
                  {peutModifier && transitions.length > 0 && (
                    <div className="ml-auto flex gap-1.5">
                      {transitions.map(t => (
                        <button key={t} disabled={statutSaving} onClick={() => changerStatut(t)}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded border border-gray-200 bg-white hover:border-ockham-teal hover:text-ockham-teal transition-colors disabled:opacity-50 cursor-pointer">
                          {t === 'repondue' ? 'Prise de contact' : 'Payée'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="h-px bg-gray-100" />

            {/* Note de suivi */}
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Note de suivi</p>
              <textarea
                value={noteTexte}
                onChange={e => setNoteTexte(e.target.value)}
                placeholder="Saisir une note de suivi…"
                rows={4}
                className="w-full text-xs text-gray-700 bg-white border border-gray-200 focus:border-ockham-teal/50 rounded-xl px-3 py-2.5 outline-none resize-none placeholder-gray-300 transition-colors"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-300">Visible dans le compte client · Modifiable par tous</span>
                <button
                  disabled={noteSaving}
                  onClick={async () => {
                    setNoteSaving(true)
                    await onSauvegarderNote(relance.id, noteTexte)
                    setNoteSaving(false)
                    toast.success('Note enregistrée')
                  }}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-ockham-teal text-white hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {noteSaving ? '…' : '✓ Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Pied de page */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between flex-shrink-0">
          <button
            onClick={async () => { await onArchiver(relance.id); onFermer() }}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 border border-gray-200 bg-white hover:border-red-300 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
            Archiver cette relance
          </button>
          <button
            onClick={onFermer}
            className="text-[11px] font-semibold text-ockham-navy border border-ockham-navy/20 bg-white hover:bg-ockham-navy hover:text-white px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
