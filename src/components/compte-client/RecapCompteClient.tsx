// Récap flottant compte client — s'affiche dans l'espace libre à gauche du panneau Options
import { useState, useMemo } from 'react'
import { useAppData } from '../../contexts/AppDataContext'
import { NumeroPiece } from '../NumeroPiece'
import type { CompteClient } from '../../types/client'

const _fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const _today = new Date()

function anciennete(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((_today.getTime() - new Date(iso).getTime()) / 86_400_000)
}

function badgeAnc(j: number) {
  if (j <= 60) return 'bg-gray-100 text-gray-500'
  if (j <= 90) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

interface Props { client: CompteClient }

export function RecapCompteClient({ client }: Props) {
  const { facturesActives } = useAppData()
  const [impayeesDeveloppees, setImpayeesDeveloppees] = useState(true)
  const [regleesDeveloppees, setRegleesDeveloppees] = useState(false)

  const facturesClient = useMemo(() =>
    facturesActives.filter(f => f.code_client === client.code_dso),
    [facturesActives, client.code_dso]
  )

  const impayees = useMemo(() =>
    facturesClient.filter(f => {
      const estCompte = f.numero_piece.startsWith('411_')
      return !estCompte && !f.est_avoir && f.montant_ttc > 0 && f.reste_du > 0.005
    }),
    [facturesClient]
  )

  const reglees = useMemo(() =>
    facturesClient.filter(f => {
      const estCompte = f.numero_piece.startsWith('411_')
      return !estCompte && !f.est_avoir && f.montant_ttc > 0 && Math.abs(f.reste_du) <= 0.005
    }),
    [facturesClient]
  )

  const encoursTTC = useMemo(() =>
    impayees.reduce((sum, f) => sum + f.reste_du, 0),
    [impayees]
  )

  return (
    // Zone de centrage entre la sidebar (220px) et le panneau Options (380px)
    <div
      className="fixed top-0 bottom-0 z-[45] flex items-center justify-center p-5"
      style={{ left: 220, right: 380 }}
    >
      <div
        className="w-[680px] max-h-[72vh] bg-white rounded-2xl flex flex-col overflow-hidden transition-opacity duration-200"
        style={{ opacity: 0.87, boxShadow: '0 8px 32px rgba(14,26,43,0.13), 0 2px 8px rgba(14,26,43,0.06)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.97' }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.87' }}
      >
        {/* Header Navy compact */}
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0 bg-ockham-navy">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-500">{client.code_dso}</span>
            <span className="w-px h-3.5 bg-white/10 flex-shrink-0" />
            <span className="text-[13px] font-bold text-white/85 truncate max-w-[200px]">{client.nom}</span>
          </div>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Encours TTC</span>
            <span className="text-[15px] font-extrabold text-white tabular-nums">{_fmt.format(encoursTTC)} €</span>
            {impayees.length > 0 && (
              <span className="text-[10px] font-semibold text-red-400 ml-1">
                ● {impayees.length} impayée{impayees.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Colonnes */}
        <div
          className="grid px-5 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0"
          style={{ gridTemplateColumns: '1fr 100px 100px 52px' }}
        >
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">N° Facture</span>
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Montant TTC</span>
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Restant dû</span>
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider text-center">Âge</span>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">

          {/* Header section impayées — collapsible */}
          <button
            onClick={() => setImpayeesDeveloppees(v => !v)}
            className="w-full flex items-center gap-2 px-5 py-2 bg-red-50/50 hover:bg-red-50 border-b border-red-100/60 transition-colors cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-300 flex-shrink-0" />
            <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider flex-1 text-left">
              Impayées ({impayees.length})
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-300">
              {impayeesDeveloppees
                ? <polyline points="18 15 12 9 6 15" />
                : <polyline points="6 9 12 15 18 9" />
              }
            </svg>
          </button>

          {impayeesDeveloppees && (
            impayees.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-4">Aucune facture impayée.</p>
            ) : (
              impayees.map(f => (
                <div
                  key={f.numero_piece}
                  className="grid px-5 py-2.5 border-b border-red-50 items-center hover:bg-red-50/60 transition-colors"
                  style={{ gridTemplateColumns: '1fr 100px 100px 52px', background: 'rgba(254,242,242,0.28)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-300 flex-shrink-0" />
                    <NumeroPiece numero={f.numero_piece} className="text-[11px] text-ockham-teal-dark" />
                  </div>
                  <span className="text-[11px] text-gray-400 text-right tabular-nums">
                    {_fmt.format(f.montant_ttc)} €
                  </span>
                  <span className="text-[11px] font-bold text-red-600 text-right tabular-nums">
                    {_fmt.format(f.reste_du)} €
                  </span>
                  <div className="text-center">
                    {f.date_emission ? (
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${badgeAnc(anciennete(f.date_emission))}`}>
                        {anciennete(f.date_emission)}j
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                </div>
              ))
            )
          )}

          {/* Header section payées — collapsible, fermé par défaut */}
          {reglees.length > 0 && (
            <button
              onClick={() => setRegleesDeveloppees(v => !v)}
              className="w-full flex items-center gap-2 px-5 py-2 bg-gray-50 hover:bg-gray-100/70 border-t border-gray-100 transition-colors cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex-1 text-left">
                Payées ({reglees.length})
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
                {regleesDeveloppees
                  ? <polyline points="18 15 12 9 6 15" />
                  : <polyline points="6 9 12 15 18 9" />
                }
              </svg>
            </button>
          )}

          {regleesDeveloppees && reglees.map(f => (
            <div
              key={f.numero_piece}
              className="grid px-5 py-2 border-b border-gray-50 items-center hover:bg-gray-50 transition-colors"
              style={{ gridTemplateColumns: '1fr 100px 100px 52px', opacity: 0.55 }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.8' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.55' }}
            >
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-200 flex-shrink-0" />
                <NumeroPiece numero={f.numero_piece} className="text-[11px] text-gray-400" />
              </div>
              <span className="text-[11px] text-gray-400 text-right tabular-nums">
                {_fmt.format(f.montant_ttc)} €
              </span>
              <span className="text-[11px] text-gray-400 text-right tabular-nums">0,00 €</span>
              <div className="text-center">
                {f.date_emission ? (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
                    {anciennete(f.date_emission)}j
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
