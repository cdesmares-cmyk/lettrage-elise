import { useMemo } from 'react'
import { useAppData } from '../../contexts/AppDataContext'
import type { Relance } from '../../hooks/useRelances'

function fmtMontant(n: number) {
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
}

export function PipelineRelances({ relances, filtreOp }: Props) {
  const { facturesActives } = useAppData()
  const facturesMap = useMemo(() => new Map(facturesActives.map(f => [f.numero_piece, f])), [facturesActives])

  const stats = useMemo(() => {
    const actives = relances.filter(r =>
      !r.archivee &&
      r.statut !== 'brouillon' &&
      (filtreOp === 'tous' || r.operateur_id === filtreOp)
    )
    return ETAPES.map(e => {
      const groupe = actives.filter(r => r.statut === e.statut)
      const montant = groupe.reduce((sum, r) =>
        sum + (r.factures_ids ?? []).reduce((s, id) => s + (facturesMap.get(id)?.reste_du ?? 0), 0), 0
      )
      return { ...e, nb: groupe.length, montant }
    })
  }, [relances, filtreOp, facturesMap])

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {stats.map((e, i) => (
        <div key={e.statut} className={`px-5 py-4 flex flex-col gap-2 ${i < 3 ? 'border-r border-gray-100' : ''}`}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${e.dotCls}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{e.label}</span>
          </div>
          <p className={`text-[26px] font-extrabold tabular-nums leading-none ${e.numCls}`}>{e.nb}</p>
          <p className="text-[11px] text-gray-400 tabular-nums">{fmtMontant(e.montant)}</p>
        </div>
      ))}
    </div>
  )
}
