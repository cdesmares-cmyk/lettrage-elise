import { type OrganisationSA, type CronRun, dotStatut, type DotStatut } from '../../hooks/useSuperAdmin'

function Dot({ statut }: { statut: DotStatut }) {
  const cls = { ok: 'bg-green-500', erreur: 'bg-red-500', silencieux: 'bg-amber-400', jamais: 'bg-gray-300' }
  const lbl = { ok: 'OK', erreur: 'Erreur', silencieux: 'Inactif +48h', jamais: 'Jamais exécuté' }
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls[statut]}`} title={lbl[statut]} />
}

function formaterEuros(val: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
}

export function CarteOrg({ org, runs, fonctionsPerOrg, onToggle, onOuvrir }: {
  org: OrganisationSA
  runs: CronRun[]
  fonctionsPerOrg: string[]
  onToggle: (id: string, actif: boolean) => void
  onOuvrir: (org: OrganisationSA) => void
}) {
  return (
    <div
      onClick={() => onOuvrir(org)}
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 cursor-pointer hover:border-ockham-teal/40 hover:shadow-md transition-all ${!org.actif ? 'opacity-50' : ''}`}
    >
      {/* En-tête : nom + toggle */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 truncate leading-tight">{org.nom}</p>
          <p className="text-[11px] text-gray-400 font-mono truncate mt-0.5">{org.slug}</p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onToggle(org.id, !org.actif) }}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${org.actif ? 'bg-ockham-teal' : 'bg-gray-300'}`}
          title={org.actif ? 'Désactiver' : 'Activer'}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${org.actif ? 'translate-x-4' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
        <span>{org.nb_utilisateurs} util.</span>
        <span className="text-gray-200">·</span>
        <span>{org.nb_clients} clients</span>
        <span className="text-gray-200">·</span>
        <span className="font-semibold text-gray-700">{formaterEuros(org.encours_total)}</span>
      </div>

      {/* Badges intégrations + dots API */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <div className="flex items-center gap-2">
          {/* Badge Axonaut */}
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            org.axonaut_actif
              ? 'bg-ockham-teal-muted text-ockham-teal-dark'
              : 'bg-gray-100 text-gray-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${org.axonaut_actif ? 'bg-ockham-teal' : 'bg-gray-300'}`} />
            Axonaut
          </span>
        </div>

        {/* Dots Edge Functions */}
        {fonctionsPerOrg.length > 0 && (
          <div className="flex items-center gap-2">
            {fonctionsPerOrg.map(fn => (
              <div key={fn} className="flex items-center gap-1.5" title={fn}>
                <Dot statut={dotStatut(runs, fn, org.id)} />
                <span className="text-[10px] text-gray-400 font-mono">{fn.replace(/-sync$/, '')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
