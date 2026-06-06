// Modal de correction de lettrage : délettrage + relettering sans ligne bancaire
// + onglet Remboursement : insère un lettrage négatif sur une facture
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { IcWarning, IcEdit, IcRefund } from '../Icones'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCorrectionContext } from '../../contexts/CorrectionContext'
import type { LigneCorr } from '../../contexts/CorrectionContext'
import toast from 'react-hot-toast'
import type { InfoFacture } from '../../types/lettrage'

interface RowFacture { reste_du: number; montant_ttc: number; code_client: string; nom_client: string | null; statut_paiement: string }

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function nouvelleLigneSimple(): LigneCorr {
  return { _key: String(Date.now() + Math.random()), classe: 'facture', numero_facture: '', montant: '', info_facture: null, chargement: false }
}

// ── Ligne de saisie facture ────────────────────────────────────────────────────
function LigneSaisie({
  ligne, onModifier, onSupprimer, onNumeroChange,
}: {
  ligne: LigneCorr
  onModifier: (key: string, champ: Partial<LigneCorr>) => void
  onSupprimer: (key: string) => void
  onNumeroChange: (key: string, value: string) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={ligne.numero_facture}
            onChange={e => onNumeroChange(ligne._key, e.target.value)}
            placeholder="N° facture"
            className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs font-mono outline-none focus:border-ockham-teal pr-5"
          />
          {ligne.chargement && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ockham-teal animate-pulse">⟳</span>
          )}
        </div>
        <input
          type="number"
          value={ligne.montant}
          onChange={e => onModifier(ligne._key, { montant: e.target.value })}
          placeholder="0,00"
          step="0.01"
          min="0"
          className="w-24 flex-shrink-0 border border-gray-200 rounded-md px-2 py-1.5 text-xs text-right font-mono outline-none focus:border-ockham-teal"
        />
        <button
          onClick={() => onSupprimer(ligne._key)}
          className="w-6 h-6 rounded-full border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 text-sm flex items-center justify-center transition-colors flex-shrink-0"
        >×</button>
      </div>
      {ligne.info_facture && (
        <p className="mt-1 text-[10px] text-emerald-600 font-medium">
          ✓ {ligne.info_facture.nom_client ?? ligne.info_facture.code_client}
          {' · '}TTC : {fmt(ligne.info_facture.montant_ttc)}
        </p>
      )}
      {!ligne.info_facture && !ligne.chargement && ligne.numero_facture.length >= 4 && (
        <p className="mt-1 text-[10px] text-red-400">Facture introuvable</p>
      )}
    </div>
  )
}

