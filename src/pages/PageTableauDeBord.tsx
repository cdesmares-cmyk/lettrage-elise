import { useDashboard } from '../hooks/useDashboard'
import { BlocKpis } from '../components/tableau-de-bord/BlocKpis'
import { BlocAnalyse } from '../components/tableau-de-bord/BlocAnalyse'
import { BlocEncaissements } from '../components/tableau-de-bord/BlocEncaissements'
import { BlocPersonnalise } from '../components/tableau-de-bord/BlocPersonnalise'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-ockham-navy/60 uppercase tracking-wider">{children}</p>
}

export function PageTableauDeBord() {
  const data = useDashboard()

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-sm text-gray-400 mt-0.5">Pilotage des encours — indicateurs clés</p>
        </div>
        <div className="flex items-center gap-3">
          {data.moisExclusLabel && (
            <label className="flex items-center gap-3 cursor-pointer select-none bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm hover:border-gray-300 transition-colors">
              <span className="text-xs text-gray-500">Exclure <span className="font-semibold text-gray-700">{data.moisExclusLabel}</span></span>
              <button
                onClick={() => data.setExclureDernierMois(!data.exclureDernierMois)}
                className={`relative rounded-full transition-colors overflow-hidden flex-shrink-0 ${data.exclureDernierMois ? 'bg-ockham-teal' : 'bg-gray-200'}`}
                style={{ width: 32, height: 18 }}
              >
                <span
                  className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all duration-200"
                  style={{ left: data.exclureDernierMois ? 14 : 2 }}
                />
              </button>
            </label>
          )}
          {data.chargement && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
              Chargement…
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="space-y-2">
        <SectionLabel>Indicateurs clés</SectionLabel>
        <BlocKpis {...data} />
      </div>

      {/* Analyse */}
      <div className="space-y-2">
        <SectionLabel>Analyse des encours</SectionLabel>
        <BlocAnalyse {...data} />
      </div>

      {/* Encaissements */}
      <div className="space-y-2">
        <SectionLabel>Évolution des encaissements</SectionLabel>
        <BlocEncaissements {...data} />
      </div>

      {/* Widgets */}
      <div className="space-y-2">
        <SectionLabel>Vue personnalisée</SectionLabel>
        <BlocPersonnalise {...data} />
      </div>

    </div>
  )
}
