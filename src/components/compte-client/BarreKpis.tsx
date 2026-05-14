// KPIs dynamiques en haut du module Compte Client
import type { KpisCompteClient } from '../../types/client'

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

interface Props { kpis: KpisCompteClient; chargement: boolean }

export function BarreKpis({ kpis, chargement }: Props) {
  const cls = chargement ? 'opacity-40 pointer-events-none' : ''
  return (
    <div className={`grid grid-cols-5 gap-3 mb-5 ${cls}`}>
      <Kpi label="Clients actifs" valeur={String(kpis.nbClientsActifs)} sous="avec encours > 0" />
      <Kpi label="Encours factures TTC" valeur={fmt(kpis.encoursTotalTtc)} couleur="warning" />
      <Kpi label="Avoirs non soldés" valeur={fmt(kpis.encoursTotalAvoirs)} sous="à déduire de l'encours" couleur="credit" />
      <Kpi label="Factures en attente" valeur={String(kpis.nbFacturesAttente)} sous="restant dû > 0" couleur="danger" />
      <KpiDso dso={kpis.dsoRoulant} />
    </div>
  )
}

function classDso(dso: number): { txt: string; label: string } {
  if (dso <= 30) return { txt: 'text-emerald-600', label: 'Excellent' }
  if (dso <= 45) return { txt: 'text-ockham-teal', label: 'Bon' }
  if (dso <= 60) return { txt: 'text-amber-600', label: 'Attention' }
  return { txt: 'text-red-600', label: 'Critique' }
}

function KpiDso({ dso }: { dso: number | null }) {
  const cls = dso !== null ? classDso(dso) : null
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">DSO roulant — 12 mois</p>
      {dso !== null && cls ? (
        <>
          <p className={`text-xl font-bold tabular-nums tracking-tight ${cls.txt}`}>{dso.toFixed(1)}j</p>
          <p className={`text-[11px] font-semibold mt-0.5 ${cls.txt}`}>{cls.label}</p>
        </>
      ) : (
        <p className="text-xl font-bold tabular-nums tracking-tight text-gray-300">—</p>
      )}
    </div>
  )
}

function Kpi({ label, valeur, sous, couleur }: { label: string; valeur: string; sous?: string; couleur?: 'warning' | 'danger' | 'credit' }) {
  const valCls = couleur === 'danger' ? 'text-red-600' : couleur === 'warning' ? 'text-amber-600' : couleur === 'credit' ? 'text-emerald-600' : 'text-gray-900'
  const borderCls = couleur === 'credit' ? 'border-emerald-100' : 'border-gray-200'
  return (
    <div className={`bg-white border ${borderCls} rounded-xl px-4 py-3 shadow-sm`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums tracking-tight ${valCls}`}>{valeur}</p>
      {sous && <p className="text-[11px] text-gray-400 mt-0.5">{sous}</p>}
    </div>
  )
}
