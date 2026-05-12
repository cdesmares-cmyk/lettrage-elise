import { useRelances } from '../hooks/useRelances'
import { KpisRelances } from '../components/relances/KpisRelances'
import { TableauRelances } from '../components/relances/TableauRelances'
import { ListePriorites } from '../components/relances/ListePriorites'
import { useRole } from '../contexts/RoleContext'

export function PageRelances() {
  const { relances, chargement, kpis, mettreAJourStatut } = useRelances()
  const { isCommercial } = useRole()

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Relances</h1>
          <p className="text-sm text-gray-400 mt-0.5">Suivi et gamification de votre activité de recouvrement</p>
        </div>
      </div>

      {/* KPIs — masqués pour le commercial */}
      {!isCommercial && <KpisRelances kpis={kpis} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tableau des relances récentes */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Relances récentes</p>
          <TableauRelances
            relances={relances}
            chargement={chargement}
            onMajStatut={mettreAJourStatut}
          />
        </div>

        {/* Top 5 priorités */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Priorités</p>
          <ListePriorites relances={relances} />
        </div>
      </div>
    </div>
  )
}
