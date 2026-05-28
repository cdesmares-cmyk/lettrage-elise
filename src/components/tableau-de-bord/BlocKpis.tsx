import type { useDashboard, SeuilAnciennete } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

const _fmtNb   = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const _fmtK    = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }
function fmtNb(n: number)   { return _fmtNb.format(n) }
function fmtK(n: number)    { return n >= 1000 ? _fmtK.format(n / 1000) + ' k€' : _fmtEuro.format(n) + ' €' }

function dsoConfig(dso: number) {
  if (dso <= 30) return { texte: 'text-emerald-600', bg: '#ECFDF5', border: '#A7F3D0', label: 'Excellent',  jauge: '#10b981' }
  if (dso <= 45) return { texte: 'text-ockham-teal', bg: '#ECFDFB', border: '#CFEDE9', label: 'Bon',        jauge: '#4CC5BB' }
  if (dso <= 60) return { texte: 'text-amber-600',   bg: '#FFFBEB', border: '#FDE68A', label: 'Attention',  jauge: '#f59e0b' }
  return              { texte: 'text-red-600',       bg: '#FEF2F2', border: '#FECACA', label: 'Critique',   jauge: '#ef4444' }
}

const SEUILS: SeuilAnciennete[] = [3, 6, 12, 18, 24]

const SPARK_HEIGHTS = [62, 68, 72, 74, 70, 65, 60, 54, 50, 48, 44, 40]

