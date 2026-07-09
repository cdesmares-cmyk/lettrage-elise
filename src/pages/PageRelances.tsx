import { useState, useEffect } from 'react'
import { useRelances } from '../hooks/useRelances'
import { useGmailAuth } from '../hooks/useGmailAuth'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useCommentairesFactures } from '../hooks/useCommentairesFactures'
import { BarreKpisRelances } from '../components/relances/BarreKpisRelances'
import { TableauRelances } from '../components/relances/TableauRelances'
import { ListePriorites } from '../components/relances/ListePriorites'
import { LeaderboardEquipe } from '../components/relances/LeaderboardEquipe'
import { ModalCompositionRelance } from '../components/relances/ModalCompositionRelance'
import { ModalParametresRelances } from '../components/admin/ModalParametresRelances'
import { PanneauCommentaireFacture } from '../components/compte-client/PanneauCommentaireFacture'
import { PanneauGamification } from '../components/relances/PanneauGamification'
import { useRole } from '../contexts/RoleContext'
import { IcSliders } from '../components/Icones'
import type { CompteClient, FactureDetail } from '../types/client'

export function PageRelances() {
  const { relances, chargement, kpis, mettreAJourStatut, mettreAJourNote, archiver } = useRelances()
  const { isCommercial, peutModifier } = useRole()
  const [scenariosOuvert, setScenariosOuvert] = useState(false)
  const [clientRelance, setClientRelance] = useState<CompteClient | null>(null)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [filtreOp, setFiltreOp] = useState('tous')
  const [factureCommentee, setFactureCommentee] = useState<FactureDetail | null>(null)
  const gmailAuth = useGmailAuth()
  const classement = useLeaderboard(relances)
  const { commentaires, chargerTous, sauvegarder } = useCommentairesFactures()

  useEffect(() => { chargerTous() }, [])

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Relances</h1>
          <p className="text-sm text-gray-400 mt-0.5">Pilotage du recouvrement</p>
        </div>
        <div className="flex items-center gap-2">
          {peutModifier && (
            <button
              onClick={() => setScenariosOuvert(true)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:border-ockham-teal hover:text-ockham-teal px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              <IcSliders size={13} />
              Paramètres Relances
            </button>
          )}
          {!isCommercial && classement.length > 0 && (
            <button
              onClick={() => setShowLeaderboard(true)}
              className="text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:border-ockham-teal hover:text-ockham-teal px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              Classement équipe ↗
            </button>
          )}
        </div>
      </div>

      {/* KPIs unifiés : Total € + pipeline */}
      <BarreKpisRelances relances={relances} filtreOp={filtreOp} chargement={chargement} />

      {/* Tableau relances */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-ockham-navy/60 uppercase tracking-wider">Relances récentes</p>
        <TableauRelances
          relances={relances}
          chargement={chargement}
          onMajStatut={mettreAJourStatut}
          onArchiver={archiver}
          onSauvegarderNote={mettreAJourNote}
          onOuvrirCommentaire={setFactureCommentee}
          classement={classement}
          commentaires={commentaires}
          filtreOp={filtreOp}
          onFiltreOpChange={setFiltreOp}
        />
      </div>

      {/* Priorités + gamification côte à côte */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-ockham-navy/60 uppercase tracking-wider">À relancer en priorité</p>
        <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <ListePriorites relances={relances} onRelancer={setClientRelance} commentaires={commentaires} />
          <PanneauGamification relances={relances} kpis={kpis} classement={classement} />
        </div>
      </div>

      {/* Panneau latéral classement */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-end" onClick={() => setShowLeaderboard(false)}>
          <div
            className="bg-white border-l border-gray-200 shadow-2xl h-full w-full max-w-sm overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <p className="text-[11px] font-bold text-ockham-navy/60 uppercase tracking-wider">Classement équipe</p>
              <button onClick={() => setShowLeaderboard(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <LeaderboardEquipe classement={classement} />
          </div>
        </div>
      )}

      {/* Panneau commentaire facture */}
      <PanneauCommentaireFacture
        facture={factureCommentee}
        commentaire={factureCommentee ? (commentaires.get(factureCommentee.numero_piece) ?? null) : null}
        onFermer={() => setFactureCommentee(null)}
        onSauvegarder={async data => {
          const ok = await sauvegarder(data)
          if (ok) setFactureCommentee(null)
          return ok
        }}
        onStatutChange={() => {}}
      />

      {/* Modal composition relance (depuis priorités) */}
      <ModalCompositionRelance
        client={clientRelance}
        onFermer={() => setClientRelance(null)}
        onSent={() => setClientRelance(null)}
        gmailAuth={gmailAuth}
        commentaires={commentaires}
      />

      {scenariosOuvert && <ModalParametresRelances onClose={() => setScenariosOuvert(false)} />}
    </div>
  )
}
