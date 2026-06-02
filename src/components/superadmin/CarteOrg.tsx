import { useState } from 'react'
import { type OrganisationSA, type CronRun, dotStatut, type DotStatut } from '../../hooks/useSuperAdmin'

function IcChevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

function Dot({ statut }: { statut: DotStatut }) {
  const cls = { ok: 'bg-green-500', erreur: 'bg-red-500', silencieux: 'bg-amber-400', jamais: 'bg-gray-300' }
  const lbl = { ok: 'OK', erreur: 'Erreur', silencieux: 'Inactif +48h', jamais: 'Jamais exécuté' }
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls[statut]}`} title={lbl[statut]} />
}

function formaterEuros(val: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
}

export function CarteOrg({ org, runs, fonctionsPerOrg, onToggle }: {
  org: OrganisationSA
  runs: CronRun[]
  fonctionsPerOrg: string[]
  onToggle: (id: string, actif: boolean) => void
}) {
  const [ouvert, setOuvert] = useState(false)

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 transition-opacity ${!org.actif ? 'opacity-50' : ''}`}>
      {/* En-tête : nom + toggle */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 truncate leading-tight">{org.nom}</p>
          <p className="text-[11px] text-gray-400 font-mono truncate mt-0.5">{org.slug}</p>
        </div>
        <button
          onClick={() => onToggle(org.id, !org.actif)}
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

      {/* Dots API */}
      {fonctionsPerOrg.length > 0 && (
        <div className="flex items-center gap-3 pt-2 border-t border-gray-50">
          {fonctionsPerOrg.map(fn => (
            <div key={fn} className="flex items-center gap-1.5">
              <Dot statut={dotStatut(runs, fn, org.id)} />
              <span className="text-[10px] text-gray-400 font-mono">{fn.replace(/-sync$/, '')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Accordéon utilisateurs */}
      <button
        onClick={() => setOuvert(v => !v)}
        className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors cursor-pointer self-start"
      >
        <IcChevron open={ouvert} />
        {org.utilisateurs.length} utilisateur{org.utilisateurs.length !== 1 ? 's' : ''}
      </button>

      {ouvert && (
        <div className="pt-2 border-t border-gray-50 space-y-2">
          {org.utilisateurs.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Aucun utilisateur.</p>
          ) : (
            org.utilisateurs.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-700 font-medium truncate">{u.nom_affiche || u.email}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${
                  u.role === 'admin' ? 'bg-ockham-navy/10 text-ockham-navy' :
                  u.role === 'commercial' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{u.role}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
