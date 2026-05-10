// Onglet 3 — Compte Client : vue clients / nébuleuse / factures avec drill-down (Sprint 3)
import { useState } from 'react'
import { useComptesClients } from '../hooks/useComptesClients'
import { useFacturesClient } from '../hooks/useFacturesClient'
import { useAppData } from '../contexts/AppDataContext'
import { BarreKpis } from '../components/compte-client/BarreKpis'
import { TableComptesClients } from '../components/compte-client/TableComptesClients'
import { TableNebuleuse } from '../components/compte-client/TableNebuleuse'
import { TableFacturesFlat } from '../components/compte-client/TableFacturesFlat'
import { PanneauOptions } from '../components/compte-client/PanneauOptions'
import { ModalHistorique } from '../components/compte-client/ModalHistorique'
import { ModalExport } from '../components/compte-client/ModalExport'
import { ModalExportNebuleuse } from '../components/compte-client/ModalExportNebuleuse'
import type { CompteClient, FactureDetail, VueMode } from '../types/client'

const VUES: { val: VueMode; label: string; icon: string }[] = [
  { val: 'nebuleuse', label: 'Nébuleuse', icon: '🌐' },
  { val: 'clients', label: 'Comptes client', icon: '👤' },
  { val: 'factures', label: 'Factures', icon: '🧾' },
]

export function PageCompteClient() {
  const [vue, setVue] = useState<VueMode>('clients')
  const [clientOptions, setClientOptions] = useState<CompteClient | null>(null)
  const [facHistorique, setFacHistorique] = useState<FactureDetail | null>(null)
  const [exportOuvert, setExportOuvert] = useState(false)
  const [exportNebOuvert, setExportNebOuvert] = useState(false)

  const comptes = useComptesClients()
  const factures = useFacturesClient()
  const { facturesActives } = useAppData()

  return (
    <div>
      {/* En-tête */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Compte client</h1>
          <p className="text-sm text-gray-500 mt-0.5">Vue consolidée des encours, factures et historique de lettrage</p>
        </div>
        <button
          onClick={() => vue === 'nebuleuse' ? setExportNebOuvert(true) : setExportOuvert(true)}
          className="flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors"
        >
          ⬇ Extraction XLS
        </button>
      </div>

      {/* KPIs */}
      <BarreKpis kpis={comptes.kpis} chargement={comptes.chargement} />

      {/* Toolbar : toggle vue + recherche */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex bg-white border border-gray-200 rounded-lg p-1 gap-0.5">
          {VUES.map(v => (
            <button
              key={v.val}
              onClick={() => setVue(v.val)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                vue === v.val ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {v.icon} {v.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex-1 max-w-xs">
          <span className="text-gray-400 text-xs">🔍</span>
          <input
            type="text"
            value={comptes.recherche}
            onChange={e => comptes.setRecherche(e.target.value)}
            placeholder="Code, client, plateforme…"
            className="text-xs text-gray-700 placeholder-gray-400 outline-none w-full bg-transparent"
          />
          {comptes.recherche && (
            <button onClick={() => comptes.setRecherche('')} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
          )}
        </div>

        {/* Indicateur mémoire : nombre de pièces actives chargées */}
        {!comptes.chargement && (() => {
          const nbAvoirs = facturesActives.filter(f => f.est_avoir && f.reste_du < -0.005).length
          return (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-700 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {comptes.kpis.nbFacturesAttente} impayées chargées
              {nbAvoirs > 0 && <span className="text-gray-400 ml-1">+ {nbAvoirs} avoir{nbAvoirs > 1 ? 's' : ''}</span>}
            </div>
          )
        })()}
      </div>

      {/* Contenu selon la vue */}
      {vue === 'clients' && (
        <TableComptesClients
          clients={comptes.clients}
          chargement={comptes.chargement}
          recherche={comptes.recherche}
          getFactures={code => factures.getFactures(code)}
          estChargement={code => factures.estChargement(code)}
          onExpand={() => {}}
          onChargerHistorique={code => factures.chargerToutesFactures(code)}
          estHistoriqueCharge={code => factures.estHistoriqueCharge(code)}
          onStatutChange={factures.mettreAJourStatut}
          onHistorique={setFacHistorique}
          onOptions={setClientOptions}
        />
      )}

      {vue === 'nebuleuse' && (
        <TableNebuleuse
          groupes={comptes.nebuleuse}
          chargement={comptes.chargement}
          getFactures={codes => factures.getFactures(codes)}
          estChargement={codes => factures.estChargement(codes)}
          onExpand={() => {}}
          onStatutChange={factures.mettreAJourStatut}
          onHistorique={setFacHistorique}
        />
      )}

      {vue === 'factures' && (
        <TableFacturesFlat
          clients={comptes.clients}
          getFactures={codes => factures.getFactures(codes)}
          estChargement={codes => factures.estChargement(codes)}
          onExpand={() => {}}
          onStatutChange={factures.mettreAJourStatut}
          onHistorique={setFacHistorique}
        />
      )}

      {/* Panneau Options */}
      <PanneauOptions
        client={clientOptions}
        onFermer={() => setClientOptions(null)}
        onSauvegarder={comptes.sauvegarderOptions}
      />

      {/* Modal Historique */}
      <ModalHistorique
        facture={facHistorique}
        onFermer={() => setFacHistorique(null)}
        chargerHistorique={factures.chargerHistorique}
      />

      {/* Modal Export Nébuleuse */}
      <ModalExportNebuleuse
        ouvert={exportNebOuvert}
        groupes={comptes.nebuleuse}
        getFactures={codes => factures.getFactures(codes)}
        chargerFactures={codes => factures.chargerFactures(codes)}
        onFermer={() => setExportNebOuvert(false)}
      />

      {/* Modal Export */}
      <ModalExport
        ouvert={exportOuvert}
        clients={comptes.clients}
        getFactures={codes => factures.getFactures(Array.isArray(codes) ? codes : [codes])}
        chargerFactures={codes => factures.chargerFactures(Array.isArray(codes) ? codes : [codes])}
        onFermer={() => setExportOuvert(false)}
      />
    </div>
  )
}
