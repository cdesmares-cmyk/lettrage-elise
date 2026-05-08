// Onglet 2 — Lettrage : affectation des crédits bancaires aux factures (Sprint 2)
import { useState } from 'react'
import { BarreResume } from '../components/lettrage/BarreResume'
import { TableLignesBancaires } from '../components/lettrage/TableLignesBancaires'
import { PanneauLettrage } from '../components/lettrage/PanneauLettrage'
import { ModalCorrection } from '../components/lettrage/ModalCorrection'
import { ModalExtractionLettrage } from '../components/lettrage/ModalExtractionLettrage'
import { TableHistoriqueLettrage } from '../components/lettrage/TableHistoriqueLettrage'
import { useLignesBancaires } from '../hooks/useLignesBancaires'
import { useLettrageForm } from '../hooks/useLettrageForm'
import { useHistoriqueLettrage } from '../hooks/useHistoriqueLettrage'
import { useAppData } from '../contexts/AppDataContext'

export function PageLettrage() {
  const [correctionOuverte, setCorrectionOuverte] = useState(false)
  const [extractionOuverte, setExtractionOuverte] = useState(false)

  const { rafraichir: rafraichirDonnees } = useAppData()
  const liste = useLignesBancaires()
  const historique = useHistoriqueLettrage()
  // Après chaque lettrage validé : rafraîchit les lignes bancaires, le cache et l'historique
  const forme = useLettrageForm(() => { liste.rafraichir(); rafraichirDonnees(); if (historique.visible) historique.charger() })

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
        onCorrection={() => setCorrectionOuverte(true)}
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
        />

        <PanneauLettrage
          {...forme}
          onOuvrirCorrection={() => setCorrectionOuverte(true)}
        />
      </div>

      {/* Bloc historique */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={historique.toggle}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-gray-800">📋 Historique des lettrages</span>
            {historique.lignes.length > 0 && (
              <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {historique.lignes.length} actions
              </span>
            )}
          </div>
          <span className={`text-gray-400 text-xs transition-transform ${historique.visible ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {historique.visible && (
          <div className="border-t border-gray-100">
            <TableHistoriqueLettrage lignes={historique.lignes} chargement={historique.chargement} />
          </div>
        )}
      </div>

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
    </div>
  )
}
