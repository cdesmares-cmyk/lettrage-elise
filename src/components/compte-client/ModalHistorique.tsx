// Modal lecture seule — historique des lettrages d'une facture
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import type { FactureDetail, HistoriqueLettrage } from '../../types/client'
import { NumeroPiece } from '../NumeroPiece'
import { IcInfo } from '../Icones'

interface Props {
  facture: FactureDetail | null
  onFermer: () => void
  chargerHistorique: (numero: string) => Promise<HistoriqueLettrage[]>
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function ModalHistorique({ facture, onFermer, chargerHistorique }: Props) {
  const [lignes, setLignes] = useState<HistoriqueLettrage[]>([])
  const [chargement, setChargement] = useState(false)
  const [detailOuvert, setDetailOuvert] = useState<string | null>(null)

  function copierLigne(l: HistoriqueLettrage) {
    const lb = l.ligne_bancaire
    if (!lb) return
    const montant = lb.credit != null ? `Crédit : ${fmt(lb.credit)}` : lb.debit != null ? `Débit : ${fmt(lb.debit)}` : ''
    const texte = [
      `Règlement reçu le ${fmtDate(lb.date_operation)}`,
      `Libellé : ${lb.libelle}`,
      lb.infos_complementaires ? `Référence : ${lb.infos_complementaires}` : null,
      montant ? `Montant : ${montant}` : null,
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(texte).then(() => toast.success('Copié'))
  }

  useEffect(() => {
    if (!facture) { setLignes([]); return }
    setChargement(true)
    chargerHistorique(facture.numero_piece).then(data => {
      setLignes(data)
      setChargement(false)
    })
  }, [facture?.numero_piece])

  if (!facture) return null

  const total = lignes.reduce((s, l) => s + l.montant, 0)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><IcInfo size={13} /> Historique de paiement</h3>
            <NumeroPiece numero={facture.numero_piece} className="text-xs text-gray-400 mt-0.5 font-mono" />
          </div>
          <button onClick={onFermer} className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors">✕</button>
        </div>

        {/* Résumé facture */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-6 text-xs text-gray-600">
          <span>Montant TTC : <strong className="text-gray-900">{fmt(facture.montant_ttc)}</strong></span>
          <span>Lettrés : <strong className="text-emerald-600">{fmt(total)}</strong></span>
          <span>Restant : <strong className={facture.reste_du > 0.005 ? 'text-amber-600' : 'text-emerald-600'}>{fmt(facture.reste_du)}</strong></span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {chargement && <p className="text-center text-xs text-gray-400 py-8">Chargement…</p>}
          {!chargement && lignes.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-8">Aucune opération de lettrage enregistrée.</p>
          )}
          {!chargement && lignes.length > 0 && (
            <div className="space-y-2">
              {lignes.map(l => {
                const modeColor = l.mode === 'remboursement' ? 'bg-red-700' : l.mode === 'import' ? 'bg-violet-700' : 'bg-slate-700'
                const ouvert = detailOuvert === l.id
                const lb = l.ligne_bancaire
                return (
                  <div key={l.id} className={`border rounded-lg overflow-hidden transition-colors ${ouvert ? 'border-ockham-teal/40' : 'border-gray-100'}`}>
                    {/* Ligne principale */}
                    <div className={`flex items-center justify-between px-4 py-2.5 ${ouvert ? 'bg-ockham-teal-muted' : 'bg-gray-50'}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-gray-700">{fmtDate(l.date_lettrage)}</span>
                          <span className={`text-[10px] ${modeColor} text-white px-1.5 py-0.5 rounded font-semibold`}>{l.mode}</span>
                        </div>
                        {l.commentaire && <p className="text-[10px] text-gray-400 mt-0.5">{l.commentaire}</p>}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className={`text-sm font-bold tabular-nums ${l.montant < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(l.montant)}</span>
                        {lb && (
                          <button
                            onClick={() => setDetailOuvert(ouvert ? null : l.id)}
                            className={`text-[10px] font-semibold border px-2 py-1 rounded transition-colors flex items-center gap-1 ${ouvert ? 'text-ockham-teal border-ockham-teal/40' : 'text-gray-400 border-gray-200 hover:text-ockham-teal hover:border-ockham-teal/40'}`}
                          >
                            Détail {ouvert ? '▴' : '▾'}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Capsule détail */}
                    {ouvert && lb && (
                      <div className="border-t border-ockham-teal/20 px-4 py-3 bg-white space-y-1.5">
                        <div className="flex items-start gap-2.5 text-xs">
                          <span className="text-gray-400 w-28 flex-shrink-0">Date opération</span>
                          <span className="font-medium text-gray-800">{fmtDate(lb.date_operation)}</span>
                        </div>
                        <div className="flex items-start gap-2.5 text-xs">
                          <span className="text-gray-400 w-28 flex-shrink-0">Libellé</span>
                          <span className="font-medium text-gray-800">{lb.libelle}</span>
                        </div>
                        {lb.infos_complementaires && (
                          <div className="flex items-start gap-2.5 text-xs">
                            <span className="text-gray-400 w-28 flex-shrink-0">Référence</span>
                            <span className="font-medium text-gray-800">{lb.infos_complementaires}</span>
                          </div>
                        )}
                        <div className="flex items-start gap-2.5 text-xs">
                          <span className="text-gray-400 w-28 flex-shrink-0">Montant</span>
                          <span className={`font-bold ${lb.credit != null ? 'text-emerald-600' : 'text-red-500'}`}>
                            {lb.credit != null ? `Crédit : ${fmt(lb.credit)}` : lb.debit != null ? `Débit : ${fmt(lb.debit)}` : '—'}
                          </span>
                        </div>
                        <div className="pt-1.5 flex justify-end">
                          <button
                            onClick={() => copierLigne(l)}
                            className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 hover:text-ockham-teal border border-gray-200 hover:border-ockham-teal/40 px-2.5 py-1.5 rounded transition-colors"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                            Copier
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-5 pb-4">
          <button onClick={onFermer} className="w-full text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 py-2 rounded-lg transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
