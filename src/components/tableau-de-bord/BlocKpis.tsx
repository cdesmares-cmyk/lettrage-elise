import type { useDashboard, SeuilAnciennete } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

const _fmtNb   = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }
function fmtNb(n: number)   { return _fmtNb.format(n) }

function dsoConfig(dso: number): { classe: string; label: string; couleurGauge: string } {
  if (dso <= 30) return { classe: 'text-emerald-600', label: 'Excellent',  couleurGauge: '#10b981' }
  if (dso <= 45) return { classe: 'text-ockham-teal', label: 'Bon',        couleurGauge: '#4CC5BB' }
  if (dso <= 60) return { classe: 'text-amber-600',   label: 'Attention',  couleurGauge: '#f59e0b' }
  return              { classe: 'text-red-600',       label: 'Critique',   couleurGauge: '#ef4444' }
}

const SEUILS: SeuilAnciennete[] = [3, 6, 12, 18, 24]

interface KpiCardProps {
  titre: string
  valeur: React.ReactNode
  sous?: React.ReactNode
  footer?: React.ReactNode
  accentBorder?: string
}

function KpiCard({ titre, valeur, sous, footer, accentBorder = 'border-gray-100' }: KpiCardProps) {
  return (
    <div className={`bg-white border ${accentBorder} rounded-xl shadow-sm px-5 py-4 flex flex-col gap-1`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{titre}</span>
      <div className="text-2xl font-bold tabular-nums text-gray-900 leading-tight">{valeur}</div>
      {sous   && <div className="text-xs text-gray-500 leading-snug">{sous}</div>}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  )
}

export function BlocKpis({
  nbImpayeesEchues, nbClientsEchus, dsoRoulant,
  exclureDernierMois, moisExclusLabel,
  montantMoisPrec, montantAnPrec,
  montantSeuilMois, seuilAnciennete, setSeuilAnciennete,
  libelleMoisPrec, libelleMoisAnPrec,
}: Props) {

  const dso = dsoRoulant ?? 0
  const cfg = dsoConfig(dso)
  const gaugeWidth = Math.min(100, Math.round((dso / 90) * 100))

  return (
    <div className="space-y-3">
      {/* Ligne 1 */}
      <div className="grid grid-cols-3 gap-3">

        <KpiCard
          titre="Factures impayées échues"
          accentBorder={nbImpayeesEchues > 0 ? 'border-red-100' : 'border-gray-100'}
          valeur={
            <span className={nbImpayeesEchues > 0 ? 'text-red-600' : 'text-gray-900'}>
              {fmtNb(nbImpayeesEchues)}
            </span>
          }
          sous="Factures avec échéance dépassée"
        />

        <KpiCard
          titre={`Impayés — ${libelleMoisPrec} (M-1)`}
          accentBorder={montantMoisPrec > 0 ? 'border-amber-100' : 'border-gray-100'}
          valeur={
            <span className={montantMoisPrec > 0 ? 'text-amber-700' : 'text-gray-400'}>
              {fmtEuro(montantMoisPrec)}
            </span>
          }
          sous="Factures du mois précédent encore ouvertes"
        />

        {/* DSO — card hero */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-5 py-4 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">DSO roulant — 12 mois</span>
          {dsoRoulant !== null ? (
            <>
              <div className={`text-3xl font-bold tabular-nums leading-tight ${cfg.classe}`}>
                {dsoRoulant.toFixed(1)}<span className="text-lg ml-1">j</span>
              </div>
              <div className={`text-xs font-semibold ${cfg.classe}`}>{cfg.label}</div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${gaugeWidth}%`, background: cfg.couleurGauge }} />
              </div>
              <div className="flex justify-between text-[9px] text-gray-300 mt-0.5">
                <span>0j</span><span>45j</span><span>90j</span>
              </div>
            </>
          ) : (
            <span className="text-2xl font-bold text-gray-300">—</span>
          )}
        </div>

      </div>

      {/* Ligne 2 */}
      <div className="grid grid-cols-3 gap-3">

        <KpiCard
          titre="Clients avec impayés échus"
          accentBorder={nbClientsEchus > 0 ? 'border-amber-100' : 'border-gray-100'}
          valeur={
            <span className={nbClientsEchus > 0 ? 'text-amber-600' : 'text-gray-400'}>
              {fmtNb(nbClientsEchus)}
            </span>
          }
          sous={exclureDernierMois && moisExclusLabel ? `Hors ${moisExclusLabel}` : 'Clients distincts concernés'}
        />

        <KpiCard
          titre={`Impayés — ${libelleMoisAnPrec} (N-1)`}
          valeur={
            <span className={montantAnPrec > 0 ? 'text-amber-700' : 'text-gray-400'}>
              {fmtEuro(montantAnPrec)}
            </span>
          }
          sous="Même mois l'année passée, encore ouvertes"
        />

        <KpiCard
          titre={`Impayés — +${seuilAnciennete} mois`}
          accentBorder={montantSeuilMois > 0 ? 'border-red-100' : 'border-gray-100'}
          valeur={
            <span className={montantSeuilMois > 0 ? 'text-red-700' : 'text-gray-400'}>
              {fmtEuro(montantSeuilMois)}
            </span>
          }
          sous="Factures émises il y a plus de X mois encore non soldées"
          footer={
            <div className="flex gap-1">
              {SEUILS.map(s => (
                <button
                  key={s}
                  onClick={() => setSeuilAnciennete(s)}
                  className={`text-[11px] font-semibold px-2 py-1 rounded-md transition-colors ${
                    seuilAnciennete === s
                      ? 'bg-ockham-navy text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  +{s}m
                </button>
              ))}
            </div>
          }
        />

      </div>
    </div>
  )
}
