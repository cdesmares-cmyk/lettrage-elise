// Onglet 2 — Lettrage : affectation des crédits bancaires aux factures (Sprint 2)
import { useState } from 'react'
import { BarreResume } from '../components/lettrage/BarreResume'
import { TableLignesBancaires } from '../components/lettrage/TableLignesBancaires'
import { PanneauLettrage } from '../components/lettrage/PanneauLettrage'
import { ModalCorrection } from '../components/lettrage/ModalCorrection'
import { ModalExtractionLettrage } from '../components/lettrage/ModalExtractionLettrage'
import { useLignesBancaires } from '../hooks/useLignesBancaires'
import { useLettrageForm } from '../hooks/useLettrageForm'

export function PageLettrage() {
  const [correctionOuverte, setCorrectionOuverte] = useState(false)
  const [extractionOuverte, setExtractionOuverte] = useState(false)

  const liste = useLignesBancaires()
  const forme = useLettrageForm(liste.rafraichir)

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

      {/* Modal correction */}
      <ModalCorrection
        ouvert={correctionOuverte}
        onFermer={() => setCorrectionOuverte(false)}
        onSuccess={liste.rafraichir}
      />

      {/* Modal extraction */}
      <ModalExtractionLettrage
        ouvert={extractionOuverte}
        onFermer={() => setExtractionOuverte(false)}
      />
    </div>
  )
}
