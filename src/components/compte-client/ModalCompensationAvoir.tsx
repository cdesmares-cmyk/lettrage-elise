// Modale centrale — compensation interne avoir/facture
// Flow : onglet Nouvelle (étape 1 avoir → étape 2 factures) | onglet Historique (annulation)
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { TOLERANCE_CENT } from '../../lib/constantes'
import type { FactureDetail } from '../../types/client'
import type { useCompensationAvoir } from '../../hooks/useCompensationAvoir'

type CompensationAvoir = ReturnType<typeof useCompensationAvoir>

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
  avoir: LigneCmp | null
  factures: LigneCmp[]
  annule: boolean
  exportee: boolean
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const filtreAvoirs = (fs: FactureDetail[]) => fs.filter(f => f.est_avoir && f.reste_du < 0)
const filtreFacturesDues = (fs: FactureDetail[], code: string) =>
  fs.filter(f => !f.est_avoir && f.reste_du > TOLERANCE_CENT && f.code_client === code)

// ── Overlay de confirmation annulation (pattern identique à PageLettrage) ──

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
        <p className="text-xs text-gray-500">
          Les soldes de l'avoir et des factures concernées seront restaurés. Cette action est irréversible si un export a déjà eu lieu.
        </p>
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

// ── Onglet Historique ──────────────────────────────────────────────────────

