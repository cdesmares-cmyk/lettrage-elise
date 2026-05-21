import { useState, useEffect } from 'react'
import { useRelances } from '../hooks/useRelances'
import { useGmailAuth } from '../hooks/useGmailAuth'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useCommentairesFactures } from '../hooks/useCommentairesFactures'
import { KpisRelances } from '../components/relances/KpisRelances'
import { TableauRelances } from '../components/relances/TableauRelances'
import { ListePriorites } from '../components/relances/ListePriorites'
import { LeaderboardEquipe } from '../components/relances/LeaderboardEquipe'
import { ModalCompositionRelance } from '../components/relances/ModalCompositionRelance'
import { PanneauCommentaireFacture } from '../components/compte-client/PanneauCommentaireFacture'
import { useRole } from '../contexts/RoleContext'
import type { CompteClient, FactureDetail } from '../types/client'

export function PageRelances() {
  const { relances, chargement, kpis, mettreAJourStatut, mettreAJourNote, archiver } = useRelances()
  const { isCommercial } = useRole()
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
          <h1 className="text-xl font-bold text-gray-900">Relances</h1>
          <p className="text-sm text-gray-400 mt-0.5">Suivi et gamification de votre activité de recouvrement</p>
        </div>
        {!isCommercial && classement.length > 0 && (
          <button
            onClick={() => setShowLeaderboard(true)}
            className="text-sm font-semibold text-ockham-teal border border-ockham-teal/30 bg-ockham-teal-muted hover:bg-ockham-teal hover:text-white px-5 py-2.5 rounded-xl transition-colors"
          >
            Classement équipe ↗
          </button>
        )}
      </div>

      {/* KPIs dynamiques */}
      {!isCommercial && (
        <KpisRelances relances={relances} filtreOp={filtreOp} kpis={kpis} />
      )}

      {/* Tableau pleine largeur */}
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

      {/* 3 blocs de priorités */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-ockham-navy/60 uppercase tracking-wider">À relancer en priorité</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ListePriorites relances={relances} onRelancer={setClientRelance} commentaires={commentaires} mode="score" />
          <ListePriorites relances={relances} onRelancer={setClientRelance} commentaires={commentaires} mode="encours" />
          <ListePriorites relances={relances} onRelancer={setClientRelance} commentaires={commentaires} mode="anciennete" />
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

      {/* Panneau commentaire facture (depuis ligne expandée) */}
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

      {/* Modal composition relance */}
      <ModalCompositionRelance
        client={clientRelance}
        onFermer={() => setClientRelance(null)}
        onSent={() => setClientRelance(null)}
        gmailAuth={gmailAuth}
        commentaires={commentaires}
      />
    </div>
  )
}
