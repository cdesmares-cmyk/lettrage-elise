// Modal de correction de lettrage : délettrage + relettering sans ligne bancaire
// + onglet Remboursement : insère un lettrage négatif sur une facture
import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import type { ClasseLettrage, InfoFacture } from '../../types/lettrage'

interface Props {
  ouvert: boolean
  onFermer: () => void
  onSuccess: () => void
}

interface LigneCorr {
  _key: string
  classe: ClasseLettrage
  numero_facture: string
  montant: string
  info_facture: InfoFacture | null
  chargement: boolean
}

interface RowFacture { reste_du: number; montant_ttc: number; code_client: string; nom_client: string | null; statut_paiement: string }

let _ck = 100
function cle() { return String(++_ck) }
const nouvelleLigne = (): LigneCorr => ({ _key: cle(), classe: 'facture', numero_facture: '', montant: '', info_facture: null, chargement: false })

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// ── Onglet Correction ──────────────────────────────────────────────────────────
function OngletCorrection({ onFermer, onSuccess }: { onFermer: () => void; onSuccess: () => void }) {
  const { utilisateur } = useAuth()
  const [lignes, setLignes] = useState<LigneCorr[]>([nouvelleLigne(), nouvelleLigne()])
  const [chargement, setChargement] = useState(false)
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function modifier(key: string, champ: Partial<LigneCorr>) {
    setLignes(prev => prev.map(l => l._key === key ? { ...l, ...champ } : l))
  }

  function ajouter() { setLignes(prev => [...prev, nouvelleLigne()]) }

  function supprimer(key: string) {
    setLignes(prev => prev.length > 1 ? prev.filter(l => l._key !== key) : prev)
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
    modifier(key, { chargement: false, info_facture: row as InfoFacture | null })
  }

  function handleNumeroChange(key: string, value: string) {
    modifier(key, { numero_facture: value, info_facture: null })
    clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => chercherFacture(key, value), 400)
  }

  const solde = Math.round(lignes.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
  const soldeNul = Math.abs(solde) < 0.01

  const peutValider = soldeNul && lignes.every(l => {
    const m = parseFloat(l.montant)
    if (!l.montant || isNaN(m) || m === 0) return false
    if (l.classe === 'facture') return !!l.info_facture
    return !!l.numero_facture.trim()
  })

  async function valider() {
    if (!peutValider) return
    setChargement(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const inserts = lignes.map(l => ({
        id_ligne_bancaire: null,
        numero_facture: l.numero_facture.trim(),
        code_client: l.classe === 'autres' ? 'AUTRES' : (l.info_facture?.code_client ?? ''),
        montant: Math.round(parseFloat(l.montant) * 100) / 100,
        date_lettrage: today,
        mode: 'manuel' as const,
        commentaire: `Correction — ${parseFloat(l.montant) < 0 ? 'délettrage' : 'relettering'}`,
        cree_par: utilisateur?.id ?? null,
        operateur: utilisateur?.email?.split('@')[0] ?? null,
      }))
      const { error } = await supabase.from('lettrages').insert(inserts as never)
      if (error) throw error
      toast.success('Correction enregistrée.')
      onSuccess()
      onFermer()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la correction.')
    } finally {
      setChargement(false)
    }
  }

  return (
    <div className="px-6 py-5">
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 text-xs text-amber-800">
        <span className="flex-shrink-0 mt-0.5">⚠️</span>
        <span>
          Ajoutez une ligne <strong>négative</strong> (délettrage) puis une ligne <strong>positive</strong> (relettering).
          Le solde total doit être nul pour pouvoir valider.
        </span>
      </div>

      <div className="space-y-3 mb-3">
        {lignes.map(ligne => {
          const m = parseFloat(ligne.montant) || 0
          const isNeg = m < 0
          const isPos = m > 0
          return (
            <div key={ligne._key}>
              <div className="grid grid-cols-[80px_1fr_80px_60px_24px] gap-2 items-center">
                <div className="relative">
                  <select
                    value={ligne.classe}
                    onChange={e => modifier(ligne._key, { classe: e.target.value as ClasseLettrage })}
                    className="w-full border border-gray-200 rounded-md pl-2 pr-5 py-1.5 text-xs text-gray-700 bg-white outline-none focus:border-ockham-teal appearance-none cursor-pointer"
                  >
                    <option value="facture">Facture</option>
                    <option value="autres">Autres</option>
                  </select>
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[9px]">▾</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={ligne.numero_facture}
                    onChange={e => handleNumeroChange(ligne._key, e.target.value)}
                    placeholder={ligne.classe === 'autres' ? 'Description…' : 'N° facture'}
                    className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs font-mono outline-none focus:border-ockham-teal pr-5"
                  />
                  {ligne.chargement && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ockham-teal animate-pulse">⟳</span>}
                </div>
                <input
                  type="number"
                  value={ligne.montant}
                  onChange={e => modifier(ligne._key, { montant: e.target.value })}
                  placeholder="0,00"
                  step="0.01"
                  className="border border-gray-200 rounded-md px-2 py-1.5 text-xs text-right font-mono outline-none focus:border-ockham-teal"
                />
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-center ${isNeg ? 'bg-red-100 text-red-600' : isPos ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                  {isNeg ? '−' : isPos ? '+' : '±'}
                </span>
                <button onClick={() => supprimer(ligne._key)} className="w-6 h-6 rounded-full border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 text-sm flex items-center justify-center transition-colors">×</button>
              </div>
              {ligne.classe === 'facture' && ligne.info_facture && (
                <div className="mt-1 ml-[88px] text-[10px] text-emerald-600 font-medium">
                  ✓ {ligne.info_facture.nom_client ?? ligne.info_facture.code_client}
                </div>
              )}
              {ligne.classe === 'facture' && !ligne.info_facture && !ligne.chargement && ligne.numero_facture.length >= 4 && (
                <div className="mt-1 ml-[88px] text-[10px] text-red-400">Facture introuvable</div>
              )}
            </div>
          )
        })}
      </div>

      <button onClick={ajouter} className="flex items-center gap-1.5 w-full border border-dashed border-gray-200 hover:border-ockham-teal/40 hover:text-ockham-teal text-gray-400 text-xs font-medium py-2 rounded-lg transition-all mb-4">
        <span className="mx-auto">+ Ajouter une ligne</span>
      </button>

      <div className={`flex items-center justify-between px-4 py-3 rounded-lg border mb-4 ${soldeNul ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div>
          <p className="text-xs text-gray-500">Solde de l'opération</p>
          <p className={`text-[11px] font-medium mt-0.5 ${soldeNul ? 'text-emerald-600' : 'text-amber-600'}`}>
            {soldeNul ? '✓ Équilibré — prêt à valider' : 'Le solde doit être nul pour valider'}
          </p>
        </div>
        <span className={`text-lg font-bold tabular-nums ${soldeNul ? 'text-emerald-600' : 'text-amber-600'}`}>
          {solde >= 0 ? '+' : ''}{fmt(solde)}
        </span>
      </div>

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
        <span className="flex-shrink-0 mt-0.5">💸</span>
        <span>
          Indiquez le numéro de facture remboursée. Le montant TTC est proposé automatiquement — ajustez si le remboursement est partiel.
          L'opération <strong>délettrera</strong> la facture du montant saisi.
        </span>
      </div>

      {/* N° facture */}
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

      {/* Montant */}
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
          {chargement ? <><span className="animate-spin text-xs">⏳</span> En cours…</> : '💸 Valider le remboursement'}
        </button>
      </div>
    </div>
  )
}

// ── Modal principale ───────────────────────────────────────────────────────────
export function ModalCorrection({ ouvert, onFermer, onSuccess }: Props) {
  const [onglet, setOnglet] = useState<'correction' | 'remboursement'>('correction')

  useEffect(() => {
    if (!ouvert) setOnglet('correction')
  }, [ouvert])

  if (!ouvert) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        {/* En-tête */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Opération manuelle</h3>
          <button onClick={onFermer} className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors">✕</button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setOnglet('correction')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${onglet === 'correction' ? 'text-ockham-teal border-b-2 border-ockham-teal bg-ockham-teal-muted/30' : 'text-gray-400 hover:text-gray-600'}`}
          >
            ✏️ Correction
          </button>
          <button
            onClick={() => setOnglet('remboursement')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${onglet === 'remboursement' ? 'text-red-600 border-b-2 border-red-600 bg-red-50/30' : 'text-gray-400 hover:text-gray-600'}`}
          >
            💸 Remboursement
          </button>
        </div>

        {onglet === 'correction'
          ? <OngletCorrection onFermer={onFermer} onSuccess={onSuccess} />
          : <OngletRemboursement onFermer={onFermer} onSuccess={onSuccess} />
        }
      </div>
    </div>
  )
}
