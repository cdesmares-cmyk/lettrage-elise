import type { KpisCompteClient } from '../../types/client'

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

interface Props { kpis: KpisCompteClient; chargement: boolean }

export function BarreKpis({ kpis, chargement }: Props) {
  const cls = chargement ? 'opacity-40 pointer-events-none' : ''
  const encoursBrut  = kpis.encoursTotalTtc
  const avoirs       = kpis.encoursTotalAvoirs
  const encoursNet   = Math.max(0, encoursBrut - avoirs)

  return (
    <div className={`grid gap-3 mb-5 ${cls}`} style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1fr' }}>

      {/* Hero — Encours Net */}
      <div
        className="rounded-xl border px-5 py-4 shadow-sm relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #fff 60%, #ECFDFB)', borderColor: '#CFEDE9' }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Encours Net</p>
        <p className="font-extrabold tabular-nums leading-tight" style={{ fontSize: 28, color: '#3BA89F' }}>
          {fmt(encoursNet)}
        </p>
        <p className="text-[11px] text-gray-400 mt-1.5">
          {avoirs > 0 ? `dont ${fmt(avoirs)} d'avoirs déduits` : 'encours brut · aucun avoir'}
        </p>
        <div style={{
          position: 'absolute', right: -30, top: -30,
          width: 130, height: 130, borderRadius: '50%',
          background: 'conic-gradient(#4CC5BB 0 200deg, #E5E7EB 200deg 360deg)',
          opacity: 0.12, pointerEvents: 'none',
        }} />
      </div>

      {/* Factures en attente */}
      <div className="bg-white border border-red-100 rounded-xl px-4 py-3 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Factures en attente</p>
        <p className="text-xl font-extrabold tabular-nums text-red-600">{kpis.nbFacturesAttente}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">pièces · restant dû &gt; 0</p>
      </div>

      {/* Avoirs non soldés */}
      <div className="bg-white border border-emerald-100 rounded-xl px-4 py-3 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Avoirs non soldés</p>
        <p className="text-xl font-extrabold tabular-nums text-emerald-600">{fmt(avoirs)}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">à déduire de l'encours</p>
      </div>

      {/* Portefeuille — diagonale clients / factures */}
      <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm relative overflow-hidden">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Portefeuille</p>
        {/* Haut gauche — clients */}
        <p className="text-xl font-extrabold tabular-nums text-gray-900">{kpis.nbClientsActifs}</p>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">clients actifs</p>
        {/* Bas droite — factures */}
        <div className="absolute bottom-3 right-4 text-right">
          <p className="text-base font-extrabold tabular-nums text-gray-400">{kpis.nbFacturesAttente}</p>
          <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-wide">factures</p>
        </div>
      </div>

    </div>
  )
}
