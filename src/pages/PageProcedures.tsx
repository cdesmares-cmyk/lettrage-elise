import { useState } from 'react'
import { useProcedures } from '../hooks/useProcedures'
import { ListeProcedures } from '../components/procedures/ListeProcedures'
import { ModalSuiviProcedure } from '../components/procedures/ModalSuiviProcedure'
import type { ProcedureLigne } from '../hooks/useProcedures'

type OngletProcedure = 'encours' | 'archive'

const fmtKeuros = (n: number): string => {
  if (n < 1000) return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  const k = n / 1000
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace('.', ',')} k€`
}

function KpiCard({ label, valeur, sous, accentBar, valeurCls }: {
  label: string; valeur: string | number; sous: string; accentBar: string; valeurCls: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden flex">
      <div className={`w-1.5 flex-shrink-0 ${accentBar}`} />
      <div className="px-5 py-5 flex-1 min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
        <p className={`text-3xl font-black leading-none mb-1.5 ${valeurCls}`}>{valeur}</p>
        <p className="text-[11px] text-gray-400">{sous}</p>
      </div>
    </div>
  )
}

export function PageProcedures() {
  const [onglet, setOnglet] = useState<OngletProcedure>('encours')
  const { encours, archive, chargement, rafraichir } = useProcedures()
  const [ligneSelectionnee, setLigneSelectionnee] = useState<ProcedureLigne | null>(null)

  const lignes = onglet === 'encours' ? encours : archive
  const totalEncours = encours.reduce((s, l) => s + l.encours, 0)
  const aDeclarer   = encours.filter(l => l.encours >= 0.01 && (!l.declarationStatut || l.declarationStatut === 'brouillon')).length
  const declarees   = encours.filter(l => l.declarationStatut === 'declaree' || l.declarationStatut === 'acceptee').length

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Procédures collectives</h1>
        <p className="text-sm text-gray-400 mt-0.5">Suivi des clients en procédure judiciaire · Données BODACC</p>
      </div>

      {/* KPIs */}
      {chargement ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-[88px] bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Clients exposés"     valeur={encours.length}          sous="procédures actives"     accentBar="bg-ockham-teal"   valeurCls="text-gray-900" />
          <KpiCard label="Encours exposé"       valeur={fmtKeuros(totalEncours)} sous="toutes procédures"      accentBar="bg-ockham-copper" valeurCls="text-ockham-copper" />
          <KpiCard label="Déclarations à faire" valeur={aDeclarer}               sous="créances non déclarées" accentBar="bg-red-500"       valeurCls={aDeclarer > 0 ? 'text-red-600' : 'text-gray-400'} />
          <KpiCard label="Déclarations faites"  valeur={declarees}               sous="créances déclarées"     accentBar="bg-ockham-teal"   valeurCls={declarees > 0 ? 'text-ockham-teal' : 'text-gray-400'} />
        </div>
      )}

      {/* Onglets + tableau dans une seule carte */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">

        {/* Barre d'onglets */}
        <div className="flex gap-6 px-4 border-b border-gray-100">
          <button
            onClick={() => setOnglet('encours')}
            className={`py-3 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${onglet === 'encours' ? 'text-ockham-teal border-ockham-teal' : 'text-gray-400 border-transparent hover:text-gray-600'}`}
          >
            En cours
            {!chargement && encours.length > 0 && (
              <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-ockham-teal/10 text-ockham-teal-dark">{encours.length}</span>
            )}
          </button>
          <button
            onClick={() => setOnglet('archive')}
            className={`py-3 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${onglet === 'archive' ? 'text-ockham-teal border-ockham-teal' : 'text-gray-400 border-transparent hover:text-gray-600'}`}
          >
            Archive
            {!chargement && archive.length > 0 && (
              <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{archive.length}</span>
            )}
          </button>
        </div>

        {/* key={onglet} force un remount propre (réinitialise tri + filtre) à chaque changement d'onglet */}
        <ListeProcedures
          key={onglet}
          lignes={lignes}
          chargement={chargement}
          onOuvrirDetail={setLigneSelectionnee}
        />

      </div>

      {ligneSelectionnee && (
        <ModalSuiviProcedure
          ligne={ligneSelectionnee}
          onClose={() => setLigneSelectionnee(null)}
          onDeclarationSaved={rafraichir}
        />
      )}

    </div>
  )
}