export function BlocKpis({
  nbImpayeesEchues, nbClientsEchus, dsoRoulant,
  exclureDernierMois, moisExclusLabel,
  montantMoisPrec, montantAnPrec,
  montantSeuilMois, seuilAnciennete, setSeuilAnciennete,
  libelleMoisPrec, libelleMoisAnPrec,
  encoursCourant, balanceAgee,
}: Props) {
  const dso = dsoRoulant ?? 0
  const cfg = dsoConfig(dso)
  const gaugeWidth = dsoRoulant !== null ? Math.min(100, Math.round((dso / 90) * 100)) : 0
  const montantCritique = balanceAgee.find(t => t.label === '+90j')?.montant ?? 0

  return (
    <div className="space-y-3">

      {/* Ligne 1 — DSO hero (2fr) + Factures échues + Clients échus + Encours total */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>

        {/* DSO Hero */}
        <div
          className="rounded-2xl border px-6 py-5 flex flex-col gap-3 relative overflow-hidden shadow-sm"
          style={{ background: `linear-gradient(135deg, #fff 55%, ${cfg.bg})`, borderColor: cfg.border }}
        >
          {/* Anneau décoratif */}
          <div style={{
            position: 'absolute', right: -40, top: -40,
            width: 180, height: 180, borderRadius: '50%',
            background: `conic-gradient(${cfg.jauge} 0 ${gaugeWidth * 3.6}deg, #E5E7EB ${gaugeWidth * 3.6}deg 360deg)`,
            opacity: 0.15, pointerEvents: 'none'
          }} />

          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">
            DSO roulant — 12 mois
          </span>

          {dsoRoulant !== null ? (
            <>
              <div className="flex items-baseline gap-3 relative z-10">
                <span className={`font-extrabold tabular-nums leading-none ${cfg.texte}`} style={{ fontSize: 44 }}>
                  {dsoRoulant.toFixed(1)}<span style={{ fontSize: 22, marginLeft: 4 }}>j</span>
                </span>
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: cfg.bg, color: cfg.jauge, border: `1px solid ${cfg.border}` }}
                >
                  {cfg.label}
                </span>
              </div>

              {/* Jauge */}
              <div className="relative z-10 space-y-1">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${gaugeWidth}%`, background: cfg.jauge }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-gray-300">
                  <span>0j</span><span>45j</span><span>90j+</span>
                </div>
              </div>

              {/* Sparkline */}
              <div className="flex items-flex-end gap-0.5 relative z-10" style={{ height: 28 }}>
                {SPARK_HEIGHTS.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{ height: `${h}%`, alignSelf: 'flex-end', background: cfg.jauge, opacity: 0.4 + i * 0.05 }}
                  />
                ))}
              </div>
            </>
          ) : (
            <span className="text-4xl font-bold text-gray-300">—</span>
          )}
        </div>

        {/* Factures impayées échues */}
        <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 flex flex-col gap-2 ${nbImpayeesEchues > 0 ? 'border-red-100' : 'border-gray-100'}`}>
          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">Factures impayées échues</span>
          <span className={`font-extrabold tabular-nums leading-tight ${nbImpayeesEchues > 0 ? 'text-red-600' : 'text-gray-900'}`} style={{ fontSize: 26 }}>
            {fmtNb(nbImpayeesEchues)}
          </span>
          <span className="text-[11px] text-gray-400 leading-snug">Échéance dépassée</span>
          {exclureDernierMois && moisExclusLabel && (
            <span className="text-[10px] text-gray-400 mt-auto">Hors {moisExclusLabel}</span>
          )}
        </div>

        {/* Clients avec impayés */}
        <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 flex flex-col gap-2 ${nbClientsEchus > 0 ? 'border-amber-100' : 'border-gray-100'}`}>
          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">Clients avec impayés échus</span>
          <span className={`font-extrabold tabular-nums leading-tight ${nbClientsEchus > 0 ? 'text-amber-600' : 'text-gray-400'}`} style={{ fontSize: 26 }}>
            {fmtNb(nbClientsEchus)}
          </span>
          <span className="text-[11px] text-gray-400 leading-snug">Clients distincts concernés</span>
        </div>

        {/* Encours total */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">Encours total TTC</span>
          <span className="font-extrabold tabular-nums leading-tight text-gray-900" style={{ fontSize: 22 }}>
            {fmtK(encoursCourant)}
          </span>
          <span className="text-[11px] text-gray-400 leading-snug">Toutes factures ouvertes</span>
        </div>

      </div>

      {/* Ligne 2 — M-1, N-1, +X mois, Créances critiques */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>

        <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 flex flex-col gap-2 ${montantMoisPrec > 0 ? 'border-amber-100' : 'border-gray-100'}`}>
          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">
            Impayés (hors avoirs) — {libelleMoisPrec}
          </span>
          <span className={`font-extrabold tabular-nums leading-tight ${montantMoisPrec > 0 ? 'text-amber-700' : 'text-gray-400'}`} style={{ fontSize: 22 }}>
            {fmtEuro(montantMoisPrec)}
          </span>
          <span className="text-[11px] text-gray-400">Restant dû à ce jour</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">
            Impayés (hors avoirs) — {libelleMoisAnPrec}
          </span>
          <span className={`font-extrabold tabular-nums leading-tight ${montantAnPrec > 0 ? 'text-amber-700' : 'text-gray-400'}`} style={{ fontSize: 22 }}>
            {fmtEuro(montantAnPrec)}
          </span>
          <span className="text-[11px] text-gray-400">Restant dû à ce jour</span>
        </div>

        <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 flex flex-col gap-2 ${montantSeuilMois > 0 ? 'border-red-100' : 'border-gray-100'}`}>
          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">
            Impayés — +{seuilAnciennete} mois
          </span>
          <span className={`font-extrabold tabular-nums leading-tight ${montantSeuilMois > 0 ? 'text-red-700' : 'text-gray-400'}`} style={{ fontSize: 22 }}>
            {fmtEuro(montantSeuilMois)}
          </span>
          <span className="text-[11px] text-gray-400">Anciennes créances à traiter en priorité</span>
          <div className="mt-auto pt-1">
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {SEUILS.map(s => (
                <button
                  key={s}
                  onClick={() => setSeuilAnciennete(s)}
                  className={`text-[11px] font-bold px-2 py-1 rounded-md transition-colors ${
                    seuilAnciennete === s
                      ? 'bg-white text-red-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  +{s}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Créances critiques > 90j */}
        <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 flex flex-col gap-2 ${montantCritique > 0 ? 'border-red-100' : 'border-gray-100'}`}>
          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">Créances critiques</span>
          <span className={`font-extrabold tabular-nums leading-tight ${montantCritique > 0 ? 'text-red-700' : 'text-gray-400'}`} style={{ fontSize: 22 }}>
            {fmtEuro(montantCritique)}
          </span>
          <span className="text-[11px] text-gray-400">Retard supérieur à 90 jours</span>
        </div>

      </div>
    </div>
  )
}
