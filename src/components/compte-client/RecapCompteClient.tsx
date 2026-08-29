// Récap flottant compte client — s'affiche dans l'espace libre à gauche du panneau Options
import { useState, useMemo, useCallback } from 'react'
import { useAppData } from '../../contexts/AppDataContext'
import { supabase } from '../../lib/supabase'
import { NumeroPiece } from '../NumeroPiece'
import type { CompteClient, FactureDetail } from '../../types/client'

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

function estCompte(f: FactureDetail) { return f.numero_piece.startsWith('411_') }
function estAvoir(f: FactureDetail)  { return f.est_avoir || f.montant_ttc < 0 }
function estPayee(f: FactureDetail)  { return !estCompte(f) && !estAvoir(f) && Math.abs(f.reste_du) <= 0.005 }

function BadgeLigne({ f }: { f: FactureDetail }) {
  if (estCompte(f)) return (
    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-ockham-teal-dark text-white flex-shrink-0">C</span>
  )
  if (estAvoir(f)) return (
    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-orange-100 text-orange-700 flex-shrink-0">A</span>
  )
  return (
    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-ockham-teal-muted text-ockham-teal flex-shrink-0">F</span>
  )
}

function LigneFac({ f, opaque = false }: { f: FactureDetail; opaque?: boolean }) {
  const anc = anciennete(f.date_emission)
  const estSolde = Math.abs(f.reste_du) <= 0.005
  const estNegatif = f.reste_du < -0.005
  const resteCls = estSolde
    ? 'text-gray-300'
    : estNegatif
    ? 'text-ockham-teal font-bold'
    : 'text-red-600 font-bold'

  return (
    <div
      className="grid px-4 py-2 border-b border-gray-50 items-center transition-colors hover:bg-gray-50/80"
      style={{
        gridTemplateColumns: '28px 1fr 90px 90px 46px',
        opacity: opaque ? 0.55 : 1,
      }}
      onMouseEnter={e => { if (opaque) (e.currentTarget as HTMLDivElement).style.opacity = '0.82' }}
      onMouseLeave={e => { if (opaque) (e.currentTarget as HTMLDivElement).style.opacity = '0.55' }}
    >
      <div className="flex items-center justify-center">
        <BadgeLigne f={f} />
      </div>
      <div className="min-w-0 pl-1.5">
        <NumeroPiece numero={f.numero_piece} className="text-[11px] text-ockham-teal-dark" />
      </div>
      <span className="text-[11px] text-gray-400 text-right tabular-nums">{_fmt.format(f.montant_ttc)} €</span>
      <span className={`text-[11px] text-right tabular-nums ${resteCls}`}>{_fmt.format(f.reste_du)} €</span>
      <div className="text-center">
        {f.date_emission
          ? <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${badgeAnc(anc)}`}>{anc}j</span>
          : <span className="text-gray-300">—</span>
        }
      </div>
    </div>
  )
}

interface Props { client: CompteClient }

export function RecapCompteClient({ client }: Props) {
  const { facturesActives } = useAppData()
  const [payeesDeveloppees, setPayeesDeveloppees] = useState(false)
  const [payeesData, setPayeesData] = useState<FactureDetail[]>([])
  const [payeesChargees, setPayeesChargees] = useState(false)
  const [payeesChargement, setPayeesChargement] = useState(false)

  const facturesClient = useMemo(() =>
    facturesActives.filter(f => f.code_client === client.code_dso),
    [facturesActives, client.code_dso]
  )

  // Lignes visibles par défaut : 411, avoirs, factures impayées
  const visibles = useMemo(() =>
    facturesClient.filter(f => !estPayee(f)),
    [facturesClient]
  )

  const encoursTTC = useMemo(() =>
    facturesClient.reduce((sum, f) => sum + (f.reste_du > 0 ? f.reste_du : 0), 0),
    [facturesClient]
  )

  const nbImpayees = useMemo(() =>
    facturesClient.filter(f => !estCompte(f) && !estAvoir(f) && f.reste_du > 0.005).length,
    [facturesClient]
  )

  const chargerPayees = useCallback(async () => {
    if (payeesChargees) return
    setPayeesChargement(true)
    const { data, error } = await supabase
      .from('v_factures_avec_reste_du')
      .select('numero_piece,code_client,nom_client,date_emission,date_echeance,montant_ht,montant_ttc,reste_du,statut_paiement,statut_facture,est_avoir')
      .eq('code_client', client.code_dso)
      .gte('reste_du', -0.005)
      .lte('reste_du', 0.005)
      .eq('est_avoir', false)
      .order('date_emission', { ascending: false })

    if (!error) {
      const rows = (data as unknown as FactureDetail[]) ?? []
      setPayeesData(rows.filter(f => !estCompte(f)))
      setPayeesChargees(true)
    }
    setPayeesChargement(false)
  }, [client.code_dso, payeesChargees])

  async function togglePayees() {
    if (!payeesChargees) await chargerPayees()
    setPayeesDeveloppees(v => !v)
  }

  return (
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
            {nbImpayees > 0 && (
              <span className="text-[10px] font-semibold text-red-400 ml-1">
                ● {nbImpayees} impayée{nbImpayees > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Colonnes */}
        <div
          className="grid px-4 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0"
          style={{ gridTemplateColumns: '28px 1fr 90px 90px 46px' }}
        >
          <span />
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider pl-1.5">N° Facture</span>
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Montant TTC</span>
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Restant dû</span>
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider text-center">Âge</span>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">

          {/* Lignes visibles — 411 + avoirs + impayées */}
          {visibles.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-6">Aucune ligne active.</p>
          ) : (
            visibles.map(f => <LigneFac key={f.numero_piece} f={f} />)
          )}

          {/* Header payées — collapsible, chargement à la demande */}
          <button
            onClick={togglePayees}
            className="w-full flex items-center gap-2 px-5 py-2 bg-gray-50 hover:bg-gray-100/70 border-t border-gray-100 transition-colors cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex-1 text-left">
              {payeesChargees ? `Payées (${payeesData.length})` : 'Payées'}
              {payeesChargement && ' …'}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
              {payeesDeveloppees
                ? <polyline points="18 15 12 9 6 15" />
                : <polyline points="6 9 12 15 18 9" />
              }
            </svg>
          </button>

          {payeesDeveloppees && payeesData.map(f => <LigneFac key={f.numero_piece} f={f} opaque />)}
        </div>
      </div>
    </div>
  )
}
