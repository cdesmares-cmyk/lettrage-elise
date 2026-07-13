// Modal de correction de lettrage : délettrage + relettering sans ligne bancaire
// + onglet Remboursement : déclaration multi-factures en deux temps (déclarer → affecter débit)
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { IcEdit, IcRefund, IcCheck, IcLoader, IcX, IcClock } from '../Icones'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCorrectionContext } from '../../contexts/CorrectionContext'
import type { LigneCorr } from '../../contexts/CorrectionContext'
import { useRemboursements } from '../../hooks/useRemboursements'
import type { RemboursementLigneForm } from '../../hooks/useRemboursements'
import toast from 'react-hot-toast'
import type { InfoFacture } from '../../types/lettrage'

interface RowFacture { reste_du: number; montant_ttc: number; code_client: string; nom_client: string | null; statut_paiement: string }

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

function nouvelleLigneSimple(): LigneCorr {
  return { _key: String(Date.now() + Math.random()), classe: 'facture', numero_facture: '', montant: '', info_facture: null, chargement: false }
}

// ── Onglet Correction ──────────────────────────────────────────────────────────
function OngletCorrection({ onFermer }: { onFermer: () => void }) {
  const { utilisateur } = useAuth()
  const { lignesCorrection, setLignesCorrection, minimiser, declencherOnSuccess } = useCorrectionContext()
  const navigate = useNavigate()
  const [chargement, setChargement] = useState(false)
  const [exportWarnings, setExportWarnings] = useState<Set<string>>(new Set())
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function ajouter() {
    setLignesCorrection(prev => [...prev, nouvelleLigneSimple()])
  }
  function supprimer(key: string) {
    if (lignesCorrection.length <= 1) return
    setLignesCorrection(prev => prev.filter(l => l._key !== key))
  }
  function modifier(key: string, champ: Partial<LigneCorr>) {
    setLignesCorrection(prev => prev.map(l => l._key === key ? { ...l, ...champ } : l))
  }

  async function chercherFacture(key: string, numero: string) {
    if (numero.length < 4) { modifier(key, { info_facture: null, chargement: false }); return }
    modifier(key, { chargement: true })
    const [{ data }, { data: expData }] = await Promise.all([
      supabase
        .from('v_factures_avec_reste_du')
        .select('reste_du, montant_ttc, code_client, nom_client, statut_paiement')
        .eq('numero_piece', numero)
        .maybeSingle(),
      supabase
        .from('lettrages')
        .select('id')
        .eq('numero_facture', numero)
        .eq('annule', false)
        .not('export_id', 'is', null)
        .limit(1),
    ])
    const row = data as unknown as RowFacture | null
    modifier(key, { chargement: false, info_facture: row as InfoFacture | null })
    setExportWarnings(prev => {
      const s = new Set(prev)
      if (row && expData?.length) s.add(key); else s.delete(key)
      return s
    })
  }

  function handleNumeroChange(key: string, value: string) {
    modifier(key, { numero_facture: value, info_facture: null, montant: '' })
    setExportWarnings(prev => { const s = new Set(prev); s.delete(key); return s })
    clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => chercherFacture(key, value), 400)
  }

  const total = Math.round(lignesCorrection.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
  const equilibre = Math.abs(total) < 0.01
  const hasNeg = lignesCorrection.some(l => (parseFloat(l.montant) || 0) < 0)
  const hasPos = lignesCorrection.some(l => (parseFloat(l.montant) || 0) > 0)

  const toutesValides = lignesCorrection.every(l => {
    const m = parseFloat(l.montant)
    return !!l.numero_facture.trim() && !!l.info_facture && !isNaN(m) && m !== 0
  })
  const peutValider = equilibre && hasNeg && hasPos && toutesValides

  async function valider() {
    if (!peutValider) return
    setChargement(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const lignesNeg = lignesCorrection.filter(l => (parseFloat(l.montant) || 0) < 0)
      const lignesPos = lignesCorrection.filter(l => (parseFloat(l.montant) || 0) > 0)

      type SourceInfo = { id_ligne_bancaire: string; montant: number; proportion: number }
      const sourceMap = new Map<string, SourceInfo[]>()

      for (const neg of lignesNeg) {
        const numero = neg.numero_facture.trim()
        const { data } = await supabase
          .from('lettrages')
          .select('id_ligne_bancaire, montant')
          .eq('numero_facture', numero)
          .eq('annule', false)
          .gt('montant', 0)
          .not('id_ligne_bancaire', 'is', null)
        const sources = ((data ?? []) as { id_ligne_bancaire: string | null; montant: number }[])
          .filter((r): r is { id_ligne_bancaire: string; montant: number } =>
            !!r.id_ligne_bancaire && !r.id_ligne_bancaire.endsWith('-C')
          )
        const tot = sources.reduce((s, r) => s + r.montant, 0)
        sourceMap.set(numero, sources.map(s => ({
          id_ligne_bancaire: s.id_ligne_bancaire,
          montant: s.montant,
          proportion: tot > 0 ? s.montant / tot : 1 / sources.length,
        })))
      }

      const seenIds = new Set<string>()
      const allSources: SourceInfo[] = []
      for (const sources of sourceMap.values()) {
        for (const src of sources) {
          if (!seenIds.has(src.id_ligne_bancaire)) { seenIds.add(src.id_ligne_bancaire); allSources.push(src) }
        }
      }
      const totalAll = allSources.reduce((s, src) => s + src.montant, 0)
      const globalSources: SourceInfo[] = allSources.map(src => ({
        ...src, proportion: totalAll > 0 ? src.montant / totalAll : 1 / allSources.length,
      }))

      const correctionId = crypto.randomUUID()

      type InsertRow = {
        id_ligne_bancaire: string | null; numero_facture: string | null; code_client: string
        montant: number; date_lettrage: string; mode: string; correction_id: string | null
        commentaire: string | null; cree_par: string | null; operateur: string | null
      }

      function makeRow(l: LigneCorr, montant: number, idLigne: string | null): InsertRow {
        return {
          id_ligne_bancaire: idLigne,
          numero_facture: l.numero_facture.trim(),
          code_client: l.info_facture?.code_client ?? '',
          montant: Math.round(montant * 100) / 100,
          date_lettrage: today,
          mode: 'correction',
          correction_id: correctionId,
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
        inserts.push(...splitAcross(m, sourceMap.get(l.numero_facture.trim()) ?? [], l))
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
          className="text-xs text-ockham-teal hover:text-ockham-teal-dark border border-ockham-teal/30 hover:border-ockham-teal/60 bg-ockham-teal-muted hover:bg-ockham-teal-muted/80 px-3 py-1.5 rounded-lg transition-colors font-medium"
        >
          Identifier vos factures
        </button>
      </div>

      {/* Aide */}
      <p className="text-[11px] text-gray-400">
        Montant <span className="font-semibold text-red-400">négatif</span> = retrait d'affectation · Montant <span className="font-semibold text-ockham-teal">positif</span> = nouvelle affectation. Le total doit être égal à <strong>0</strong>.
      </p>

      {/* Liste unifiée */}
      <div className="border border-gray-200 rounded-xl px-4 py-3 space-y-3">
        {lignesCorrection.map(l => {
          const m = parseFloat(l.montant)
          const isNeg = !isNaN(m) && m < 0
          const isPos = !isNaN(m) && m > 0
          const { statut_paiement } = l.info_facture ?? {}
          return (
            <div key={l._key} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`flex-shrink-0 w-20 text-center text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border ${
                  isNeg ? 'bg-red-50 text-red-400 border-red-200' :
                  isPos ? 'bg-ockham-teal/5 text-ockham-teal border-ockham-teal/30' :
                  'bg-gray-50 text-gray-300 border-gray-200'
                }`}>
                  {isNeg ? 'Retrait' : isPos ? 'Affectation' : '—'}
                </span>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={l.numero_facture}
                    onChange={e => handleNumeroChange(l._key, e.target.value)}
                    placeholder="N° facture"
                    className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs font-mono outline-none focus:border-ockham-teal pr-5"
                  />
                  {l.chargement && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-ockham-teal"><IcLoader size={10} /></span>
                  )}
                </div>
                <input
                  type="number"
                  value={l.montant}
                  onChange={e => modifier(l._key, { montant: e.target.value })}
                  placeholder="0,00"
                  step="0.01"
                  className={`w-24 flex-shrink-0 border rounded-md px-2 py-1.5 text-xs text-right font-mono outline-none ${
                    isNeg ? 'border-red-200 text-red-500 focus:border-red-400' :
                    isPos ? 'border-ockham-teal/30 text-ockham-teal focus:border-ockham-teal' :
                    'border-gray-200 text-gray-700 focus:border-ockham-teal'
                  }`}
                />
                <button
                  onClick={() => supprimer(l._key)}
                  disabled={lignesCorrection.length <= 1}
                  className="w-6 h-6 rounded-full border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                ><IcX size={11} /></button>
              </div>
              {/* Info facture */}
              {l.info_facture && (
                <div className="pl-[88px] flex items-center gap-2 flex-wrap">
                  <p className="text-[10px] text-emerald-600 font-medium">
                    ✓ {l.info_facture.nom_client ?? l.info_facture.code_client}
                    {' · '}TTC : {fmt(Math.abs(l.info_facture.montant_ttc))}
                    {' · '}Solde : {fmt(l.info_facture.reste_du)}
                  </p>
                  {statut_paiement === 'paye' && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 border border-gray-200">Soldée</span>
                  )}
                  {statut_paiement === 'partiel' && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-500 border border-orange-200">Partielle</span>
                  )}
                  {statut_paiement === 'impaye' && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-400 border border-red-200">Impayée</span>
                  )}
                </div>
              )}
              {/* Avertissement export verrouillé */}
              {exportWarnings.has(l._key) && (
                <p className="pl-[88px] text-[10px] text-amber-600">
                  ⚠ Des lettrages de cette facture sont dans un export verrouillé — votre correction sera incluse dans le prochain export.
                </p>
              )}
              {!l.info_facture && !l.chargement && l.numero_facture.length >= 4 && (
                <p className="pl-[88px] text-[10px] text-red-400">Facture introuvable</p>
              )}
            </div>
          )
        })}
        <button
          onClick={ajouter}
          className="flex items-center gap-1.5 w-full border border-dashed border-gray-200 hover:border-ockham-teal/40 hover:text-ockham-teal text-gray-300 text-xs font-medium py-1.5 rounded-lg transition-all"
        >
          <span className="mx-auto">+ Ajouter une ligne</span>
        </button>
      </div>

      {/* Solde */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${equilibre && hasNeg && hasPos ? 'bg-ockham-teal-muted border-ockham-teal/30' : 'bg-gray-50 border-gray-200'}`}>
        <span className="text-xs text-gray-500">
          Total : <strong className={`tabular-nums ${total < 0 ? 'text-red-500' : total > 0 ? 'text-ockham-teal' : 'text-gray-700'}`}>
            {total > 0 ? '+' : ''}{fmt(total)}
          </strong>
        </span>
        <span className={`text-[11px] font-semibold ${equilibre && hasNeg && hasPos ? 'text-ockham-teal' : 'text-gray-400'}`}>
          {equilibre && hasNeg && hasPos ? '✓ Équilibré' : 'Non équilibré'}
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
          className="flex-[2] flex items-center justify-center gap-2 bg-ockham-navy hover:bg-ockham-navy/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          {chargement ? <><IcLoader size={13} /> En cours…</> : <><IcCheck size={13} /> Valider la correction</>}
        </button>
      </div>
    </div>
  )
}

// ── Ligne de saisie facture pour remboursement ────────────────────────────────
function LigneRemb({
  ligne,
  onModifier,
  onSupprimer,
  onNumeroChange,
  peutSupprimer,
}: {
  ligne: RemboursementLigneForm
  onModifier: (key: string, champ: Partial<RemboursementLigneForm>) => void
  onSupprimer: (key: string) => void
  onNumeroChange: (key: string, value: string) => void
  peutSupprimer: boolean
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
            className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs font-mono outline-none focus:border-red-400 pr-5"
          />
          {ligne.chargement && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-400"><IcLoader size={10} /></span>
          )}
        </div>
        <input
          type="number"
          value={ligne.montant}
          onChange={e => onModifier(ligne._key, { montant: e.target.value })}
          placeholder="0,00"
          step="0.01"
          min="0"
          disabled={!ligne.info_facture}
          className="w-24 flex-shrink-0 border border-gray-200 rounded-md px-2 py-1.5 text-xs text-right font-mono outline-none focus:border-red-400 disabled:bg-gray-50 disabled:text-gray-300"
        />
        <button
          onClick={() => onSupprimer(ligne._key)}
          disabled={!peutSupprimer}
          className="w-6 h-6 rounded-full border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
        ><IcX size={11} /></button>
      </div>
      {ligne.info_facture && (
        <p className="mt-1 text-[10px] text-emerald-600 font-medium">
          ✓ {ligne.info_facture.nom_client ?? ligne.info_facture.code_client}
          {' · '}TTC : {fmt(Math.abs(ligne.info_facture.montant_ttc))}
        </p>
      )}
      {!ligne.info_facture && !ligne.chargement && ligne.numero_facture.length >= 4 && (
        <p className="mt-1 text-[10px] text-red-400">Facture introuvable</p>
      )}
    </div>
  )
}

function nouvelleLigneRemb(): RemboursementLigneForm {
  return { _key: `remb-${Date.now() + Math.random()}`, numero_facture: '', montant: '', code_client: '', info_facture: null, chargement: false }
}

// ── Onglet Remboursement ───────────────────────────────────────────────────────
function OngletRemboursement({ onFermer, onSuccess }: { onFermer: () => void; onSuccess: () => void }) {
  const remb = useRemboursements(onSuccess)
  const [lignes, setLignes] = useState<RemboursementLigneForm[]>([nouvelleLigneRemb()])
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => { remb.charger() }, [])

  async function chercherFacture(key: string, numero: string) {
    if (numero.length < 4) {
      setLignes(prev => prev.map(l => l._key === key ? { ...l, info_facture: null, chargement: false } : l))
      return
    }
    setLignes(prev => prev.map(l => l._key === key ? { ...l, chargement: true } : l))
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select('reste_du, montant_ttc, code_client, nom_client, statut_paiement')
      .eq('numero_piece', numero)
      .maybeSingle()
    const row = data as unknown as RowFacture | null
    setLignes(prev => prev.map(l => l._key === key ? {
      ...l,
      chargement: false,
      info_facture: row ? { montant_ttc: row.montant_ttc, code_client: row.code_client, nom_client: row.nom_client } : null,
      code_client: row?.code_client ?? '',
      montant: row ? String(Math.abs(row.montant_ttc)) : l.montant,
    } : l))
  }

  function handleNumeroChange(key: string, value: string) {
    setLignes(prev => prev.map(l => l._key === key ? { ...l, numero_facture: value, info_facture: null, code_client: '', montant: '' } : l))
    clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => chercherFacture(key, value), 400)
  }

  function modifier(key: string, champ: Partial<RemboursementLigneForm>) {
    setLignes(prev => prev.map(l => l._key === key ? { ...l, ...champ } : l))
  }

  function ajouterLigne() {
    setLignes(prev => [...prev, nouvelleLigneRemb()])
  }

  function supprimerLigne(key: string) {
    setLignes(prev => prev.filter(l => l._key !== key))
  }

  const lignesValides = lignes.every(l => {
    const m = parseFloat(l.montant)
    return !!l.numero_facture.trim() && !!l.info_facture && !isNaN(m) && m > 0
  })
  const totalRemb = lignes.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0)
  const peutDeclarer = lignesValides && lignes.length > 0 && !remb.chargement

  async function handleDeclarer() {
    if (!peutDeclarer) return
    try {
      await remb.declarer(lignes.map(l => ({
        numero_facture: l.numero_facture.trim(),
        code_client: l.code_client,
        montant: Math.round((parseFloat(l.montant) || 0) * 100) / 100,
      })))
      toast.success('Remboursement déclaré — en attente d\'affectation à une ligne Débit')
      setLignes([nouvelleLigneRemb()])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la déclaration.')
    }
  }

  async function handleAnnuler(id: string) {
    try {
      await remb.annuler(id)
      toast.success('Remboursement annulé — le restant dû a été restauré')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'annulation.')
    }
  }

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Info */}
      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">
        <IcRefund size={14} className="flex-shrink-0 mt-0.5" />
        <span>
          Déclarez ici le(s) remboursement(s) à effectuer. Le restant dû des factures concernées augmente immédiatement.
          La validation comptable interviendra une fois la <strong>ligne Débit bancaire</strong> associée à ce remboursement.
        </span>
      </div>

      {/* Formulaire de déclaration */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 border-l-4 border-l-red-400">
          <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Nouveau remboursement</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Facture(s) concernée(s) + montant remboursé</p>
        </div>
        <div className="px-4 py-3 space-y-3 border-l-4 border-l-red-100">
          {lignes.map(l => (
            <LigneRemb
              key={l._key}
              ligne={l}
              onModifier={modifier}
              onSupprimer={supprimerLigne}
              onNumeroChange={handleNumeroChange}
              peutSupprimer={lignes.length > 1}
            />
          ))}
          <button
            onClick={ajouterLigne}
            className="flex items-center gap-1.5 w-full border border-dashed border-gray-200 hover:border-red-300 hover:text-red-500 text-gray-300 text-xs font-medium py-1.5 rounded-lg transition-all"
          >
            <span className="mx-auto">+ Ajouter une facture</span>
          </button>
        </div>
      </div>

      {/* Total + bouton */}
      {totalRemb > 0 && (
        <p className="text-[11px] text-red-500 font-medium text-right">
          Total remboursé : <strong>{fmt(totalRemb)}</strong> — sera déduit du restant dû
        </p>
      )}

      <button
        onClick={handleDeclarer}
        disabled={!peutDeclarer}
        className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
      >
        {remb.chargement ? <><IcLoader size={13} /> En cours…</> : <><IcRefund size={13} /> Déclarer le remboursement</>}
      </button>

      <button onClick={onFermer} className="w-full text-xs font-medium text-gray-400 hover:text-gray-600 py-1 transition-colors">
        Fermer
      </button>

      {/* Remboursements en attente */}
      {remb.enAttente.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            En attente d'affectation ({remb.enAttente.length})
          </p>
          <div className="space-y-2">
            {remb.enAttente.map(r => (
              <div key={r.id} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    {r.lignes.map(l => (
                      <div key={l.id} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-gray-600">{l.numero_facture}</span>
                        <span className="text-gray-400">·</span>
                        <span className="font-semibold text-red-600">−{fmt(l.montant)}</span>
                        <span className="text-[10px] text-gray-400">{l.code_client}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-amber-600 mt-1">
                      En attente d'une ligne Débit bancaire — cliquez sur le Débit dans la vue Lettrage
                    </p>
                  </div>
                  <button
                    onClick={() => handleAnnuler(r.id)}
                    className="text-[10px] font-semibold text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-1 rounded transition-colors flex-shrink-0"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Onglet Historique des corrections ────────────────────────────────────────
interface LigneCorrigee { id: string; numero_facture: string | null; montant: number; export_id: string | null }
interface CorrectionGroupe {
  correction_id: string; date_lettrage: string; operateur: string | null
  lignes: LigneCorrigee[]; verrouillee: boolean
}

function OngletHistoriqueCorrections() {
  const [corrections, setCorrections] = useState<CorrectionGroupe[]>([])
  const [chargement, setChargement] = useState(true)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [motif, setMotif] = useState('')
  const [annulationEnCours, setAnnulationEnCours] = useState(false)

  async function charger() {
    setChargement(true)
    const { data } = await supabase
      .from('lettrages')
      .select('id, correction_id, numero_facture, montant, date_lettrage, operateur, export_id')
      .eq('mode', 'correction')
      .eq('annule', false)
      .not('correction_id', 'is', null)
      .order('date_lettrage', { ascending: false })
      .order('correction_id')
    setChargement(false)
    if (!data) return
    type RawRow = { id: string; correction_id: string; numero_facture: string | null; montant: number; date_lettrage: string; operateur: string | null; export_id: string | null }
    const rows = data as RawRow[]
    const groupMap = new Map<string, CorrectionGroupe>()
    for (const r of rows) {
      if (!groupMap.has(r.correction_id)) {
        groupMap.set(r.correction_id, { correction_id: r.correction_id, date_lettrage: r.date_lettrage, operateur: r.operateur, lignes: [], verrouillee: false })
      }
      const g = groupMap.get(r.correction_id)!
      g.lignes.push({ id: r.id, numero_facture: r.numero_facture, montant: r.montant, export_id: r.export_id })
      if (r.export_id) g.verrouillee = true
    }
    setCorrections([...groupMap.values()])
  }

  useEffect(() => { charger() }, [])

  async function handleAnnuler(corrId: string) {
    setAnnulationEnCours(true)
    try {
      const { error } = await supabase
        .from('lettrages')
        .update({ annule: true, motif_annulation: motif || null })
        .eq('correction_id', corrId)
        .eq('annule', false)
      if (error) throw error
      toast.success('Correction annulée — les soldes ont été restaurés')
      setConfirmId(null)
      setMotif('')
      await charger()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setAnnulationEnCours(false)
    }
  }

  if (chargement) return <div className="px-6 py-10 text-center text-sm text-gray-400">Chargement…</div>

  if (corrections.length === 0) return (
    <div className="px-6 py-10 text-center text-sm text-gray-400">Aucune correction enregistrée.</div>
  )

  return (
    <div className="px-6 py-5 space-y-3">
      {corrections.map(corr => (
        <div key={corr.correction_id} className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                {fmtDate(corr.date_lettrage)}
              </p>
              {corr.operateur && <span className="text-[10px] text-gray-400">· {corr.operateur}</span>}
              {corr.verrouillee && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">Export verrouillé</span>
              )}
            </div>
            {!corr.verrouillee && (
              confirmId === corr.correction_id
                ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={motif}
                      onChange={e => setMotif(e.target.value)}
                      placeholder="Motif (optionnel)"
                      className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-red-300 w-36"
                    />
                    <button
                      onClick={() => handleAnnuler(corr.correction_id)}
                      disabled={annulationEnCours}
                      className="text-[10px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                    >
                      {annulationEnCours ? '…' : 'Confirmer'}
                    </button>
                    <button
                      onClick={() => { setConfirmId(null); setMotif('') }}
                      className="text-[10px] text-gray-400 hover:text-gray-600 px-1 py-1 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                )
                : (
                  <button
                    onClick={() => setConfirmId(corr.correction_id)}
                    className="text-[10px] font-semibold text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-1 rounded transition-colors"
                  >
                    Annuler la correction
                  </button>
                )
            )}
          </div>
          <div className="px-4 py-2.5 space-y-1.5">
            {corr.lignes.map(l => {
              const isNeg = l.montant < 0
              return (
                <div key={l.id} className="flex items-center gap-2 text-xs">
                  <span className={`flex-shrink-0 w-20 text-center text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border ${
                    isNeg ? 'bg-red-50 text-red-400 border-red-200' : 'bg-ockham-teal/5 text-ockham-teal border-ockham-teal/30'
                  }`}>
                    {isNeg ? 'Retrait' : 'Affectation'}
                  </span>
                  <span className="font-mono text-gray-700 flex-1">{l.numero_facture ?? '—'}</span>
                  <span className={`font-mono font-semibold tabular-nums ${isNeg ? 'text-red-500' : 'text-ockham-teal'}`}>
                    {l.montant > 0 ? '+' : ''}{fmt(l.montant)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Modal principale ───────────────────────────────────────────────────────────
export function ModalCorrection() {
  const { ouvert, minimise, onglet, setOnglet, fermer, declencherOnSuccess } = useCorrectionContext()

  if (!ouvert || minimise) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* En-tête */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="text-base font-bold text-gray-900">Corriger un lettrage</h3>
          <button onClick={fermer} className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 flex items-center justify-center transition-colors"><IcX size={13} /></button>
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
          <button
            onClick={() => setOnglet('historique')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${onglet === 'historique' ? 'text-gray-700 border-b-2 border-gray-500 bg-gray-50/60' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <span className="flex items-center justify-center gap-1.5"><IcClock size={13} /> Historique</span>
          </button>
        </div>

        {onglet === 'correction' && <OngletCorrection onFermer={fermer} />}
        {onglet === 'remboursement' && <OngletRemboursement onFermer={fermer} onSuccess={declencherOnSuccess} />}
        {onglet === 'historique' && <OngletHistoriqueCorrections />}
      </div>
    </div>
  )
}
