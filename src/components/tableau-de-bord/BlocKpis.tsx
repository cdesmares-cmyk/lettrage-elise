// Blocs 1 et 2 — 6 KPI cards sur 2 lignes
import type { useDashboard, SeuilAnciennete } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

const _fmtNb = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }
function fmtNb(n: number) { return _fmtNb.format(n) }

function classeDso(dso: number): string {
  if (dso <= 30) return 'text-emerald-600'
  if (dso <= 45) return 'text-ockham-teal'
  if (dso <= 60) return 'text-amber-600'
  return 'text-red-600'
}
function labelDso(dso: number): string {
  if (dso <= 30) return 'Excellent'
  if (dso <= 45) return 'Bon'
  if (dso <= 60) return 'Attention'
  return 'Critique'
}

const SEUILS: SeuilAnciennete[] = [3, 6, 12, 18, 24]

interface KpiCardProps {
  titre: string
  valeur: React.ReactNode
  sous?: React.ReactNode
  footer?: React.ReactNode
  accent?: string
}

function KpiCard({ titre, valeur, sous, footer, accent = 'border-gray-100 dark:border-slate-700' }: KpiCardProps) {
  return (
    <div className={`bg-white dark:bg-slate-800 border ${accent} rounded-xl shadow-sm px-5 py-4 flex flex-col gap-1`}>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-ockham-navy dark:text-ockham-teal-light">{titre}</span>
      <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100 leading-tight">{valeur}</div>
      {sous && <div className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{sous}</div>}
      {footer && <div className="mt-1">{footer}</div>}
    </div>
  )
}

export function BlocKpis({
  nbImpayeesEchues, nbClientsEchus, dsoRoulant,
  exclureDernierMois, setExclureDernierMois, moisExclusLabel,
  montantMoisPrec, montantAnPrec,
  montantSeuilMois, seuilAnciennete, setSeuilAnciennete,
  libelleMoisPrec, libelleMoisAnPrec,
}: Props) {

  return (
    <div className="space-y-3">
      {/* Ligne 1 — Factures échues | M-1 | DSO */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          titre="Factures impayées échues"
          accent={nbImpayeesEchues > 0 ? 'border-red-100 dark:border-red-900/40' : undefined}
          valeur={
            <span className={nbImpayeesEchues > 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}>
              {fmtNb(nbImpayeesEchues)}
            </span>
          }
          sous="Factures avec échéance dépassée (J+15 si absente)"
          footer={
            moisExclusLabel ? (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={exclureDernierMois}
                  onChange={e => setExclureDernierMois(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-ockham-teal"
                />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  Exclure <span className="font-semibold text-gray-700 dark:text-gray-300">{moisExclusLabel}</span>
                </span>
              </label>
            ) : null
          }
        />

        <KpiCard
          titre={`Impayés — ${libelleMoisPrec} (M-1)`}
          accent={montantMoisPrec > 0 ? 'border-amber-100 dark:border-amber-900/40' : undefined}
          valeur={
            <span className={montantMoisPrec > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}>
              {fmtEuro(montantMoisPrec)}
            </span>
          }
          sous="Factures du mois précédent (vs dernier mois importé) encore ouvertes"
        />

        <KpiCard
          titre="DSO roulant — 12 mois"
          valeur={
            dsoRoulant !== null ? (
              <span className={classeDso(dsoRoulant)}>{dsoRoulant}j</span>
            ) : <span className="text-gray-400 dark:text-gray-600">—</span>
          }
          sous={
            dsoRoulant !== null ? (
              <span className={`font-semibold ${classeDso(dsoRoulant)}`}>{labelDso(dsoRoulant)}</span>
            ) : 'Données insuffisantes'
          }
          footer={
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              (Encours TTC ÷ CA TTC 12 mois) × 365
            </span>
          }
        />
      </div>

      {/* Ligne 2 — Clients échus | N-1 | +X mois */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          titre="Clients avec impayés échus"
          accent={nbClientsEchus > 0 ? 'border-amber-100 dark:border-amber-900/40' : undefined}
          valeur={
            <span className={nbClientsEchus > 0 ? 'text-amber-600' : 'text-gray-400 dark:text-gray-600'}>
              {fmtNb(nbClientsEchus)}
            </span>
          }
          sous={exclureDernierMois && moisExclusLabel ? `Hors ${moisExclusLabel}` : 'Clients distincts concernés'}
        />

        <KpiCard
          titre={`Impayés — ${libelleMoisAnPrec} (N-1)`}
          valeur={
            <span className={montantAnPrec > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}>
              {fmtEuro(montantAnPrec)}
            </span>
          }
          sous="Même mois l'année passée, encore ouvertes aujourd'hui"
        />

        <KpiCard
          titre={`Impayés — +${seuilAnciennete} mois`}
          accent={montantSeuilMois > 0 ? 'border-red-200 dark:border-red-900/40' : undefined}
          valeur={
            <span className={montantSeuilMois > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-400 dark:text-gray-600'}>
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
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${seuilAnciennete === s ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
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
