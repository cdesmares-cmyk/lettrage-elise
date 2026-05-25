import type { KpisCompteClient } from '../../types/client'

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

interface Props { kpis: KpisCompteClient; chargement: boolean }

export function BarreKpis({ kpis, chargement }: Props) {
  const cls = chargement ? 'opacity-40 pointer-events-none' : ''
  return (
    <div className={`grid gap-3 mb-5 ${cls}`} style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr' }}>
      {/* Hero — Encours total */}
      <div
        className="rounded-xl border px-5 py-4 shadow-sm relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #fff 60%, #ECFDFB)', borderColor: '#CFEDE9' }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Encours total TTC</p>
        <p className="font-extrabold tabular-nums leading-tight" style={{ fontSize: 28, color: '#3BA89F' }}>
          {fmt(kpis.encoursTotalTtc)}
        </p>
        <p className="text-[11px] text-gray-400 mt-1.5">
          {kpis.nbClientsActifs} clients actifs
          {kpis.dsoRoulant !== null && ` · DSO ${kpis.dsoRoulant.toFixed(1)}j`}
        </p>
        {/* Anneau décoratif */}
        <div style={{
          position: 'absolute', right: -30, top: -30,
          width: 130, height: 130, borderRadius: '50%',
          background: 'conic-gradient(#4CC5BB 0 200deg, #E5E7EB 200deg 360deg)',
          opacity: 0.12, pointerEvents: 'none',
        }} />
      </div>

      <Kpi label="Clients actifs" valeur={String(kpis.nbClientsActifs)} sous="avec encours > 0" />
      <Kpi label="Factures en attente" valeur={String(kpis.nbFacturesAttente)} sous="restant dû > 0" couleur="danger" />
      <Kpi label="Avoirs non soldés" valeur={fmt(kpis.encoursTotalAvoirs)} sous="à déduire de l'encours" couleur="credit" />
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
    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">DSO roulant</p>
      {dso !== null && cls ? (
        <>
          <p className={`text-xl font-extrabold tabular-nums ${cls.txt}`}>{dso.toFixed(1)}j</p>
          <p className={`text-[11px] font-semibold mt-0.5 ${cls.txt}`}>{cls.label} · 12 mois</p>
        </>
      ) : (
        <p className="text-xl font-bold tabular-nums text-gray-300">—</p>
      )}
    </div>
  )
}

function Kpi({ label, valeur, sous, couleur }: { label: string; valeur: string; sous?: string; couleur?: 'warning' | 'danger' | 'credit' }) {
  const valCls = couleur === 'danger' ? 'text-red-600' : couleur === 'credit' ? 'text-emerald-600' : 'text-gray-900'
  const borderCls = couleur === 'credit' ? 'border-emerald-100' : couleur === 'danger' ? 'border-red-100' : 'border-gray-100'
  return (
    <div className={`bg-white border ${borderCls} rounded-xl px-4 py-3 shadow-sm`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-extrabold tabular-nums ${valCls}`}>{valeur}</p>
      {sous && <p className="text-[11px] text-gray-400 mt-0.5">{sous}</p>}
    </div>
  )
}
