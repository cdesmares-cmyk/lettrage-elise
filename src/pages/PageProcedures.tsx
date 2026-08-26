import { useState } from 'react'

type OngletProcedure = 'encours' | 'archive'

export function PageProcedures() {
  const [onglet, setOnglet] = useState<OngletProcedure>('encours')

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Procédures collectives</h1>
          <p className="text-sm text-gray-400 mt-0.5">Suivi des clients en procédure judiciaire · Données BODACC</p>
        </div>
      </div>

      {/* Onglets En cours / Archive */}
      <div className="border-b border-gray-200 dark:border-slate-700">
        <div className="flex gap-6">
          {([
            { id: 'encours', label: 'En cours' },
            { id: 'archive', label: 'Archive' },
          ] as { id: OngletProcedure; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setOnglet(id)}
              className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                onglet === id
                  ? 'text-ockham-teal border-ockham-teal'
                  : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu — à compléter bloc par bloc */}
      <div className="flex items-center justify-center h-48 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
        <p className="text-sm text-gray-300">
          {onglet === 'encours' ? 'Procédures en cours — chargement à venir' : 'Archive — chargement à venir'}
        </p>
      </div>

    </div>
  )
}