function TabHistorique({ codeDso, orgId, compensation, onRefreshFactures }: {
  codeDso: string
  orgId: string
  compensation: CompensationAvoir
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
        avoir: lignes.find(l => l.montant < 0) ?? null,
        factures: lignes.filter(l => l.montant > 0),
        annule: lignes.every(l => l.annule),
        exportee: lignes.some(l => l.export_id !== null),
      })
    }
    // D : n'afficher que les compensations actives
    setGroupes(result.filter(g => !g.annule))
    setCharge(false)
  }, [codeDso, orgId])

  useEffect(() => { charger() }, [charger])

  async function handleConfirmerAnnulation(motif: string) {
    if (!confirmId) return
    setAnnulationEnCours(true)
    await compensation.annulerCompensation(confirmId, motif, () => { onRefreshFactures(); charger() })
    setConfirmId(null)
    setAnnulationEnCours(false)
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
              {g.avoir && (
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-ockham-teal/5">
                  <span className="text-[10px] font-semibold text-gray-700 font-mono">{g.avoir.numero_facture}</span>
                  <span className="text-xs font-bold text-ockham-teal tabular-nums">{fmt(g.avoir.montant)}</span>
                </div>
              )}
              {g.factures.map(f => (
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

// ── Onglet Nouvelle compensation (étapes 1 → 2) ────────────────────────────

function TabNouvelle({ factures, compensation }: { factures: FactureDetail[]; compensation: CompensationAvoir }) {
  const { avoirSource, chargement, creditDisponible, montantAttribue, restant } = compensation
  const listeAvoirs = filtreAvoirs(factures)
  const motif = compensation.motifInvalide()

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {/* Étape 1 : sélection de l'avoir */}
        {!avoirSource ? (
          <div className="px-4 pt-4 pb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Étape 1 — Sélectionnez un avoir</p>
            {listeAvoirs.length === 0
              ? <p className="text-xs text-gray-400 italic px-1">Aucun avoir avec solde disponible sur ce compte.</p>
              : <div className="space-y-1.5">
                  {listeAvoirs.map(f => (
                    <button key={f.numero_piece} onClick={() => compensation.selectionnerAvoir(f)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border bg-white border-gray-200 hover:border-ockham-teal hover:bg-ockham-teal/5 text-left transition-all cursor-pointer">
                      <div>
                        <p className="text-xs font-semibold text-gray-800 font-mono">{f.numero_piece}</p>
                        <p className="text-[10px] text-gray-400">{fmtDate(f.date_emission)}</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-ockham-teal flex-shrink-0 ml-2">{fmt(f.reste_du)}</span>
                    </button>
                  ))}
                </div>
            }
          </div>
        ) : (
          /* Étape 2 : avoir sélectionné en haut + factures */
          <>
            <div className="px-4 pt-4 pb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Avoir sélectionné</p>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-ockham-teal bg-ockham-teal/5">
                <div>
                  <p className="text-xs font-semibold text-gray-800 font-mono">{avoirSource.numero_piece}</p>
                  <p className="text-[10px] text-gray-400">{fmtDate(avoirSource.date_emission)}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  <span className="text-sm font-bold tabular-nums text-ockham-teal">{fmt(avoirSource.reste_du)}</span>
                  <button onClick={compensation.annuler} className="text-[10px] text-gray-400 hover:text-gray-700 underline transition-colors">Changer</button>
                </div>
              </div>
            </div>
            <div className="px-4 pb-4 border-t border-gray-100 pt-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Étape 2 — Factures à compenser</p>
              {filtreFacturesDues(factures, avoirSource.code_client).length === 0
                ? <p className="text-xs text-gray-400 italic px-1">Aucune facture impayée sur ce compte.</p>
                : <div className="space-y-1.5">
                    {filtreFacturesDues(factures, avoirSource.code_client).map(f => {
                      const sel = compensation.estSelectionne(f.numero_piece)
                      const montantDispo = Math.min(f.reste_du, restant + (sel ? (compensation.selection.find(s => s.facture.numero_piece === f.numero_piece)?.montant ?? 0) : 0))
                      const horsPortee = !sel && restant < TOLERANCE_CENT
                      const entree = compensation.selection.find(s => s.facture.numero_piece === f.numero_piece)
                      return (
                        <div key={f.numero_piece}
                          className={`rounded-lg border transition-all ${sel ? 'bg-ockham-teal/5 border-ockham-teal' : horsPortee ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed' : 'bg-white border-gray-200 hover:border-ockham-teal cursor-pointer'}`}
                          onClick={() => !horsPortee && compensation.toggleFacture(f)}>
                          <div className="flex items-center justify-between px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${sel ? 'border-ockham-teal' : 'border-gray-300 bg-white'}`}
                                style={sel ? { background: '#4CC5BB' } : {}}>
                                {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-800 font-mono">{f.numero_piece}</p>
                                <p className="text-[10px] text-gray-400">{fmtDate(f.date_echeance ?? f.date_emission)}</p>
                              </div>
                            </div>
                            <div className="flex-shrink-0 ml-2 text-right">
                              <p className="text-xs font-bold tabular-nums text-gray-700">{fmt(f.reste_du)}</p>
                              {horsPortee && <p className="text-[9px] text-gray-400">Avoir insuffisant</p>}
                            </div>
                          </div>
                          {sel && entree && (
                            <div className="px-3 pb-2.5 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <label className="text-[10px] text-ockham-teal font-semibold flex-shrink-0">Montant :</label>
                              <div className="relative flex-1">
                                <input type="number" min={0.01} max={Math.min(f.reste_du, montantDispo)} step={0.01}
                                  value={entree.montant}
                                  onChange={e => compensation.setMontant(f.numero_piece, parseFloat(e.target.value) || 0)}
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
      {/* Barre total (visible en étape 2 seulement) */}
      {avoirSource && (
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50/70">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-gray-500">Alloué</span>
            <span className="font-bold tabular-nums text-ockham-teal">{fmt(montantAttribue)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Restant avoir</span>
            <span className={`font-semibold tabular-nums ${restant < -TOLERANCE_CENT ? 'text-red-600' : 'text-gray-600'}`}>{fmt(Math.max(0, restant))}</span>
          </div>
          <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, creditDisponible > 0 ? (montantAttribue / creditDisponible) * 100 : 0)}%`, background: '#4CC5BB' }} />
          </div>
        </div>
      )}
      {/* Footer */}
      {avoirSource && (
        <div className="flex-shrink-0 flex gap-2 px-5 py-4 border-t border-gray-100">
          <button disabled={chargement} onClick={compensation.annuler}
            className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40">
            Réinitialiser
          </button>
          <button onClick={compensation.valider} disabled={!compensation.peutValider() || chargement} title={motif ?? undefined}
            className="flex-[2] flex items-center justify-center text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#4CC5BB' }}>
            {chargement ? 'Enregistrement…' : `Valider${montantAttribue > TOLERANCE_CENT ? ` (${fmt(montantAttribue)})` : ''}`}
          </button>
        </div>
      )}
    </>
  )
}

// ── Modale principale ──────────────────────────────────────────────────────

interface Props {
  codeDso: string
  nomClient: string
  factures: FactureDetail[]
  compensation: CompensationAvoir
  onFermer: () => void
  onRefreshFactures: () => void
}

export function ModalCompensationAvoir({ codeDso, nomClient, factures, compensation, onFermer, onRefreshFactures }: Props) {
  const { profil } = useAuth()
  const [onglet, setOnglet] = useState<'nouvelle' | 'historique'>('nouvelle')
  const orgId = profil?.organisation_id ?? ''
  const nbAvoirs = filtreAvoirs(factures).length

  function fermerEtReset() { compensation.annuler(); onFermer() }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') fermerEtReset() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={fermerEtReset} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header navy */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ background: '#0E1A2B', borderBottom: '1px solid rgba(76,197,187,0.25)' }}>
          <div>
            <p className="text-sm font-bold text-white">Compensation avoir — <span className="text-ockham-teal">{nomClient}</span></p>
            <p className="text-[10px] text-white/40 mt-0.5 font-mono">{codeDso} · {nbAvoirs} avoir{nbAvoirs !== 1 ? 's' : ''} disponible{nbAvoirs !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={fermerEtReset}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-lg leading-none transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)' }}>
            ×
          </button>
        </div>
        {/* Onglets */}
        <div className="flex flex-shrink-0 border-b border-gray-100 px-4">
          {(['nouvelle', 'historique'] as const).map(t => (
            <button key={t} onClick={() => setOnglet(t)}
              className={`text-xs font-semibold px-4 py-2.5 border-b-2 transition-colors ${onglet === t ? 'border-ockham-teal text-ockham-teal' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {t === 'nouvelle' ? 'Nouvelle compensation' : 'Historique'}
            </button>
          ))}
        </div>
        {/* Contenu */}
        {onglet === 'nouvelle'
          ? <TabNouvelle factures={factures} compensation={compensation} />
          : <div className="flex-1 overflow-y-auto"><TabHistorique codeDso={codeDso} orgId={orgId} compensation={compensation} onRefreshFactures={onRefreshFactures} /></div>
        }
      </div>
    </div>
  )
}
