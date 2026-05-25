import { useMemo } from 'react'
import { useAppData } from '../../contexts/AppDataContext'
import type { Relance } from '../../hooks/useRelances'

function fmtEuros(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`
  if (n >= 10_000) return `${Math.round(n / 1_000)} k€`
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

const ETAPES = [
  { statut: 'envoyee',           label: 'Envoyée',        dotCls: 'bg-slate-400',   numCls: 'text-gray-800'    },
  { statut: 'repondue',          label: 'Contact établi', dotCls: 'bg-sky-400',     numCls: 'text-sky-700'     },
  { statut: 'promesse_paiement', label: 'Promesse',       dotCls: 'bg-amber-400',   numCls: 'text-amber-700'   },
  { statut: 'payee',             label: 'Payée',          dotCls: 'bg-emerald-500', numCls: 'text-emerald-700' },
] as const

interface Props {
  relances: Relance[]
  filtreOp: string
  chargement?: boolean
}

export function BarreKpisRelances({ relances, filtreOp, chargement }: Props) {
  const { facturesActives } = useAppData()
  const facturesMap = useMemo(() => new Map(facturesActives.map(f => [f.numero_piece, f])), [facturesActives])

  const { totalMontant, nbActives, etapes } = useMemo(() => {
    const actives = relances.filter(r =>
      !r.archivee &&
      r.statut !== 'brouillon' &&
      (filtreOp === 'tous' || r.operateur_id === filtreOp)
    )
    const totalMontant = actives.reduce((sum, r) =>
      sum + (r.factures_ids ?? []).reduce((s, id) => s + (facturesMap.get(id)?.reste_du ?? 0), 0), 0
    )
    const etapes = ETAPES.map(e => {
      const groupe = actives.filter(r => r.statut === e.statut)
      const montant = groupe.reduce((sum, r) =>
        sum + (r.factures_ids ?? []).reduce((s, id) => s + (facturesMap.get(id)?.reste_du ?? 0), 0), 0
      )
      return { ...e, nb: groupe.length, montant }
    })
    return { totalMontant, nbActives: actives.length, etapes }
  }, [relances, filtreOp, facturesMap])

  const cls = chargement ? 'opacity-40 pointer-events-none' : ''

  return (
    <div className={`grid gap-3 ${cls}`} style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr' }}>

      {/* Hero — Total relances € */}
      <div
        className="rounded-xl border px-5 py-4 shadow-sm relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #fff 60%, #ECFDFB)', borderColor: '#CFEDE9' }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Total relances actives</p>
        <p className="font-extrabold tabular-nums leading-tight" style={{ fontSize: 28, color: '#3BA89F' }}>
          {fmtEuros(totalMontant)}
        </p>
        <p className="text-[11px] text-gray-400 mt-1.5">{nbActives} relance{nbActives !== 1 ? 's' : ''} en cours</p>
        <div style={{
          position: 'absolute', right: -30, top: -30,
          width: 130, height: 130, borderRadius: '50%',
          background: 'conic-gradient(#4CC5BB 0 200deg, #E5E7EB 200deg 360deg)',
          opacity: 0.12, pointerEvents: 'none',
        }} />
      </div>

      {/* 4 blocs pipeline */}
      {etapes.map(e => (
        <div key={e.statut} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${e.dotCls}`} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{e.label}</p>
          </div>
          <p className={`text-xl font-extrabold tabular-nums ${e.numCls}`}>{e.nb}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{fmtEuros(e.montant)}</p>
        </div>
      ))}
    </div>
  )
}
