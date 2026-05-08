// Onglet 2 — Lettrage : affectation des crédits bancaires aux factures (Sprint 2)
import { useState, useEffect } from 'react'
import { BarreResume } from '../components/lettrage/BarreResume'
import { TableLignesBancaires } from '../components/lettrage/TableLignesBancaires'
import { PanneauLettrage } from '../components/lettrage/PanneauLettrage'
import { ModalCorrection } from '../components/lettrage/ModalCorrection'
import { ModalRemises } from '../components/lettrage/ModalRemises'
import { ModalExtractionLettrage } from '../components/lettrage/ModalExtractionLettrage'
import { TableHistoriqueLettrage } from '../components/lettrage/TableHistoriqueLettrage'
import { useLignesBancaires } from '../hooks/useLignesBancaires'
import { useLettrageForm } from '../hooks/useLettrageForm'
import { useHistoriqueLettrage } from '../hooks/useHistoriqueLettrage'
import { useRemises } from '../hooks/useRemises'
import { useAppData } from '../contexts/AppDataContext'

export function PageLettrage() {
  const [correctionOuverte, setCorrectionOuverte] = useState(false)
  const [extractionOuverte, setExtractionOuverte] = useState(false)
  const [remisesOuverte, setRemisesOuverte] = useState(false)

  const { rafraichir: rafraichirDonnees } = useAppData()
  const liste = useLignesBancaires()
  const historique = useHistoriqueLettrage()
  // Après chaque lettrage validé : rafraîchit les lignes bancaires, le cache et l'historique
  const forme = useLettrageForm(() => { liste.rafraichir(); rafraichirDonnees(); if (historique.visible) historique.charger() })
  // Remises : chargement initial pour le badge dans BarreResume
  const remisesHook = useRemises(() => rafraichirDonnees())
  const nbRemisesEnAttente = remisesHook.remises.filter(r => r.statut === 'en_attente').length
  useEffect(() => { remisesHook.charger() }, [])

  // Remises dont le montant correspond au crédit de la ligne sélectionnée (± 5 ct)
  const creditActif = forme.ligneActive?.credit ?? 0
  const remisesCorrespondantes = remisesHook.remises.filter(r => {
    if (r.statut !== 'en_attente') return false
    const total = r.montant_total ?? r.lignes.reduce((s, l) => s + l.montant, 0)
    return Math.abs(total - creditActif) <= 0.05
  })

  async function handleEncaisser(remiseId: string) {
    if (!forme.ligneActive) return
    await remisesHook.encaisser(remiseId, forme.ligneActive.id_operation)
    liste.rafraichir()
    rafraichirDonnees()
    if (historique.visible) historique.charger()
    forme.annuler()
  }

  function handleSelectLigne(ligne: Parameters<typeof forme.selectionnerLigne>[0]) {
    // Si on clique sur la ligne déjà active → désélectionner
    if (forme.ligneActive?.id_operation === ligne.id_operation) {
      forme.annuler()
    } else {
      forme.selectionnerLigne(ligne)
    }
  }

  return (
    <div>
      {/* En-tête */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Lettrage</h1>
          <p className="text-sm text-gray-500 mt-0.5">Associez les crédits bancaires à vos factures</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />100 % lettré</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Partiel</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Non lettré</span>
          </div>
          <button
            onClick={() => setExtractionOuverte(true)}
            className="flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors"
          >
            ⬇ Extraction
          </button>
        </div>
      </div>

      {/* Barre de résumé */}
      <BarreResume
        nbNonLettres={liste.nbNonLettres}
        montantRestant={liste.montantRestant}
        nbRemisesEnAttente={nbRemisesEnAttente}
        onCorrection={() => setCorrectionOuverte(true)}
        onOuvrirRemises={() => setRemisesOuverte(true)}
      />

      {/* Deux panneaux */}
      <div className="grid grid-cols-[1fr_360px] gap-4 items-start">
        <TableLignesBancaires
          lignes={liste.lignes}
          chargement={liste.chargement}
          ligneActiveId={forme.ligneActive?.id_operation ?? null}
          recherche={liste.recherche}
          filtre={liste.filtre}
          dateDebut={liste.dateDebut}
          dateFin={liste.dateFin}
          onRecherche={liste.setRecherche}
          onFiltre={liste.setFiltre}
          onDateDebut={liste.setDateDebut}
          onDateFin={liste.setDateFin}
          onSelectLigne={handleSelectLigne}
          onHistorique={historique.toggle}
        />

        <PanneauLettrage
          {...forme}
          onOuvrirCorrection={() => setCorrectionOuverte(true)}
          remisesCorrespondantes={remisesCorrespondantes}
          onEncaisser={handleEncaisser}
        />
      </div>

      {/* Modal historique */}
      {historique.visible && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) historique.toggle() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-gray-900">📋 Historique des lettrages</h3>
                {historique.lignes.length > 0 && (
                  <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {historique.lignes.length} actions
                  </span>
                )}
              </div>
              <button
                onClick={historique.toggle}
                className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors"
              >✕</button>
            </div>
            <div className="overflow-auto flex-1">
              <TableHistoriqueLettrage lignes={historique.lignes} chargement={historique.chargement} />
            </div>
          </div>
        </div>
      )}

      {/* Modal correction */}
      <ModalCorrection
        ouvert={correctionOuverte}
        onFermer={() => setCorrectionOuverte(false)}
        onSuccess={() => { liste.rafraichir(); if (historique.visible) historique.charger() }}
      />

      {/* Modal extraction */}
      <ModalExtractionLettrage
        ouvert={extractionOuverte}
        onFermer={() => setExtractionOuverte(false)}
      />

      {/* Modal remises Chèque / LCR */}
      <ModalRemises
        ouvert={remisesOuverte}
        onFermer={() => setRemisesOuverte(false)}
        onSuccess={() => { liste.rafraichir(); rafraichirDonnees(); remisesHook.charger() }}
      />
    </div>
  )
}
