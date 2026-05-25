// Onglet 3 — Compte Client : vue clients / nébuleuse / factures avec drill-down (Sprint 3)
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useComptesClients } from '../hooks/useComptesClients'
import { useRelances } from '../hooks/useRelances'
import { useFacturesClient } from '../hooks/useFacturesClient'
import { useCommentairesFactures } from '../hooks/useCommentairesFactures'
import { BarreKpis } from '../components/compte-client/BarreKpis'
import { TableComptesClients } from '../components/compte-client/TableComptesClients'
import { TableNebuleuse } from '../components/compte-client/TableNebuleuse'
import { TableFacturesFlat } from '../components/compte-client/TableFacturesFlat'
import { PanneauOptions } from '../components/compte-client/PanneauOptions'
import { PanneauCommentaireFacture } from '../components/compte-client/PanneauCommentaireFacture'
import { ModalHistorique } from '../components/compte-client/ModalHistorique'
import { ModalExport } from '../components/compte-client/ModalExport'
import { ModalExportNebuleuse } from '../components/compte-client/ModalExportNebuleuse'
import { ModalCompositionRelance } from '../components/relances/ModalCompositionRelance'
import { useGmailAuth } from '../hooks/useGmailAuth'
import type { CompteClient, FactureDetail, VueMode } from '../types/client'

const VUES: { val: VueMode; label: string; icon: string }[] = [
  { val: 'nebuleuse', label: 'Nébuleuse', icon: '🌐' },
  { val: 'clients', label: 'Comptes client', icon: '👤' },
  { val: 'factures', label: 'Factures', icon: '🧾' },
]

export function PageCompteClient() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [vue, setVue] = useState<VueMode>('clients')
  const [clientOptions, setClientOptions] = useState<CompteClient | null>(null)
  const [clientRelance, setClientRelance] = useState<CompteClient | null>(null)
  const gmailAuth = useGmailAuth()
  const [facHistorique, setFacHistorique] = useState<FactureDetail | null>(null)
  const [facCommentaire, setFacCommentaire] = useState<FactureDetail | null>(null)
  const [exportOuvert, setExportOuvert] = useState(false)
  const [exportNebOuvert, setExportNebOuvert] = useState(false)

  const comptes = useComptesClients()
  const factures = useFacturesClient()
  const { commentaires, chargerTous, sauvegarder } = useCommentairesFactures()
  const { relances } = useRelances()

  const dernieresRelances = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of relances) {
      if (!r.envoyee_le || r.statut === 'brouillon') continue
      const actuelle = map.get(r.code_client)
      if (!actuelle || r.envoyee_le > actuelle) map.set(r.code_client, r.envoyee_le)
    }
    return map
  }, [relances])

  useEffect(() => { chargerTous() }, [])

  // Ouverture automatique de la fiche client depuis un lien email (?client=CODE)
  useEffect(() => {
    const codeCible = searchParams.get('client')
    if (!codeCible || comptes.chargement || comptes.clients.length === 0) return
    const cible = comptes.clients.find(c => c.code_dso === codeCible)
    if (cible) {
      setVue('clients')
      comptes.setRecherche(codeCible)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, comptes.clients, comptes.chargement])

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
                vue === v.val ? 'bg-ockham-teal text-white' : 'text-gray-500 hover:bg-gray-100'
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
            placeholder="Code, client, n° facture…"
            className="text-xs text-gray-700 placeholder-gray-400 outline-none w-full bg-transparent"
          />
          {comptes.recherche && (
            <button onClick={() => comptes.setRecherche('')} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
          )}
        </div>

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
          onRelancer={setClientRelance}
          dernieresRelances={dernieresRelances}
          commentaires={commentaires}
          onOuvrirCommentaire={setFacCommentaire}
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
          commentaires={commentaires}
          onOuvrirCommentaire={setFacCommentaire}
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
          commentaires={commentaires}
          onOuvrirCommentaire={setFacCommentaire}
        />
      )}

      {/* Panneau Commentaire Facture */}
      <PanneauCommentaireFacture
        facture={facCommentaire}
        commentaire={facCommentaire ? (commentaires.get(facCommentaire.numero_piece) ?? null) : null}
        onFermer={() => setFacCommentaire(null)}
        onSauvegarder={sauvegarder}
        onStatutChange={factures.mettreAJourStatut}
      />

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

      {/* Modal Composition Relance */}
      <ModalCompositionRelance
        client={clientRelance}
        onFermer={() => setClientRelance(null)}
        onSent={() => setClientRelance(null)}
        gmailAuth={gmailAuth}
        commentaires={commentaires}
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
