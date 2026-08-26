import { useState } from 'react'
import { useProcedures } from '../hooks/useProcedures'
import { ListeProcedures } from '../components/procedures/ListeProcedures'
import type { ProcedureLigne } from '../hooks/useProcedures'

type OngletProcedure = 'encours' | 'archive'

export function PageProcedures() {
  const [onglet, setOnglet] = useState<OngletProcedure>('encours')
  const { encours, archive, chargement } = useProcedures()

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function ouvrirDetail(_l: ProcedureLigne) {
    // Bloc 3 — modal à venir
  }

  const lignes = onglet === 'encours' ? encours : archive

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Procédures collectives</h1>
          <p className="text-sm text-gray-400 mt-0.5">Suivi des clients en procédure judiciaire · Données BODACC</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="border-b border-gray-200 dark:border-slate-700">
        <div className="flex gap-6">
          <button
            onClick={() => setOnglet('encours')}
            className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              onglet === 'encours'
                ? 'text-ockham-teal border-ockham-teal'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            En cours
            {!chargement && encours.length > 0 && (
              <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-ockham-teal/10 text-ockham-teal-dark">
                {encours.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setOnglet('archive')}
            className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              onglet === 'archive'
                ? 'text-ockham-teal border-ockham-teal'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            Archive
            {!chargement && archive.length > 0 && (
              <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                {archive.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Liste */}
      <ListeProcedures
        lignes={lignes}
        chargement={chargement}
        showKpis={onglet === 'encours'}
        onOuvrirDetail={ouvrirDetail}
      />

    </div>
  )
}
