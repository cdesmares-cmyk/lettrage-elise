// Onglet 1 — Tableau de bord analytique
import { useDashboard } from '../hooks/useDashboard'
import { BlocKpis } from '../components/tableau-de-bord/BlocKpis'
import { BlocAnalyse } from '../components/tableau-de-bord/BlocAnalyse'
import { BlocEncaissements } from '../components/tableau-de-bord/BlocEncaissements'
import { BlocPersonnalise } from '../components/tableau-de-bord/BlocPersonnalise'

export function PageTableauDeBord() {
  const data = useDashboard()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-gray-500 mt-0.5">Vue temps réel — données issues du cache applicatif</p>
        </div>
        {data.chargement && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            Chargement indicateurs…
          </div>
        )}
      </div>

      {/* Bloc 1 — KPI lignes 1 et 2 */}
      <BlocKpis {...data} />

      {/* Bloc 1 — Ligne 3 : analyses */}
      <BlocAnalyse {...data} />

      {/* Bloc 2 — Graphique encaissements */}
      <BlocEncaissements {...data} />

      {/* Bloc 3 — Widgets personnalisés */}
      <BlocPersonnalise {...data} />
    </div>
  )
}
