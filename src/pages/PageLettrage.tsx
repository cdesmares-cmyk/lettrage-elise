// Onglet 2 — Lettrage : affectation des crédits bancaires aux factures (Sprint 2)
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { IcDownload, IcClock, IcX } from '../components/Icones'
import type { LigneBancaireAvecStatut, LigneBancaire411, StatutLettrage } from '../types/lettrage'
import { BarreResume } from '../components/lettrage/BarreResume'
import { TableLignesBancaires } from '../components/lettrage/TableLignesBancaires'
import { PanneauLettrage } from '../components/lettrage/PanneauLettrage'
import { PanneauDispatch411Attente } from '../components/lettrage/PanneauDispatch471'
import { PanneauDispatch411 } from '../components/lettrage/PanneauDispatch411'
import { PanneauRequalification471 } from '../components/lettrage/PanneauRequalification471'
import { TableCompte } from '../components/lettrage/TableCompte'
import { ToolbarLettrage } from '../components/lettrage/ToolbarLettrage'
import { ModalCorrection } from '../components/lettrage/ModalCorrection'
import { ModalRemises } from '../components/lettrage/ModalRemises'
import { ModalExtractionLettrage } from '../components/lettrage/ModalExtractionLettrage'
import { ModalNavigateurFactures } from '../components/lettrage/ModalNavigateurFactures'
import { ModalAffectationRemboursement } from '../components/lettrage/ModalAffectationRemboursement'
import { TableHistoriqueLettrage } from '../components/lettrage/TableHistoriqueLettrage'
import { useLignesBancaires } from '../hooks/useLignesBancaires'
import { useRemboursements } from '../hooks/useRemboursements'
import { useLettrageForm } from '../hooks/useLettrageForm'
import { useDispatch411Attente } from '../hooks/useDispatch471'
import { useDispatch411 } from '../hooks/useDispatch411'
import { useRequalification471 } from '../hooks/useRequalification471'
import { useHistoriqueLettrage } from '../hooks/useHistoriqueLettrage'
import { useRemises } from '../hooks/useRemises'
import { useExportComptable } from '../hooks/useExportComptable'
import { useAppData } from '../contexts/AppDataContext'
import { useCorrectionContext } from '../contexts/CorrectionContext'
import { useRole } from '../contexts/RoleContext'

