// Blocs 1 et 2 — 6 KPI cards sur 2 lignes
import type { useDashboard } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

const _fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }
function fmtNb(n: number) { return _fmt.format(n) }

function classeDso(dso: number): string {
  if (dso <= 30) return 'text-emerald-600'
  if (dso <= 45) return 'text-blue-600'
  if (dso <= 60) return 'text-amber-600'
  return 'text-red-600'
}
function labelDso(dso: number): string {
  if (dso <= 30) return 'Excellent'
  if (dso <= 45) return 'Bon'
  if (dso <= 60) return 'Attention'
  return 'Critique'
}

interface KpiCardProps {
  titre: string
  valeur: React.ReactNode
  sous?: React.ReactNode
  footer?: React.ReactNode
  accent?: string
}

function KpiCard({ titre, valeur, sous, footer, accent = 'border-gray-100' }: KpiCardProps) {
  return (
    <div className={`bg-white border ${accent} rounded-xl shadow-sm px-5 py-4 flex flex-col gap-1`}>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{titre}</span>
      <div className="text-2xl font-bold tabular-nums text-gray-900 leading-tight">{valeur}</div>
      {sous && <div className="text-xs text-gray-500 leading-snug">{sous}</div>}
      {footer && <div className="mt-1">{footer}</div>}
    </div>
  )
}

export function BlocKpis({
  nbImpayeesEchues, nbClientsEchus, dsoRoulant,
  exclureDernierMois, setExclureDernierMois, moisExclusLabel,
  montantMoisPrec, montantAnPrec, montantPlus18Mois,
  libelleMoisPrec, libelleMoisAnPrec,
}: Props) {

  return (
    <div className="space-y-3">
      {/* Ligne 1 */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          titre="Factures impayées échues"
          accent={nbImpayeesEchues > 0 ? 'border-red-100' : 'border-gray-100'}
          valeur={
            <span className={nbImpayeesEchues > 0 ? 'text-red-600' : 'text-gray-900'}>
              {fmtNb(nbImpayeesEchues)}
            </span>
          }
          sous="Factures avec date d'échéance dépassée (J+15 si absente)"
          footer={
            moisExclusLabel ? (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={exclureDernierMois}
                  onChange={e => setExclureDernierMois(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-blue-600"
                />
                <span className="text-[10px] text-gray-500">
                  Exclure <span className="font-medium text-gray-700">{moisExclusLabel}</span>
                </span>
              </label>
            ) : null
          }
        />

        <KpiCard
          titre="Clients avec impayés échus"
          accent={nbClientsEchus > 0 ? 'border-amber-100' : 'border-gray-100'}
          valeur={
            <span className={nbClientsEchus > 0 ? 'text-amber-600' : 'text-gray-900'}>
              {fmtNb(nbClientsEchus)}
            </span>
          }
          sous={exclureDernierMois ? `Hors factures de ${moisExclusLabel}` : 'Clients distincts concernés'}
        />

        <KpiCard
          titre="DSO roulant — 12 mois"
          valeur={
            dsoRoulant !== null ? (
              <span className={classeDso(dsoRoulant)}>{dsoRoulant}j</span>
            ) : <span className="text-gray-400">—</span>
          }
          sous={
            dsoRoulant !== null ? (
              <span className={`font-semibold ${classeDso(dsoRoulant)}`}>{labelDso(dsoRoulant)}</span>
            ) : 'Données insuffisantes'
          }
          footer={
            <span className="text-[10px] text-gray-400">
              Délai moyen de paiement (Encours ÷ CA 12 mois × 365)
            </span>
          }
        />
      </div>

      {/* Ligne 2 */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          titre={`Impayés — ${libelleMoisPrec} (M-1)`}
          valeur={
            <span className={montantMoisPrec > 0 ? 'text-amber-700' : 'text-gray-400'}>
              {fmtEuro(montantMoisPrec)}
            </span>
          }
          sous="Factures du mois précédent encore ouvertes"
        />

        <KpiCard
          titre={`Impayés — ${libelleMoisAnPrec} (N-1)`}
          valeur={
            <span className={montantAnPrec > 0 ? 'text-amber-700' : 'text-gray-400'}>
              {fmtEuro(montantAnPrec)}
            </span>
          }
          sous="Même mois l'année passée, encore ouvertes aujourd'hui"
        />

        <KpiCard
          titre="Impayés — +18 mois"
          accent={montantPlus18Mois > 0 ? 'border-red-200' : 'border-gray-100'}
          valeur={
            <span className={montantPlus18Mois > 0 ? 'text-red-700' : 'text-gray-400'}>
              {fmtEuro(montantPlus18Mois)}
            </span>
          }
          sous="Factures émises il y a plus de 18 mois encore non soldées"
        />
      </div>
    </div>
  )
}
