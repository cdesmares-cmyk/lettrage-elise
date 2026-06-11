// Onglet 2 — Lettrage : affectation des crédits bancaires aux factures (Sprint 2)
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { IcDownload, IcClock, IcX } from '../components/Icones'
import type { LigneBancaireAvecStatut } from '../types/lettrage'
import type { FactureDetail } from '../types/client'
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
  const [confirmAnnulation411, setConfirmAnnulation411] = useState<FactureDetail | null>(null)
  const [annulationEnCours, setAnnulationEnCours] = useState(false)
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
    // Recharge les gardes X pour les dispatches partiels
    setVersionComptes411(v => v + 1)
  })
  const requalification471 = useRequalification471((data) => {
    mettreAJourResteDuLocal(data.numerosLettres)
    liste.rafraichirSilencieux()
    rafraichirDonnees()
    if (historique.visible) historique.charger()
  })

  const factures411 = facturesActives.filter(f => f.numero_piece.startsWith('411_') && f.reste_du < -0.005)
  const [libelles411, setLibelles411] = useState<Record<string, { libelle: string; detail: string | null; idLigneBancaire?: string }>>({})
  const [comptes411AvecDispatch, setComptes411AvecDispatch] = useState<Set<string>>(new Set())
  const [versionComptes411, setVersionComptes411] = useState(0)
  useEffect(() => {
    if (factures411.length === 0) { setLibelles411({}); return }
    const nums = factures411.map(f => f.numero_piece)
    supabase
      .from('lettrages')
      .select('numero_facture, id_ligne_bancaire')
      .in('numero_facture', nums)
      .eq('annule', false)
      .then(async ({ data }) => {
        try {
          if (!data?.length) return
          const rows = data as { numero_facture: string; id_ligne_bancaire: string | null }[]
          const idToNum: Record<string, string> = {}
          for (const r of rows) {
            if (r.id_ligne_bancaire && r.numero_facture) idToNum[r.id_ligne_bancaire] = r.numero_facture
          }
          const ids = Object.keys(idToNum)
          if (!ids.length) return
          const { data: lb } = await supabase
            .from('lignes_bancaires')
            .select('id_operation, libelle, detail')
            .in('id_operation', ids)
          if (!lb) return
          const result: Record<string, { libelle: string; detail: string | null }> = {}
          for (const r of lb as { id_operation: string; libelle: string; detail: string | null }[]) {
            const num = idToNum[r.id_operation]
            if (num) result[num] = { libelle: r.libelle, detail: r.detail, idLigneBancaire: r.id_operation }
          }
          setLibelles411(result)
        } catch { /* libelles411 reste vide, affiché sans libellé bancaire */ }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factures411.length])

  // Charge quels comptes 411 ont au moins un dispatch partiel (entrées de correction)
  useEffect(() => {
    if (factures411.length === 0) { setComptes411AvecDispatch(new Set()); return }
    const nums = factures411.map(f => f.numero_piece)
    supabase
      .from('lettrages')
      .select('numero_facture')
      .in('numero_facture', nums)
      .lt('montant', 0)
      .eq('annule', false)
      .then(({ data }) => {
        setComptes411AvecDispatch(new Set((data ?? []).map(r => String((r as { numero_facture: string }).numero_facture))))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factures411.length, versionComptes411])
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
      if (forme.ligneActive?.id_operation === ligne.id_operation) {
        forme.annuler()
      } else {
        forme.selectionnerLigne(ligne)
      }
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
        .update({ annule: true } as never)
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
      liste.rafraichir()
      if (nums411.length > 0) rafraichirDonnees()
      toast.success('Lettrage annulé')
      setConfirmAnnulation(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'annulation du lettrage')
    } finally {
      setAnnulationEnCours(false)
    }
  }

  async function confirmerAnnulation411() {
    if (!confirmAnnulation411) return
    const numeroPiece = confirmAnnulation411.numero_piece
    setAnnulationEnCours(true)
    try {
      // 1. Récupérer les lignes bancaires liées à ce compte 411 (lettrages actifs)
      const { data: lettragesRows } = await supabase
        .from('lettrages')
        .select('id_ligne_bancaire')
        .eq('numero_facture', numeroPiece)
        .eq('annule', false)
      const idLignes = [...new Set(
        (lettragesRows as { id_ligne_bancaire: string | null }[] ?? [])
          .map(r => r.id_ligne_bancaire)
          .filter((id): id is string => !!id)
      )]

      // 2. Garde export : bloquer si une ligne bancaire liée a déjà été exportée
      const idExporte = idLignes.find(id => exportComptable.lignesExportees.has(id))
      if (idExporte) {
        toast.error('Export comptable effectué sur cette ligne — impossible d\'annuler. Utilisez le module Correction.')
        setConfirmAnnulation411(null)
        return
      }

      // 3. Garde dispatch partiel
      const { count: nbCorrections } = await supabase
        .from('lettrages')
        .select('id', { count: 'exact', head: true })
        .eq('numero_facture', numeroPiece)
        .lt('montant', 0)
        .eq('annule', false)
      if (nbCorrections && nbCorrections > 0) {
        toast.error('Ce compte 411 a des affectations partielles — impossible d\'annuler.')
        setConfirmAnnulation411(null)
        return
      }

      // 4. Annuler tous les lettrages des lignes bancaires liées (mix inclus)
      if (idLignes.length > 0) {
        const { error } = await supabase
          .from('lettrages')
          .update({ annule: true } as never)
          .in('id_ligne_bancaire', idLignes)
          .eq('annule', false)
        if (error) throw error

        await supabase
          .from('lignes_bancaires')
          .update({ en_attente_411: false } as never)
          .in('id_operation', idLignes)
      }

      // 5. Forcer reste_du = 0 sur la facture 411
      // (filet de sécurité si le trigger sync_reste_du n'a pas pu s'exécuter)
      await supabase
        .from('factures')
        .update({ reste_du: 0 } as never)
        .eq('numero_piece', numeroPiece)

      // 6. Supprimer la facture uniquement si aucun lettrage ne la référence encore
      // (contrainte FK lettrages → factures sans ON DELETE CASCADE)
      const { count: nbRef } = await supabase
        .from('lettrages')
        .select('id', { count: 'exact', head: true })
        .eq('numero_facture', numeroPiece)
      if ((nbRef ?? 1) === 0) {
        await supabase.from('factures').delete().eq('numero_piece', numeroPiece)
      }

      if (dispatch411.factureActive?.numero_piece === numeroPiece) dispatch411.annuler()
      if (idLignes.includes(dispatch411Attente.ligneActive?.id_operation ?? '')) dispatch411Attente.annuler()

      supprimerFactureLocale(numeroPiece)
      liste.rafraichir()
      rafraichirDonnees()
      toast.success('Compte 411 annulé')
      setConfirmAnnulation411(null)
    } catch (err) {
      rafraichirDonnees()
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'annulation')
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
                factures411={factures411}
                lignes411Attente={liste.lignes.filter(l => l.en_attente_411)}
                selectedId={dispatch411.factureActive?.numero_piece ?? dispatch411Attente.ligneActive?.id_operation ?? null}
                onSelect411={(f) => {
                  dispatch411Attente.annuler()
                  if (dispatch411.factureActive?.numero_piece === f.numero_piece) dispatch411.annuler()
                  else dispatch411.selectionnerFacture411(f)
                }}
                onSelect411Attente={(l) => {
                  dispatch411.annuler()
                  if (dispatch411Attente.ligneActive?.id_operation === l.id_operation) dispatch411Attente.annuler()
                  else dispatch411Attente.selectionnerLigne(l)
                }}
                onAnnuler411={setConfirmAnnulation411}
                onAnnuler411Attente={setConfirmAnnulation}
                chargement={liste.chargement}
                libelles411={libelles411}
                recherche={liste.recherche}
                lignesExportees={exportComptable.lignesExportees}
                comptes411AvecDispatch={comptes411AvecDispatch}
              />
            ) : (
              <TableLignesBancaires
                lignes={liste.lignes}
                chargement={liste.chargement}
                ligneActiveId={liste.filtre === 'autres_virements' ? requalification471.ligneActive?.id_operation ?? null : forme.ligneActive?.id_operation ?? null}
                page={liste.page}
                totalPages={liste.totalPages}
                onPage={liste.setPage}
                onSelectLigne={handleSelectLigne}
                onAnnulerLettrage={setConfirmAnnulation}
                onAffecterRemboursement={l => { remboursements.charger(); setLigneDebitAaffecter(l) }}
                lignesExportees={exportComptable.lignesExportees}
                readOnly={isCommercial}
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

      {/* Confirmation annulation compte 411 */}
      {confirmAnnulation411 && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="text-sm font-semibold text-gray-800">Annuler ce compte 411 ?</p>
            <p className="text-xs text-gray-500">
              Le compte <span className="font-medium text-gray-700">«&nbsp;{confirmAnnulation411.nom_client ?? confirmAnnulation411.numero_piece}&nbsp;»</span> sera supprimé et la ligne bancaire associée retournera dans «&nbsp;À lettrer&nbsp;».
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setConfirmAnnulation411(null)}
                disabled={annulationEnCours}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmerAnnulation411}
                disabled={annulationEnCours}
                className="px-4 py-2 text-xs font-semibold text-white bg-ockham-navy hover:bg-ockham-navy/90 rounded-lg transition-colors disabled:opacity-50"
              >
                {annulationEnCours ? 'En cours…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation annulation lettrage */}
      {confirmAnnulation && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="text-sm font-semibold text-gray-800">Annuler ce lettrage ?</p>
            <p className="text-xs text-gray-500">
              Toutes les affectations de la ligne <span className="font-medium text-gray-700">«&nbsp;{confirmAnnulation.libelle}&nbsp;»</span> seront supprimées. La ligne retournera dans «&nbsp;À lettrer&nbsp;».
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setConfirmAnnulation(null)}
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