// ── Onglet Correction ──────────────────────────────────────────────────────────
function OngletCorrection({ onFermer }: { onFermer: () => void }) {
  const { utilisateur } = useAuth()
  const { lignesCorrection, setLignesCorrection, minimiser, declencherOnSuccess } = useCorrectionContext()
  const navigate = useNavigate()
  const [chargement, setChargement] = useState(false)
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const lignesNeg = lignesCorrection.filter(l => l._key.startsWith('neg-'))
  const lignesPos = lignesCorrection.filter(l => l._key.startsWith('pos-'))

  function ajouterNeg() {
    setLignesCorrection(prev => [...prev, { ...nouvelleLigneSimple(), _key: `neg-${Date.now()}` }])
  }
  function ajouterPos() {
    setLignesCorrection(prev => [...prev, { ...nouvelleLigneSimple(), _key: `pos-${Date.now()}` }])
  }
  function supprimer(key: string, groupe: 'neg' | 'pos') {
    const liste = groupe === 'neg' ? lignesNeg : lignesPos
    if (liste.length <= 1) return
    setLignesCorrection(prev => prev.filter(l => l._key !== key))
  }
  function modifier(key: string, champ: Partial<LigneCorr>) {
    setLignesCorrection(prev => prev.map(l => l._key === key ? { ...l, ...champ } : l))
  }

  async function chercherFacture(key: string, numero: string) {
    if (numero.length < 4) { modifier(key, { info_facture: null, chargement: false }); return }
    modifier(key, { chargement: true })
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select('reste_du, montant_ttc, code_client, nom_client, statut_paiement')
      .eq('numero_piece', numero)
      .maybeSingle()
    const row = data as unknown as RowFacture | null
    modifier(key, {
      chargement: false,
      info_facture: row as InfoFacture | null,
      montant: row ? String(Math.abs(row.montant_ttc)) : '',
    })
  }

  function handleNumeroChange(key: string, value: string) {
    modifier(key, { numero_facture: value, info_facture: null, montant: '' })
    clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => chercherFacture(key, value), 400)
  }

  const totalNeg = Math.round(lignesNeg.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
  const totalPos = Math.round(lignesPos.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
  const equilibre = Math.abs(totalNeg - totalPos) < 0.01

  const lignesValides = (ls: LigneCorr[]) => ls.every(l => {
    const m = parseFloat(l.montant)
    return !!l.numero_facture.trim() && !!l.info_facture && !isNaN(m) && m > 0
  })
  const peutValider = equilibre && totalNeg > 0 && lignesValides(lignesNeg) && lignesValides(lignesPos)

  async function valider() {
    if (!peutValider) return
    setChargement(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      type SourceInfo = { id_ligne_bancaire: string; montant: number; proportion: number }
      const sourceMap = new Map<string, SourceInfo[]>()

      for (const neg of lignesNeg) {
        const numero = neg.numero_facture.trim()
        const { data } = await supabase
          .from('lettrages')
          .select('id_ligne_bancaire, montant')
          .eq('numero_facture', numero)
          .gt('montant', 0)
          .not('id_ligne_bancaire', 'is', null)
        const sources = ((data ?? []) as { id_ligne_bancaire: string | null; montant: number }[])
          .filter((r): r is { id_ligne_bancaire: string; montant: number } =>
            !!r.id_ligne_bancaire && !r.id_ligne_bancaire.endsWith('-C')
          )
        const total = sources.reduce((s, r) => s + r.montant, 0)
        sourceMap.set(numero, sources.map(s => ({
          id_ligne_bancaire: s.id_ligne_bancaire,
          montant: s.montant,
          proportion: total > 0 ? s.montant / total : 1 / sources.length,
        })))
      }

      const seenIds = new Set<string>()
      const allSources: SourceInfo[] = []
      for (const sources of sourceMap.values()) {
        for (const src of sources) {
          if (!seenIds.has(src.id_ligne_bancaire)) {
            seenIds.add(src.id_ligne_bancaire)
            allSources.push(src)
          }
        }
      }
      const totalAll = allSources.reduce((s, src) => s + src.montant, 0)
      const globalSources: SourceInfo[] = allSources.map(src => ({
        ...src,
        proportion: totalAll > 0 ? src.montant / totalAll : 1 / allSources.length,
      }))

      type InsertRow = {
        id_ligne_bancaire: string | null; numero_facture: string | null; code_client: string
        montant: number; date_lettrage: string; mode: string
        commentaire: string | null; cree_par: string | null; operateur: string | null
      }

      function makeRow(l: LigneCorr, montant: number, idLigne: string | null): InsertRow {
        return {
          id_ligne_bancaire: idLigne,
          numero_facture: l.numero_facture.trim(),
          code_client: l.info_facture?.code_client ?? '',
          montant: Math.round(montant * 100) / 100,
          date_lettrage: today,
          mode: 'manuel',
          commentaire: `Correction — ${montant < 0 ? 'délettrage' : 'relettering'}`,
          cree_par: utilisateur?.id ?? null,
          operateur: utilisateur?.email?.split('@')[0] ?? null,
        }
      }

      function splitAcross(m: number, sources: SourceInfo[], l: LigneCorr): InsertRow[] {
        if (sources.length === 0) return [makeRow(l, m, null)]
        if (sources.length === 1) return [makeRow(l, m, sources[0].id_ligne_bancaire + '-C')]
        let remaining = m
        return sources.map((src, i) => {
          const isLast = i === sources.length - 1
          const split = isLast ? remaining : Math.round(m * src.proportion * 100) / 100
          remaining -= split
          return makeRow(l, split, src.id_ligne_bancaire + '-C')
        })
      }

      const inserts: InsertRow[] = []
      for (const l of lignesNeg) {
        const m = Math.round((parseFloat(l.montant) || 0) * 100) / 100
        inserts.push(...splitAcross(-m, sourceMap.get(l.numero_facture.trim()) ?? [], l))
      }
      for (const l of lignesPos) {
        const m = Math.round((parseFloat(l.montant) || 0) * 100) / 100
        inserts.push(...splitAcross(m, globalSources, l))
      }

      const { error } = await supabase.from('lettrages').insert(inserts as never)
      if (error) throw error
      toast.success('Correction enregistrée.')
      declencherOnSuccess()
      onFermer()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la correction.')
    } finally {
      setChargement(false)
    }
  }

  return (
    <div className="px-6 py-5 space-y-4">
      {/* Bouton identifier */}
      <div className="flex justify-end">
        <button
          onClick={() => { minimiser(); navigate('/compte-client') }}
          className="text-xs text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors font-medium"
        >
          Identifier vos factures →
        </button>
      </div>

      {/* Section Affectation à corriger */}
      <div className="border border-red-100 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-red-50 border-b border-red-100">
          <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Affectation à corriger</p>
          <p className="text-[10px] text-red-400 mt-0.5">Factures actuellement lettrées à désaffecter</p>
        </div>
        <div className="px-4 py-3 space-y-3">
          {lignesNeg.map(l => (
            <LigneSaisie
              key={l._key}
              ligne={l}
              onModifier={modifier}
              onSupprimer={key => supprimer(key, 'neg')}
              onNumeroChange={handleNumeroChange}
            />
          ))}
          <button
            onClick={ajouterNeg}
            className="flex items-center gap-1.5 w-full border border-dashed border-red-200 hover:border-red-400/50 hover:text-red-500 text-red-300 text-xs font-medium py-1.5 rounded-lg transition-all"
          >
            <span className="mx-auto">+ Ajouter une ligne</span>
          </button>
        </div>
      </div>

      {/* Section Nouvelle affectation */}
      <div className="border border-emerald-100 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Nouvelle affectation</p>
          <p className="text-[10px] text-emerald-500 mt-0.5">Factures à lettrer en remplacement</p>
        </div>
        <div className="px-4 py-3 space-y-3">
          {lignesPos.map(l => (
            <LigneSaisie
              key={l._key}
              ligne={l}
              onModifier={modifier}
              onSupprimer={key => supprimer(key, 'pos')}
              onNumeroChange={handleNumeroChange}
            />
          ))}
          <button
            onClick={ajouterPos}
            className="flex items-center gap-1.5 w-full border border-dashed border-emerald-200 hover:border-emerald-400/50 hover:text-emerald-600 text-emerald-300 text-xs font-medium py-1.5 rounded-lg transition-all"
          >
            <span className="mx-auto">+ Ajouter une ligne</span>
          </button>
        </div>
      </div>

      {/* Solde */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${equilibre && totalNeg > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex gap-6 text-xs">
          <span className="text-gray-500">À corriger : <strong className="text-red-500 tabular-nums">{fmt(totalNeg)}</strong></span>
          <span className="text-gray-500">À affecter : <strong className="text-emerald-600 tabular-nums">{fmt(totalPos)}</strong></span>
        </div>
        <span className={`text-[11px] font-semibold ${equilibre && totalNeg > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
          {equilibre && totalNeg > 0 ? '✓ Équilibré' : 'Non équilibré'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onFermer} disabled={chargement} className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 py-2.5 rounded-lg transition-colors disabled:opacity-40">
          Annuler
        </button>
        <button
          onClick={valider}
          disabled={!peutValider || chargement}
          className="flex-[2] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          {chargement ? <><span className="animate-spin text-xs">⏳</span> En cours…</> : '✓ Valider la correction'}
        </button>
      </div>
    </div>
  )
}

// ── Onglet Remboursement ───────────────────────────────────────────────────────
function OngletRemboursement({ onFermer, onSuccess }: { onFermer: () => void; onSuccess: () => void }) {
  const { utilisateur } = useAuth()
  const [numeroFacture, setNumeroFacture] = useState('')
  const [infoFacture, setInfoFacture] = useState<RowFacture | null>(null)
  const [chargementFacture, setChargementFacture] = useState(false)
  const [montant, setMontant] = useState('')
  const [chargement, setChargement] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  async function chercherFacture(numero: string) {
    if (numero.length < 4) { setInfoFacture(null); setChargementFacture(false); return }
    setChargementFacture(true)
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select('reste_du, montant_ttc, code_client, nom_client, statut_paiement')
      .eq('numero_piece', numero)
      .maybeSingle()
    const row = data as unknown as RowFacture | null
    setInfoFacture(row)
    if (row) setMontant(String(Math.abs(row.montant_ttc)))
    setChargementFacture(false)
  }

  function handleNumeroChange(value: string) {
    setNumeroFacture(value)
    setInfoFacture(null)
    setMontant('')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => chercherFacture(value), 400)
  }

  const montantNum = parseFloat(montant) || 0
  const peutValider = !!infoFacture && montantNum > 0 && !!numeroFacture.trim()

  async function valider() {
    if (!peutValider || !infoFacture) return
    setChargement(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('lettrages').insert({
        id_ligne_bancaire: null,
        numero_facture: numeroFacture.trim(),
        code_client: infoFacture.code_client,
        montant: -Math.round(montantNum * 100) / 100,
        date_lettrage: today,
        mode: 'remboursement',
        commentaire: `Remboursement — ${fmt(montantNum)}`,
        cree_par: utilisateur?.id ?? null,
        operateur: utilisateur?.email?.split('@')[0] ?? null,
      } as never)
      if (error) throw error
      toast.success('Remboursement enregistré.')
      onSuccess()
      onFermer()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du remboursement.')
    } finally {
      setChargement(false)
    }
  }

  return (
    <div className="px-6 py-5">
      <div className="flex items-start gap-3 bg-ockham-teal-muted border border-ockham-teal/40 rounded-lg px-4 py-3 mb-5 text-xs text-ockham-teal-dark">
        <span className="flex-shrink-0 mt-0.5 text-ockham-teal-dark"><IcRefund size={15} /></span>
        <span>
          Indiquez le numéro de facture remboursée. Le montant TTC est proposé automatiquement — ajustez si le remboursement est partiel.
          L'opération <strong>délettrera</strong> la facture du montant saisi.
        </span>
      </div>

      <div className="mb-4">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">N° de facture</label>
        <div className="relative">
          <input
            type="text"
            value={numeroFacture}
            onChange={e => handleNumeroChange(e.target.value)}
            placeholder="ex : 2026021254"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-ockham-teal pr-8"
          />
          {chargementFacture && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ockham-teal animate-pulse">⟳</span>}
        </div>
        {infoFacture && (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-emerald-600 font-medium">
            <span>✓ {infoFacture.nom_client ?? infoFacture.code_client}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">TTC : <strong>{fmt(infoFacture.montant_ttc)}</strong></span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">Restant : <strong className={infoFacture.reste_du > 0.005 ? 'text-amber-600' : 'text-gray-400'}>{fmt(infoFacture.reste_du)}</strong></span>
          </div>
        )}
        {!infoFacture && !chargementFacture && numeroFacture.length >= 4 && (
          <div className="mt-1 text-[11px] text-red-400">Facture introuvable</div>
        )}
      </div>

      <div className="mb-5">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Montant remboursé (€)</label>
        <input
          type="number"
          value={montant}
          onChange={e => setMontant(e.target.value)}
          placeholder="0,00"
          step="0.01"
          min="0"
          disabled={!infoFacture}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-right outline-none focus:border-ockham-teal disabled:bg-gray-50 disabled:text-gray-300"
        />
        {montantNum > 0 && (
          <p className="text-[11px] text-red-500 font-medium mt-1">
            − {fmt(montantNum)} sera déduit des lettrages de cette facture
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={onFermer} disabled={chargement} className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 py-2.5 rounded-lg transition-colors disabled:opacity-40">
          Annuler
        </button>
        <button
          onClick={valider}
          disabled={!peutValider || chargement}
          className="flex-[2] flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          {chargement ? <><span className="animate-spin text-xs">⏳</span> En cours…</> : <><IcRefund size={13} className="flex-shrink-0" /> Valider le remboursement</>}
        </button>
      </div>
    </div>
  )
}

// ── Modal principale ───────────────────────────────────────────────────────────
export function ModalCorrection() {
  const { ouvert, minimise, onglet, setOnglet, fermer, declencherOnSuccess } = useCorrectionContext()

  if (!ouvert || minimise) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) fermer() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* En-tête */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="text-base font-bold text-gray-900">Opération manuelle</h3>
          <button onClick={fermer} className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors">✕</button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-gray-100 sticky top-[73px] bg-white z-10">
          <button
            onClick={() => setOnglet('correction')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${onglet === 'correction' ? 'text-ockham-teal border-b-2 border-ockham-teal bg-ockham-teal-muted/30' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <span className="flex items-center justify-center gap-1.5"><IcEdit size={13} /> Correction</span>
          </button>
          <button
            onClick={() => setOnglet('remboursement')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${onglet === 'remboursement' ? 'text-red-600 border-b-2 border-red-600 bg-red-50/30' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <span className="flex items-center justify-center gap-1.5"><IcRefund size={13} /> Remboursement</span>
          </button>
        </div>

        {onglet === 'correction'
          ? <OngletCorrection onFermer={fermer} />
          : <OngletRemboursement onFermer={fermer} onSuccess={declencherOnSuccess} />
        }
      </div>
    </div>
  )
}
