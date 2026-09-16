// Modal compensation crédit — transfert du surpaiement d'une facture vers une autre facture du même client
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { FactureDetail } from '../../types/client'
import toast from 'react-hot-toast'

interface Props {
  fac: FactureDetail
  factures: FactureDetail[]
  onFermer: () => void
  onSuccess: () => void
}

const _fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmt(n: number) { return _fmt.format(n) + ' €' }

export function ModalCompensationCredit({ fac, factures, onFermer, onSuccess }: Props) {
  const { utilisateur } = useAuth()
  const creditDispo = Math.abs(fac.reste_du)

  const candidats = factures.filter(f =>
    !f.est_avoir &&
    f.reste_du > 0.005 &&
    f.numero_piece !== fac.numero_piece &&
    !f.numero_piece.startsWith('411_')
  ).sort((a, b) => b.reste_du - a.reste_du)

  const [destPiece, setDestPiece] = useState(candidats[0]?.numero_piece ?? '')
  const [montant, setMontant] = useState('')
  const [chargement, setChargement] = useState(false)

  const dest = candidats.find(c => c.numero_piece === destPiece) ?? null

  useEffect(() => {
    if (dest) setMontant(Math.min(creditDispo, dest.reste_du).toFixed(2))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destPiece])

  useEffect(() => {
    if (candidats[0]) setMontant(Math.min(creditDispo, candidats[0].reste_du).toFixed(2))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const montantNum   = parseFloat(montant) || 0
  const maxMontant   = dest ? Math.min(creditDispo, dest.reste_du) : creditDispo
  const peutValider  = dest !== null && montantNum > 0.004 && montantNum <= maxMontant + 0.005

  async function valider() {
    if (!peutValider || chargement) return
    setChargement(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('creer_compensation_atomique', {
        p_numero_source: fac.numero_piece,
        p_numero_dest:   destPiece,
        p_montant:       Math.round(montantNum * 100) / 100,
        p_cree_par:      utilisateur?.id ?? null,
        p_operateur:     utilisateur?.email?.split('@')[0] ?? null,
      })
      if (error) throw error
      toast.success('Compensation crédit enregistrée.')
      onSuccess()
      onFermer()
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? ''
      toast.error(msg || 'Erreur lors de la compensation.')
    } finally {
      setChargement(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onFermer} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ background: '#0E1A2B', borderBottom: '1px solid rgba(76,197,187,0.25)', borderRadius: '1rem 1rem 0 0' }}>
          <div>
            <p className="text-sm font-bold text-white">Compensation crédit</p>
            <p className="text-[10px] text-white/40 mt-0.5 font-mono">{fac.code_client} · {fmt(creditDispo)} disponibles</p>
          </div>
          <button onClick={onFermer}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-lg leading-none"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}>
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Source */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Facture source (surpayée)</p>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-ockham-teal bg-ockham-teal/5">
              <span className="font-mono text-sm font-bold text-ockham-teal-dark">{fac.numero_piece}</span>
              <span className="text-sm font-bold text-ockham-teal">{fmt(creditDispo)}</span>
            </div>
          </div>

          {/* Destination */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Facture destination</p>
            {candidats.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Aucune facture impayée sur ce compte.</p>
            ) : (
              <select value={destPiece} onChange={e => setDestPiece(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-ockham-teal bg-white transition-colors">
                {candidats.map(f => (
                  <option key={f.numero_piece} value={f.numero_piece}>
                    {f.numero_piece} — {fmt(f.reste_du)} dû
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Montant */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Montant à transférer
              {dest && <span className="text-gray-300 ml-2 font-normal normal-case tracking-normal">max {fmt(maxMontant)}</span>}
            </p>
            <div className="relative">
              <input type="number" min={0.01} max={maxMontant} step={0.01}
                value={montant}
                onChange={e => setMontant(e.target.value)}
                disabled={!dest}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal pr-8 disabled:bg-gray-50 disabled:text-gray-300 transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
            </div>
          </div>

          {/* Aperçu de l'impact */}
          {dest && peutValider && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Aperçu de l'impact</p>
              <div className="flex justify-between text-xs">
                <span className="font-mono text-gray-500">{fac.numero_piece}</span>
                <span className="font-mono">
                  <span className="text-gray-400">{fmt(fac.reste_du)}</span>
                  <span className="text-gray-300 mx-1">→</span>
                  <span className="font-semibold text-gray-700">{fmt(fac.reste_du + montantNum)}</span>
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-mono text-gray-500">{dest.numero_piece}</span>
                <span className="font-mono">
                  <span className="text-gray-400">{fmt(dest.reste_du)}</span>
                  <span className="text-gray-300 mx-1">→</span>
                  <span className="font-semibold text-gray-700">{fmt(dest.reste_du - montantNum)}</span>
                </span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between text-xs">
                <span className="text-gray-400">Impact net</span>
                <span className="font-semibold text-emerald-600">0,00 €</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onFermer} disabled={chargement}
            className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-xl hover:border-gray-300 transition-colors disabled:opacity-40">
            Annuler
          </button>
          <button onClick={valider} disabled={!peutValider || chargement || candidats.length === 0}
            className="flex-[2] text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#4CC5BB', color: '#fff' }}>
            {chargement ? 'Enregistrement…' : `Transférer${montantNum > 0.004 ? ` ${fmt(montantNum)}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
