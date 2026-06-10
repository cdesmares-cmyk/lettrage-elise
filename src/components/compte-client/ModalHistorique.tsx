// Modal lecture seule — historique des lettrages d'une facture
import { useState, useEffect } from 'react'
import type { FactureDetail, HistoriqueLettrage } from '../../types/client'
import { NumeroPiece } from '../NumeroPiece'

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
            <h3 className="text-sm font-bold text-gray-900">📋 Historique de paiement</h3>
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
                // Import avec label texte dans le commentaire → affiche le texte à la place de la date
                const estLabelImport = l.mode === 'import' && !!l.commentaire
                const dateOuLabel = estLabelImport ? l.commentaire! : fmtDate(l.date_lettrage)
                const modeColor = l.mode === 'remboursement' ? 'bg-red-700' : l.mode === 'import' ? 'bg-violet-700' : 'bg-slate-700'
                return (
                  <div key={l.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-4 py-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-gray-700">{dateOuLabel}</span>
                        <span className={`text-[10px] ${modeColor} text-white px-1.5 py-0.5 rounded font-semibold`}>{l.mode}</span>
                      </div>
                      {!estLabelImport && l.commentaire && <p className="text-[10px] text-gray-400 mt-0.5">{l.commentaire}</p>}
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${l.montant < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(l.montant)}</span>
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