export function PageLettrage() {
  const { isCommercial } = useRole()
  const corr = useCorrectionContext()
  const corrOnSuccessRegistered = useRef(false)
  const [extractionOuverte, setExtractionOuverte] = useState(false)
  const [remisesOuverte, setRemisesOuverte] = useState(false)
  const [navigateurOuvert, setNavigateurOuvert] = useState(false)
  const [confirmAnnulation, setConfirmAnnulation] = useState<LigneBancaireAvecStatut | null>(null)
  const [annulationEnCours, setAnnulationEnCours] = useState(false)
  const [motifAnnulation, setMotifAnnulation] = useState('')
  const [ligneDebitAaffecter, setLigneDebitAaffecter] = useState<LigneBancaireAvecStatut | null>(null)

  const { rafraichir: rafraichirDonnees, mettreAJourResteDuLocal, supprimerFactureLocale, clients, facturesActives } = useAppData()
  const exportComptable = useExportComptable()
  const liste = useLignesBancaires()
  const historique = useHistoriqueLettrage()
  const forme = useLettrageForm(
    (data) => {
      mettreAJourResteDuLocal(data.numerosLettres)
      liste.mettreAJourLigneBancaireLocale(data.idLigneBancaire, data.montantTotal)
      liste.rafraichirSilencieux()
      if (historique.visible) historique.charger()
    },
    (_idLB, numerosLettres) => {
      if (numerosLettres.length > 0) mettreAJourResteDuLocal(numerosLettres)
      liste.rafraichirSilencieux()
      rafraichirDonnees()
    },
    (data) => {
      if (data.numerosLettres.length > 0) mettreAJourResteDuLocal(data.numerosLettres)
      liste.mettreAJourLigneBancaireLocale(data.idLigneBancaire, data.montantTotal)
      liste.rafraichirSilencieux()
      rafraichirDonnees()
    },
  )
  const dispatch411Attente = useDispatch411Attente((data) => {
    mettreAJourResteDuLocal(data.numerosLettres)
    liste.rafraichirSilencieux()
    if (historique.visible) historique.charger()
  })
  const dispatch411 = useDispatch411((data) => {
    mettreAJourResteDuLocal(data.numerosLettres)
    liste.rafraichirSilencieux()
    rafraichirDonnees()
    if (historique.visible) historique.charger()
    setVersionLignes411(v => v + 1)
  })
  const requalification471 = useRequalification471((data) => {
    mettreAJourResteDuLocal(data.numerosLettres)
    liste.rafraichirSilencieux()
    rafraichirDonnees()
    if (historique.visible) historique.charger()
  })

  const factures411 = facturesActives.filter(f => f.numero_piece.startsWith('411_') && f.reste_du < -0.005)
  const factures411Key = factures411.map(f => `${f.numero_piece}:${f.reste_du}`).join(',')
  const [lignes411Client, setLignes411Client] = useState<LigneBancaire411[]>([])
  const [versionLignes411, setVersionLignes411] = useState(0)

  useEffect(() => {
    if (factures411.length === 0) { setLignes411Client([]); return }
    const nums = factures411.map(f => f.numero_piece)
    ;(async () => {
      try {
        const { data: lettragesData } = await supabase
          .from('lettrages')
          .select('numero_facture, id_ligne_bancaire')
          .in('numero_facture', nums)
          .eq('annule', false)
          .gt('montant', 0)
        if (!lettragesData?.length) { setLignes411Client([]); return }
        const rows = lettragesData as { numero_facture: string; id_ligne_bancaire: string | null }[]
        const idToCompte: Record<string, string> = {}
        for (const r of rows) {
          if (r.id_ligne_bancaire && r.numero_facture) idToCompte[r.id_ligne_bancaire] = r.numero_facture
        }
        const ids = Object.keys(idToCompte)
        if (!ids.length) { setLignes411Client([]); return }
        const [{ data: lbData }, { data: dispatchData }] = await Promise.all([
          supabase
            .from('lignes_bancaires')
            .select('id_operation, libelle, detail, infos_complementaires, credit, debit, date_operation, en_attente_411')
            .in('id_operation', ids),
          supabase
            .from('lettrages')
            .select('numero_facture')
            .in('numero_facture', nums)
            .lt('montant', 0)
            .eq('annule', false),
        ])
        const avecDispatch = new Set((dispatchData ?? []).map(r => (r as { numero_facture: string }).numero_facture))
        type LbRow = { id_operation: string; libelle: string; detail: string | null; infos_complementaires: string | null; credit: number | null; debit: number | null; date_operation: string; en_attente_411: boolean }
        const result: LigneBancaire411[] = (lbData as LbRow[] ?? [])
          .filter(lb => !lb.en_attente_411)
          .map(lb => {
            const compte_411 = idToCompte[lb.id_operation]
            const facture411 = factures411.find(f => f.numero_piece === compte_411)
            return {
              id_operation: lb.id_operation,
              date_operation: lb.date_operation,
              libelle: lb.libelle,
              detail: lb.detail,
              infos_complementaires: lb.infos_complementaires,
              debit: lb.debit,
              credit: lb.credit,
              montant_lettre: lb.credit ?? 0,
              restant: 0,
              statut_lettrage: 'lettre' as StatutLettrage,
              derniere_date_lettrage: null,
              en_attente_411: false,
              est_virement_471: false,
              compte_411,
              reste_du_411: facture411?.reste_du ?? 0,
              a_dispatch: avecDispatch.has(compte_411),
            }
          })
        setLignes411Client(result)
      } catch { /* non bloquant */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factures411Key, versionLignes411])

  // Map id_operation → compte_411 pour fond bleu dans TableLignesBancaires
  const lignes411ClientMap = new Map<string, string>(
    lignes411Client.map(l => [l.id_operation, l.compte_411])
  )
  // Id de la ligne bancaire active dans dispatch411 (pour la surbrillance)
  const ligneBancaire411ActiveId = dispatch411.factureActive
    ? (lignes411Client.find(l => l.compte_411 === dispatch411.factureActive?.numero_piece)?.id_operation ?? null)
    : null

  // Remises : chargement initial pour le badge dans BarreResume
  const remisesHook = useRemises(() => rafraichirDonnees())
  const nbRemisesEnAttente = remisesHook.remises.filter(r => r.statut === 'en_attente').length
  const remboursements = useRemboursements(() => rafraichirDonnees())
  useEffect(() => { remisesHook.charger() }, [])
  useEffect(() => { exportComptable.charger() }, [])
  useEffect(() => { remboursements.charger() }, [])

  const remisesEnAttente = remisesHook.remises.filter(r => r.statut === 'en_attente')

  // Enregistrer le callback de succès correction dès que la page est montée
  useEffect(() => {
    corr.enregistrerOnSuccess(() => {
      liste.rafraichir()
      if (historique.visible) historique.charger()
    })
    corrOnSuccessRegistered.current = true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historique.visible])

  async function handleEncaisser(remiseId: string) {
    if (!forme.ligneActive) return
    await remisesHook.encaisser(remiseId, forme.ligneActive.id_operation)
    liste.rafraichir()
    rafraichirDonnees()
    if (historique.visible) historique.charger()
    forme.annuler()
  }

  function handleSelectLigne(ligne: Parameters<typeof forme.selectionnerLigne>[0]) {
    if (isCommercial) return
    if (liste.filtre === 'compte') {
      if (dispatch411Attente.ligneActive?.id_operation === ligne.id_operation) {
        dispatch411Attente.annuler()
      } else {
        dispatch411Attente.selectionnerLigne(ligne)
      }
    } else if (liste.filtre === 'autres_virements') {
      if (requalification471.ligneActive?.id_operation === ligne.id_operation) {
        requalification471.annuler()
      } else {
        requalification471.selectionnerLigne(ligne)
      }
    } else {
      if (dispatch411.factureActive) dispatch411.annuler()
      if (forme.ligneActive?.id_operation === ligne.id_operation) {
        forme.annuler()
      } else {
        forme.selectionnerLigne(ligne)
      }
    }
  }

  function handleSelect411ClientLigne(ligne: LigneBancaireAvecStatut, compte411: string) {
    if (isCommercial) return
    forme.annuler()
    requalification471.annuler()
    dispatch411Attente.annuler()
    const facture411 = facturesActives.find(f => f.numero_piece === compte411) ?? null
    if (!facture411) return
    if (dispatch411.factureActive?.numero_piece === compte411) {
      dispatch411.annuler()
    } else {
      dispatch411.selectionnerFacture411(facture411)
    }
  }

  async function confirmerAnnulation() {
    if (!confirmAnnulation) return
    setAnnulationEnCours(true)
    try {
      // Récupérer les références 411 avant annulation
      const { data: lettragesRaw } = await supabase
        .from('lettrages')
        .select('numero_facture')
        .eq('id_ligne_bancaire', confirmAnnulation.id_operation)
        .eq('annule', false)
      const nums411 = [...new Set(
        (lettragesRaw as { numero_facture: string | null }[] ?? [])
          .map(l => l.numero_facture)
          .filter((n): n is string => !!n && n.startsWith('411_'))
      )]

      const { error } = await supabase
        .from('lettrages')
        .update({ annule: true, motif_annulation: motifAnnulation.trim() || null } as never)
        .eq('id_ligne_bancaire', confirmAnnulation.id_operation)
      if (error) throw error

      if (confirmAnnulation.en_attente_411) {
        await supabase
          .from('lignes_bancaires')
          .update({ en_attente_411: false } as never)
          .eq('id_operation', confirmAnnulation.id_operation)
      }

      // Supprimer les pseudo-factures 411 sans lettrage actif restant
      for (const num411 of nums411) {
        const { count } = await supabase
          .from('lettrages')
          .select('id', { count: 'exact', head: true })
          .eq('numero_facture', num411)
          .eq('annule', false)
        if (count === 0) {
          await supabase.from('factures').delete().eq('numero_piece', num411)
          supprimerFactureLocale(num411)
        }
      }

      if (forme.ligneActive?.id_operation === confirmAnnulation.id_operation) forme.annuler()
      if (dispatch411Attente.ligneActive?.id_operation === confirmAnnulation.id_operation) dispatch411Attente.annuler()
      if (requalification471.ligneActive?.id_operation === confirmAnnulation.id_operation) requalification471.annuler()
      if (nums411.includes(dispatch411.factureActive?.numero_piece ?? '')) dispatch411.annuler()
      liste.rafraichir()
      rafraichirDonnees()
      toast.success('Lettrage annulé')
      setMotifAnnulation('')
      setConfirmAnnulation(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'annulation du lettrage')
    } finally {
      setAnnulationEnCours(false)
    }
  }

  function handleChangerFiltre(filtre: Parameters<typeof liste.setFiltre>[0]) {
    forme.annuler()
    dispatch411Attente.annuler()
    dispatch411.annuler()
    requalification471.annuler()
    liste.setFiltre(filtre)
  }

  return (
    <div>
      {/* En-tête */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Lettrage</h1>
          <p className="text-sm text-gray-400 mt-0.5">Associez les crédits bancaires à vos factures</p>
        </div>
        <button
          onClick={() => setExtractionOuverte(true)}
          className="flex items-center gap-2 text-sm font-semibold text-white bg-ockham-navy hover:bg-ockham-navy/90 px-4 py-2 rounded-lg transition-colors"
        >
          <IcDownload size={14} /> Extraction
        </button>
      </div>

      {/* Barre de résumé */}
      <BarreResume
        nbNonLettres={liste.nbNonLettres}
        montantRestant={liste.montantRestant}
        nbRemisesEnAttente={nbRemisesEnAttente}
        nbLignesGlobal={liste.nbLignesGlobal}
        onCorrection={() => corr.ouvrir()}
        onOuvrirRemises={() => setRemisesOuverte(true)}
        readOnly={isCommercial}
      />

      {/* Deux panneaux */}
      <div className="grid grid-cols-[1fr_360px] gap-4 items-start">
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <ToolbarLettrage
            recherche={liste.recherche}
            onRecherche={liste.setRecherche}
            filtre={liste.filtre}
            onFiltre={handleChangerFiltre}
            dateDebut={liste.dateDebut}
            dateFin={liste.dateFin}
            onDateDebut={liste.setDateDebut}
            onDateFin={liste.setDateFin}
            onHistorique={historique.toggle}
          />
          <div key={liste.filtre} className="animate-fade-in">
            {liste.filtre === 'compte' ? (
              <TableCompte
                lignes411Attente={liste.lignes.filter(l => l.en_attente_411)}
                selectedId={dispatch411Attente.ligneActive?.id_operation ?? null}
                onSelect411Attente={(l) => {
                  dispatch411.annuler()
                  if (dispatch411Attente.ligneActive?.id_operation === l.id_operation) dispatch411Attente.annuler()
                  else dispatch411Attente.selectionnerLigne(l)
                }}
                onAnnuler411Attente={setConfirmAnnulation}
                chargement={liste.chargement}
                lignesExportees={exportComptable.lignesExportees}
              />
            ) : (
              <TableLignesBancaires
                lignes={liste.lignes}
                chargement={liste.chargement}
                ligneActiveId={
                  liste.filtre === 'autres_virements'
                    ? requalification471.ligneActive?.id_operation ?? null
                    : forme.ligneActive?.id_operation ?? ligneBancaire411ActiveId
                }
                page={liste.page}
                totalPages={liste.totalPages}
                onPage={liste.setPage}
                onSelectLigne={handleSelectLigne}
                onAnnulerLettrage={setConfirmAnnulation}
                onAffecterRemboursement={l => { remboursements.charger(); setLigneDebitAaffecter(l) }}
                lignesExportees={exportComptable.lignesExportees}
                readOnly={isCommercial}
                lignes411ClientMap={lignes411ClientMap}
                onSelect411Client={handleSelect411ClientLigne}
              />
            )}
          </div>
        </div>

        {liste.filtre === 'compte' ? (
          dispatch411.factureActive ? (
            <PanneauDispatch411 {...dispatch411} />
          ) : (
            <PanneauDispatch411Attente {...dispatch411Attente} />
          )
        ) : dispatch411.factureActive ? (
          <PanneauDispatch411 {...dispatch411} />
        ) : liste.filtre === 'autres_virements' ? (
          <PanneauRequalification471 {...requalification471} />
        ) : (
          <PanneauLettrage
            {...forme}
            onOuvrirCorrection={() => corr.ouvrir()}
            onOuvrirNavigateur={() => setNavigateurOuvert(true)}
            remisesEnAttente={remisesEnAttente}
            onEncaisser={handleEncaisser}
            clients={clients}
            dateExport={forme.ligneActive ? (exportComptable.lignesExportees.get(forme.ligneActive.id_operation) ?? null) : null}
          />
        )}
      </div>

      {/* Modal historique */}
      {historique.visible && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) historique.toggle() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2"><IcClock size={15} className="text-gray-400 flex-shrink-0" /> Historique des lettrages</h3>
                {historique.lignes.length > 0 && !historique.recherche && (
                  <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {historique.lignes.length} dernières actions
                  </span>
                )}
              </div>
              <button
                onClick={historique.toggle}
                className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 flex items-center justify-center transition-colors"
              ><IcX size={13} /></button>
            </div>
            <div className="overflow-auto flex-1">
              <TableHistoriqueLettrage
                lignes={historique.lignes}
                lignesServeur={historique.lignesServeur}
                chargement={historique.chargement}
                chargementServeur={historique.chargementServeur}
                clients={clients}
                recherche={historique.recherche}
                onRecherche={historique.setRecherche}
                page={historique.page}
                onPage={historique.setPage}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal correction — état géré par CorrectionContext */}
      <ModalCorrection />

      {/* Modal affectation remboursement — depuis ligne Débit */}
      <ModalAffectationRemboursement
        ouvert={ligneDebitAaffecter !== null}
        ligneBancaire={ligneDebitAaffecter}
        enAttente={remboursements.enAttente}
        onAffecter={async (rembId, idLb) => {
          await remboursements.affecter(rembId, idLb)
          liste.rafraichirSilencieux()
        }}
        onFermer={() => setLigneDebitAaffecter(null)}
      />

      {/* Modal extraction */}
      <ModalExtractionLettrage
        ouvert={extractionOuverte}
        onFermer={() => setExtractionOuverte(false)}
        historique={exportComptable.historique}
        chargementExport={exportComptable.chargement}
        onApercu={exportComptable.apercu}
        onExporter={exportComptable.exporter}
        onRetelecharger={exportComptable.retelecharger}
      />

      {/* Modal navigateur factures */}
      <ModalNavigateurFactures
        ouvert={navigateurOuvert}
        ligneActive={forme.ligneActive}
        onFermer={() => setNavigateurOuvert(false)}
        onInjecter={forme.injecterFactures}
      />

      {/* Modal remises Chèque / LCR */}
      <ModalRemises
        ouvert={remisesOuverte}
        onFermer={() => setRemisesOuverte(false)}
        onSuccess={(data) => {
          if (data?.numerosLettres) mettreAJourResteDuLocal(data.numerosLettres)
          liste.rafraichirSilencieux()
          remisesHook.charger()
        }}
      />

      {/* Confirmation annulation lettrage */}
      {confirmAnnulation && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="text-sm font-semibold text-gray-800">Annuler ce lettrage ?</p>
            <p className="text-xs text-gray-500">
              Toutes les affectations de la ligne <span className="font-medium text-gray-700">«&nbsp;{confirmAnnulation.libelle}&nbsp;»</span> seront supprimées. La ligne retournera dans «&nbsp;À lettrer&nbsp;».
            </p>
            <textarea
              value={motifAnnulation}
              onChange={e => setMotifAnnulation(e.target.value)}
              placeholder="Motif d'annulation (optionnel)"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 placeholder-gray-400 outline-none focus:border-ockham-teal resize-none transition-colors"
            />
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => { setConfirmAnnulation(null); setMotifAnnulation('') }}
                disabled={annulationEnCours}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmerAnnulation}
                disabled={annulationEnCours}
                className="px-4 py-2 text-xs font-semibold text-white bg-ockham-navy hover:bg-ockham-navy/90 rounded-lg transition-colors disabled:opacity-50"
              >
                {annulationEnCours ? 'En cours…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
