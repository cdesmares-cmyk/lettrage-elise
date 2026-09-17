// Modale compensation unifiée — avoir [A] ou facture surpayée [F] → une ou plusieurs factures
// Flow : onglet Nouvelle (étape 1 source → étape 2 destinations) | onglet Historique (annulation)
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { TOLERANCE_CENT } from '../../lib/constantes'
import type { FactureDetail } from '../../types/client'
import toast from 'react-hot-toast'

interface LigneCmp {
  id: string
  compensation_id: string
  numero_facture: string | null
  montant: number
  date_lettrage: string
  annule: boolean
  export_id: string | null
  operateur: string | null
}

interface GroupeCmp {
  id: string
  date: string
  operateur: string | null
  source: LigneCmp | null
  destinations: LigneCmp[]
  annule: boolean
  exportee: boolean
}

interface SelectionFacture {
  facture: FactureDetail
  montant: number
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Sources : tout ce qui a un solde négatif, hors lignes bancaires 411
const filtreSources = (fs: FactureDetail[]) =>
  fs.filter(f => f.reste_du < -TOLERANCE_CENT && !f.numero_piece.startsWith('411_'))

const filtreDestinations = (fs: FactureDetail[], sourceNum: string) =>
  fs.filter(f => !f.est_avoir && f.reste_du > TOLERANCE_CENT && f.numero_piece !== sourceNum && !f.numero_piece.startsWith('411_'))

function BadgeSource({ estAvoir }: { estAvoir: boolean }) {
  return estAvoir
    ? <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-ockham-teal/10 text-ockham-teal border border-ockham-teal/30">A</span>
    : <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-200">F</span>
}

// ── Overlay confirmation annulation ───────────────────────────────────────────

function ConfirmAnnulation({ onConfirmer, onAnnuler, enCours }: {
  onConfirmer: (motif: string) => void
  onAnnuler: () => void
  enCours: boolean
}) {
  const [motif, setMotif] = useState('')
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <p className="text-sm font-semibold text-gray-800">Annuler cette compensation ?</p>
        <p className="text-xs text-gray-500">Les soldes des pièces concernées seront restaurés.</p>
        <textarea
          value={motif}
          onChange={e => setMotif(e.target.value)}
          placeholder="Motif d'annulation (optionnel)"
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 placeholder-gray-400 outline-none focus:border-ockham-teal resize-none transition-colors"
        />
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onAnnuler} disabled={enCours}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            Annuler
          </button>
          <button onClick={() => onConfirmer(motif)} disabled={enCours}
            className="px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
            style={{ background: '#0E1A2B' }}>
            {enCours ? 'En cours…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Onglet Historique ──────────────────────────────────────────────────────────

function TabHistorique({ codeDso, orgId, onRefreshFactures }: {
  codeDso: string
  orgId: string
  onRefreshFactures: () => void
}) {
  const [groupes, setGroupes] = useState<GroupeCmp[]>([])
  const [charge, setCharge] = useState(true)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [annulationEnCours, setAnnulationEnCours] = useState(false)

  const charger = useCallback(async () => {
    setCharge(true)
    const { data } = await supabase
      .from('lettrages')
      .select('id, compensation_id, numero_facture, montant, date_lettrage, annule, export_id, operateur')
      .eq('organisation_id', orgId)
      .eq('code_client', codeDso)
      .not('compensation_id', 'is', null)
      .is('id_ligne_bancaire', null)
      .order('date_lettrage', { ascending: false })
      .order('compensation_id')
    const map = new Map<string, LigneCmp[]>()
    for (const l of (data ?? []) as LigneCmp[]) {
      if (!map.has(l.compensation_id)) map.set(l.compensation_id, [])
      map.get(l.compensation_id)!.push(l)
    }
    const result: GroupeCmp[] = []
    for (const [id, lignes] of map) {
      result.push({
        id,
        date: lignes[0].date_lettrage,
        operateur: lignes[0].operateur,
        source: lignes.find(l => l.montant < 0) ?? null,
        destinations: lignes.filter(l => l.montant > 0),
        annule: lignes.every(l => l.annule),
        exportee: lignes.some(l => l.export_id !== null),
      })
    }
    setGroupes(result.filter(g => !g.annule))
    setCharge(false)
  }, [codeDso, orgId])

  useEffect(() => { charger() }, [charger])

  async function handleConfirmerAnnulation(motif: string) {
    if (!confirmId) return
    setAnnulationEnCours(true)
    try {
      const { error } = await supabase
        .from('lettrages')
        .update({ annule: true, motif_annulation: motif.trim() || 'Annulation compensation' } as never)
        .eq('compensation_id', confirmId)
        .eq('annule', false)
      if (error) throw error
      toast.success('Compensation annulée — les soldes ont été restaurés')
      onRefreshFactures()
      charger()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'annulation')
    } finally {
      setConfirmId(null)
      setAnnulationEnCours(false)
    }
  }

  if (charge) return <div className="flex items-center justify-center py-12 text-xs text-gray-400">Chargement…</div>
  if (groupes.length === 0) return <div className="flex items-center justify-center py-12 text-xs text-gray-400 italic">Aucune compensation active pour ce client.</div>

  return (
    <>
      {confirmId && (
        <ConfirmAnnulation
          onConfirmer={handleConfirmerAnnulation}
          onAnnuler={() => setConfirmId(null)}
          enCours={annulationEnCours}
        />
      )}
      <div className="p-4 space-y-3">
        {groupes.map(g => (
          <div key={g.id} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{fmtDate(g.date)}</span>
                {g.operateur && <span className="text-[10px] text-gray-400">· {g.operateur}</span>}
                {g.exportee && <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Exportée</span>}
              </div>
              {!g.exportee && (
                <button onClick={() => setConfirmId(g.id)}
                  className="w-5 h-5 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors text-sm leading-none"
                  title="Annuler cette compensation">
                  ×
                </button>
              )}
            </div>
            <div className="space-y-1">
              {g.source && (
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-ockham-teal/5">
                  <span className="text-[10px] font-semibold text-gray-700 font-mono">{g.source.numero_facture}</span>
                  <span className="text-xs font-bold text-ockham-teal tabular-nums">{fmt(g.source.montant)}</span>
                </div>
              )}
              {g.destinations.map(f => (
                <div key={f.id} className="flex items-center justify-between px-2 py-1 rounded-lg bg-gray-50">
                  <span className="text-[10px] font-semibold text-gray-700 font-mono">{f.numero_facture}</span>
                  <span className="text-xs font-semibold text-gray-600 tabular-nums">−{fmt(f.montant)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Onglet Nouvelle compensation ───────────────────────────────────────────────

function TabNouvelle({ factures, onValide }: {
  factures: FactureDetail[]
  onValide: () => void
}) {
  const { utilisateur } = useAuth()
  const [source, setSource] = useState<FactureDetail | null>(null)
  const [selection, setSelection] = useState<SelectionFacture[]>([])
  const [chargement, setChargement] = useState(false)

  const sources = filtreSources(factures)
  const creditDispo = source ? Math.abs(source.reste_du) : 0
  const montantAttribue = Math.round(selection.reduce((s, i) => s + i.montant, 0) * 100) / 100
  const restant = Math.round((creditDispo - montantAttribue) * 100) / 100

  function toggleDest(f: FactureDetail) {
    if (selection.some(s => s.facture.numero_piece === f.numero_piece)) {
      setSelection(prev => prev.filter(s => s.facture.numero_piece !== f.numero_piece))
      return
    }
    const montantProp = Math.min(f.reste_du, restant)
    if (montantProp <= TOLERANCE_CENT) return
    setSelection(prev => [...prev, { facture: f, montant: Math.round(montantProp * 100) / 100 }])
  }

  function setMontant(numero: string, valeur: number) {
    setSelection(prev => prev.map(s =>
      s.facture.numero_piece === numero ? { ...s, montant: valeur } : s
    ))
  }

  function motifInvalide(): string | null {
    if (!source) return 'Aucune source sélectionnée'
    if (selection.length === 0) return 'Sélectionnez au moins une facture destination'
    if (montantAttribue > creditDispo + TOLERANCE_CENT) return 'Montant dépasse le crédit disponible'
    for (const s of selection) {
      if (s.montant <= TOLERANCE_CENT) return `Montant invalide pour ${s.facture.numero_piece}`
      if (s.montant > s.facture.reste_du + TOLERANCE_CENT) return `Montant dépasse le reste dû de ${s.facture.numero_piece}`
    }
    return null
  }

  async function valider() {
    if (motifInvalide() || chargement || !source) return
    setChargement(true)
    try {
      const compensationId = crypto.randomUUID()
      const operateur = utilisateur?.email?.split('@')[0] ?? 'inconnu'
      const dateDuJour = new Date().toISOString().split('T')[0]
      const refDests = selection.map(s => s.facture.numero_piece).join(' & ')
      const typeSource = source.est_avoir ? 'avoir' : 'crédit'
      const rows = [
        {
          numero_facture: source.numero_piece,
          code_client: source.code_client,
          montant: -montantAttribue,
          id_ligne_bancaire: null,
          mode: 'compensation',
          commentaire: `Compensation ${typeSource} → ${refDests}`,
          operateur,
          date_lettrage: dateDuJour,
          compensation_id: compensationId,
        },
        ...selection.map(s => ({
          numero_facture: s.facture.numero_piece,
          code_client: s.facture.code_client,
          montant: s.montant,
          id_ligne_bancaire: null,
          mode: 'compensation',
          commentaire: `Compensé depuis ${source.numero_piece}`,
          operateur,
          date_lettrage: dateDuJour,
          compensation_id: compensationId,
        })),
      ]
      const { error } = await supabase.from('lettrages').insert(rows as never)
      if (error) throw error
      const nb = selection.length
      toast.success(`Compensation enregistrée — ${nb} facture${nb > 1 ? 's' : ''} imputée${nb > 1 ? 's' : ''}`)
      setSource(null)
      setSelection([])
      onValide()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la compensation')
    } finally {
      setChargement(false)
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {!source ? (
          <div className="px-4 pt-4 pb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Étape 1 — Sélectionnez une source</p>
            {sources.length === 0
              ? <p className="text-xs text-gray-400 italic px-1">Aucun avoir ni facture surpayée disponible sur ce compte.</p>
              : <div className="space-y-1.5">
                  {sources.map(f => (
                    <button key={f.numero_piece} onClick={() => { setSource(f); setSelection([]) }}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border bg-white border-gray-200 hover:border-ockham-teal hover:bg-ockham-teal/5 text-left transition-all cursor-pointer">
                      <div className="flex items-center gap-2 min-w-0">
                        <BadgeSource estAvoir={f.est_avoir} />
                        <div>
                          <p className="text-xs font-semibold text-gray-800 font-mono">{f.numero_piece}</p>
                          <p className="text-[10px] text-gray-400">{f.date_emission ? fmtDate(f.date_emission) : '—'}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-ockham-teal flex-shrink-0 ml-2">{fmt(Math.abs(f.reste_du))}</span>
                    </button>
                  ))}
                </div>
            }
          </div>
        ) : (
          <>
            <div className="px-4 pt-4 pb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Source sélectionnée</p>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-ockham-teal bg-ockham-teal/5">
                <div className="flex items-center gap-2 min-w-0">
                  <BadgeSource estAvoir={source.est_avoir} />
                  <div>
                    <p className="text-xs font-semibold text-gray-800 font-mono">{source.numero_piece}</p>
                    <p className="text-[10px] text-gray-400">{source.date_emission ? fmtDate(source.date_emission) : '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  <span className="text-sm font-bold tabular-nums text-ockham-teal">{fmt(Math.abs(source.reste_du))}</span>
                  <button onClick={() => { setSource(null); setSelection([]) }} className="text-[10px] text-gray-400 hover:text-gray-700 underline transition-colors">Changer</button>
                </div>
              </div>
            </div>
            <div className="px-4 pb-4 border-t border-gray-100 pt-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Étape 2 — Factures à imputer</p>
              {filtreDestinations(factures, source.numero_piece).length === 0
                ? <p className="text-xs text-gray-400 italic px-1">Aucune facture impayée sur ce compte.</p>
                : <div className="space-y-1.5">
                    {filtreDestinations(factures, source.numero_piece).map(f => {
                      const sel = selection.some(s => s.facture.numero_piece === f.numero_piece)
                      const entree = selection.find(s => s.facture.numero_piece === f.numero_piece)
                      const horsPortee = !sel && restant < TOLERANCE_CENT
                      const montantDispo = Math.min(f.reste_du, restant + (sel ? (entree?.montant ?? 0) : 0))
                      return (
                        <div key={f.numero_piece}
                          className={`rounded-lg border transition-all ${sel ? 'bg-ockham-teal/5 border-ockham-teal' : horsPortee ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed' : 'bg-white border-gray-200 hover:border-ockham-teal cursor-pointer'}`}
                          onClick={() => !horsPortee && toggleDest(f)}>
                          <div className="flex items-center justify-between px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${sel ? 'border-ockham-teal' : 'border-gray-300 bg-white'}`}
                                style={sel ? { background: '#4CC5BB' } : {}}>
                                {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-800 font-mono">{f.numero_piece}</p>
                                <p className="text-[10px] text-gray-400">{fmtDate(f.date_echeance ?? f.date_emission ?? '')}</p>
                              </div>
                            </div>
                            <div className="flex-shrink-0 ml-2 text-right">
                              <p className="text-xs font-bold tabular-nums text-gray-700">{fmt(f.reste_du)}</p>
                              {horsPortee && <p className="text-[9px] text-gray-400">Crédit insuffisant</p>}
                            </div>
                          </div>
                          {sel && entree && (
                            <div className="px-3 pb-2.5 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <label className="text-[10px] text-ockham-teal font-semibold flex-shrink-0">Montant :</label>
                              <div className="relative flex-1">
                                <input type="number" min={0.01} max={Math.min(f.reste_du, montantDispo)} step={0.01}
                                  value={entree.montant}
                                  onChange={e => setMontant(f.numero_piece, parseFloat(e.target.value) || 0)}
                                  className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs font-mono text-gray-700 outline-none focus:border-ockham-teal text-right pr-6"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">€</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
              }
            </div>
          </>
        )}
      </div>

      {source && (
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50/70">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-gray-500">Alloué</span>
            <span className="font-bold tabular-nums text-ockham-teal">{fmt(montantAttribue)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Crédit restant</span>
            <span className={`font-semibold tabular-nums ${restant < -TOLERANCE_CENT ? 'text-red-600' : 'text-gray-600'}`}>{fmt(Math.max(0, restant))}</span>
          </div>
          <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, creditDispo > 0 ? (montantAttribue / creditDispo) * 100 : 0)}%`, background: '#4CC5BB' }} />
          </div>
        </div>
      )}

      {source && (
        <div className="flex-shrink-0 flex gap-2 px-5 py-4 border-t border-gray-100">
          <button disabled={chargement} onClick={() => { setSource(null); setSelection([]) }}
            className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40">
            Réinitialiser
          </button>
          <button onClick={valider} disabled={!!motifInvalide() || chargement} title={motifInvalide() ?? undefined}
            className="flex-[2] flex items-center justify-center text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#4CC5BB' }}>
            {chargement ? 'Enregistrement…' : `Valider${montantAttribue > TOLERANCE_CENT ? ` (${fmt(montantAttribue)})` : ''}`}
          </button>
        </div>
      )}
    </>
  )
}

// ── Modale principale ──────────────────────────────────────────────────────────

interface Props {
  codeDso: string
  nomClient: string
  factures: FactureDetail[]
  onFermer: () => void
  onRefreshFactures: () => void
}

export function ModalCompensation({ codeDso, nomClient, factures, onFermer, onRefreshFactures }: Props) {
  const { profil } = useAuth()
  const [onglet, setOnglet] = useState<'nouvelle' | 'historique'>('nouvelle')
  const [historiqueTrigger, setHistoriqueTrigger] = useState(0)
  const orgId = profil?.organisation_id ?? ''

  const sources = filtreSources(factures)
  const nbAvoirs = sources.filter(f => f.est_avoir).length
  const nbCredits = sources.filter(f => !f.est_avoir).length

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function sousTitre() {
    const parts: string[] = []
    if (nbAvoirs > 0) parts.push(`${nbAvoirs} avoir${nbAvoirs > 1 ? 's' : ''} [A]`)
    if (nbCredits > 0) parts.push(`${nbCredits} crédit${nbCredits > 1 ? 's' : ''} [F]`)
    return parts.join(' · ') || 'Aucune source disponible'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onFermer} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ background: '#0E1A2B', borderBottom: '1px solid rgba(76,197,187,0.25)' }}>
          <div>
            <p className="text-sm font-bold text-white">Compensation — <span className="text-ockham-teal">{nomClient}</span></p>
            <p className="text-[10px] text-white/40 mt-0.5 font-mono">{codeDso} · {sousTitre()}</p>
          </div>
          <button onClick={onFermer}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-lg leading-none transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)' }}>
            ×
          </button>
        </div>

        <div className="flex flex-shrink-0 border-b border-gray-100 px-4">
          {(['nouvelle', 'historique'] as const).map(t => (
            <button key={t} onClick={() => setOnglet(t)}
              className={`text-xs font-semibold px-4 py-2.5 border-b-2 transition-colors ${onglet === t ? 'border-ockham-teal text-ockham-teal' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {t === 'nouvelle' ? 'Nouvelle compensation' : 'Historique'}
            </button>
          ))}
        </div>

        {onglet === 'nouvelle'
          ? <TabNouvelle factures={factures} onValide={() => { setOnglet('historique'); setHistoriqueTrigger(t => t + 1); onRefreshFactures() }} />
          : <div className="flex-1 overflow-y-auto"><TabHistorique key={historiqueTrigger} codeDso={codeDso} orgId={orgId} onRefreshFactures={onRefreshFactures} /></div>
        }
      </div>
    </div>
  )
}
