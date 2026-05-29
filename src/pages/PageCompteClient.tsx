// Onglet 3 — Compte Client : vue clients / nébuleuse / factures avec drill-down (Sprint 3)
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { IcDownload, IcSearch, IcNetwork, IcUser, IcFileText } from '../components/Icones'
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
import { ModalRelanceMasse } from '../components/relances/ModalRelanceMasse'
import { useGmailAuth } from '../hooks/useGmailAuth'
import { exporterXls } from '../lib/exportXls'
import type { CompteClient, FactureDetail, VueMode } from '../types/client'

const VUES: { val: VueMode; label: string; icon: React.ReactNode }[] = [
  { val: 'nebuleuse', label: 'Nébuleuse', icon: <IcNetwork size={13} /> },
  { val: 'clients', label: 'Comptes client', icon: <IcUser size={13} /> },
  { val: 'factures', label: 'Factures', icon: <IcFileText size={13} /> },
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
  const [modeSelection, setModeSelection] = useState(false)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [relanceMasseOuverte, setRelanceMasseOuverte] = useState(false)
  const [exportSelectionEnCours, setExportSelectionEnCours] = useState(false)
  const [factureDateDebut, setFactureDateDebut] = useState('')
  const [factureDateFin, setFactureDateFin] = useState('')

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

  const toggleSelection = useCallback((code: string) => {
    setSelection(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }, [])

  function basculerModeSelection() {
    setModeSelection(v => { if (v) setSelection(new Set()); return !v })
  }

  const clientsSelectionnes = useMemo(
    () => comptes.clients.filter(c => selection.has(c.code_dso) && c.nb_impayees > 0),
    [comptes.clients, selection]
  )
  const totalSelectionne = useMemo(
    () => comptes.clients.filter(c => selection.has(c.code_dso)).reduce((s, c) => s + c.encours_total, 0),
    [comptes.clients, selection]
  )

  async function exporterSelection() {
    if (!selection.size || exportSelectionEnCours) return
    setExportSelectionEnCours(true)
    const codes = [...selection]
    await factures.chargerFactures(codes)
    const data = factures.getFactures(codes)
    if (data.length) {
      exporterXls(data, `extraction_selection_${new Date().toISOString().split('T')[0]}`)
    }
    setExportSelectionEnCours(false)
  }

  // KPIs dynamiques en vue "factures" selon la plage de dates sélectionnée
  const kpisVueFiltree = useMemo(() => {
    if (vue !== 'factures' || (!factureDateDebut && !factureDateFin)) return comptes.kpis
    const allCodes = comptes.clients.map(c => c.code_dso)
    let facs = factures.getFactures(allCodes)
    if (factureDateDebut) facs = facs.filter(f => (f.date_emission ?? '') >= factureDateDebut)
    if (factureDateFin)   facs = facs.filter(f => (f.date_emission ?? '') <= factureDateFin)
    const impayees = facs.filter(f => f.reste_du > 0.005 && !f.est_avoir)
    return {
      nbClientsActifs: new Set(impayees.map(f => f.code_client)).size,
      encoursTotalTtc: impayees.reduce((s, f) => s + f.reste_du, 0),
      encoursTotalAvoirs: facs.filter(f => f.est_avoir && f.reste_du < -0.005).reduce((s, f) => s + Math.abs(f.reste_du), 0),
      nbFacturesAttente: impayees.length,
      dsoRoulant: null,
    }
  }, [vue, factureDateDebut, factureDateFin, comptes.clients, comptes.kpis, factures])

  function fmtEncours(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`
    if (n >= 10_000)    return `${Math.round(n / 1_000)} k€`
    return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  }

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
          <IcDownload size={14} /> Extraction XLS
        </button>
      </div>

      {/* KPIs */}
      <BarreKpis kpis={kpisVueFiltree} chargement={comptes.chargement} />

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
          <IcSearch size={13} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={comptes.recherche}
            onChange={e => comptes.setRecherche(e.target.value)}
            placeholder="Code, client, n° facture…"
            className="text-xs text-gray-700 placeholder-gray-400 outline-none w-full bg-transparent"
          />
          {comptes.chargementServeur && (
            <span className="w-1.5 h-1.5 rounded-full bg-ockham-teal animate-pulse flex-shrink-0" title="Recherche étendue…" />
          )}
          {comptes.recherche && !comptes.chargementServeur && (
            <button onClick={() => comptes.setRecherche('')} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
          )}
        </div>

        {vue === 'clients' && (
          <button
            onClick={basculerModeSelection}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              modeSelection
                ? 'bg-ockham-teal text-white border-ockham-teal'
                : 'bg-white text-gray-600 border-gray-200 hover:border-ockham-teal hover:text-ockham-teal'
            }`}
          >
            {modeSelection ? `✓ Sélection (${selection.size})` : 'Sélection'}
          </button>
        )}
      </div>

      {/* Bandeau sélection */}
      {modeSelection && vue === 'clients' && (
        <div className="flex items-center gap-4 bg-ockham-navy px-5 py-3 rounded-xl mb-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-sm font-bold text-white tabular-nums">{selection.size} client{selection.size > 1 ? 's' : ''} sélectionné{selection.size > 1 ? 's' : ''}</span>
            {selection.size > 0 && (
              <span className="text-xs text-ockham-teal font-semibold tabular-nums">{fmtEncours(totalSelectionne)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selection.size > 0 && (
              <button
                onClick={() => setSelection(new Set())}
                className="text-[11px] text-white/50 hover:text-white transition-colors"
              >
                Tout désélectionner
              </button>
            )}
            <button
              onClick={() => setRelanceMasseOuverte(true)}
              disabled={clientsSelectionnes.length === 0}
              className="text-xs font-semibold px-3 py-1.5 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              ✉ Relancer ({clientsSelectionnes.length})
            </button>
            <button
              onClick={exporterSelection}
              disabled={selection.size === 0 || exportSelectionEnCours}
              className="text-xs font-semibold px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white border border-white/20 rounded-lg transition-colors"
            >
              {exportSelectionEnCours ? '…' : <><IcDownload size={13} className="inline-block mr-1.5" />Exporter la sélection</>}
            </button>
          </div>
        </div>
      )}

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
          modeSelection={modeSelection}
          selection={selection}
          onToggleSelection={toggleSelection}
          creditParClient={comptes.creditParClient}
          nbPiecesParClient={comptes.nbPiecesParClient}
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
          dateDebut={factureDateDebut}
          dateFin={factureDateFin}
          onDateDebutChange={setFactureDateDebut}
          onDateFinChange={setFactureDateFin}
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

      {/* Modal Composition Relance (client unique) */}
      <ModalCompositionRelance
        client={clientRelance}
        onFermer={() => setClientRelance(null)}
        onSent={() => setClientRelance(null)}
        gmailAuth={gmailAuth}
        commentaires={commentaires}
      />

      {/* Modal Relance Massive */}
      {relanceMasseOuverte && (
        <ModalRelanceMasse
          clients={clientsSelectionnes}
          gmailAuth={gmailAuth}
          commentaires={commentaires}
          onFermer={() => setRelanceMasseOuverte(false)}
          onFini={() => { setRelanceMasseOuverte(false); setModeSelection(false); setSelection(new Set()) }}
        />
      )}

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
