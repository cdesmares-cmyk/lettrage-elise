import { useState, useEffect, useMemo } from 'react'
import { useRelances, etatVue } from '../hooks/useRelances'
import type { EtatVueRelance } from '../hooks/useRelances'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useCommentairesFactures } from '../hooks/useCommentairesFactures'
import { BarreKpisRelances } from '../components/relances/BarreKpisRelances'
import { TableauRelances } from '../components/relances/TableauRelances'
import { LeaderboardEquipe } from '../components/relances/LeaderboardEquipe'
import { ModalParametresRelances } from '../components/admin/ModalParametresRelances'
import { useRole } from '../contexts/RoleContext'
import { IcSliders } from '../components/Icones'

const IcClock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IcCheckCircle = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
)
const IcXCircle = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
)

function infoStrip(seuil: number): Record<EtatVueRelance, string> {
  return {
    en_cours:   `1 relance affichée par client · seuil sans suite : ${seuil} jours · alerte à J-${seuil - 10}`,
    payee:      'Paiement détecté automatiquement à l\'ouverture · archivage automatique à 60 jours',
    sans_suite: `Aucun retour client depuis ${seuil} jours · archivage automatique à 60 jours`,
  }
}

export function PageRelances() {
  const { relances, chargement, mettreAJourStatut, mettreAJourNote, archiver, seuilSansSuite, facturesMapRelances, lettragesMap } = useRelances()
  const { isCommercial, peutModifier } = useRole()
  const [ongletActif, setOngletActif] = useState<EtatVueRelance>('en_cours')
  const [scenariosOuvert, setScenariosOuvert] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [filtreOp, setFiltreOp] = useState('tous')
  const classement = useLeaderboard(relances)
  const { commentaires, chargerTous, sauvegarder } = useCommentairesFactures()

  useEffect(() => { chargerTous() }, [])

  // Déduplication globale : 1 relance par client (la plus récente)
  const grouped = useMemo(() => {
    const base = relances.filter(r => !r.archivee && r.statut !== 'brouillon' && r.envoyee_le)
    const parClient = new Map<string, typeof base[0]>()
    for (const r of base) {
      const ex = parClient.get(r.code_client)
      if (!ex || r.envoyee_le! > ex.envoyee_le!) parClient.set(r.code_client, r)
    }
    const dedup = [...parClient.values()]
    return {
      en_cours:   dedup.filter(r => etatVue(r, lettragesMap, seuilSansSuite) === 'en_cours'),
      payee:      dedup.filter(r => etatVue(r, lettragesMap, seuilSansSuite) === 'payee'),
      sans_suite: dedup.filter(r => etatVue(r, lettragesMap, seuilSansSuite) === 'sans_suite'),
    }
  }, [relances, lettragesMap, seuilSansSuite])

  const onglets: { id: EtatVueRelance; label: string; icon: React.ReactNode; activeCls: string; badgeCls: string }[] = [
    {
      id: 'en_cours',
      label: 'En cours',
      icon: <IcClock />,
      activeCls: 'border-ockham-teal text-ockham-teal',
      badgeCls: 'bg-ockham-teal-muted text-ockham-teal-dark',
    },
    {
      id: 'payee',
      label: 'Payées',
      icon: <IcCheckCircle />,
      activeCls: 'border-emerald-500 text-emerald-600',
      badgeCls: 'bg-emerald-50 text-emerald-700',
    },
    {
      id: 'sans_suite',
      label: 'Sans suite',
      icon: <IcXCircle />,
      activeCls: 'border-[#C07840] text-[#C07840]',
      badgeCls: 'bg-[#F5E9D8] text-[#C07840]',
    },
  ]

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Relances</h1>
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

      {/* KPIs 3 cartes */}
      <BarreKpisRelances relances={relances} filtreOp={filtreOp} chargement={chargement} seuilSansSuite={seuilSansSuite} facturesMapRelances={facturesMapRelances} lettragesMap={lettragesMap} />

      {/* Navigation 3 onglets */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {onglets.map(o => {
            const nb = grouped[o.id].length
            const actif = ongletActif === o.id
            return (
              <button
                key={o.id}
                onClick={() => setOngletActif(o.id)}
                className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors select-none ${
                  actif ? o.activeCls : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {o.icon}
                {o.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${actif ? o.badgeCls : 'bg-gray-100 text-gray-400'}`}>
                  {nb}
                </span>
              </button>
            )
          })}
        </div>

        {/* Info strip contextuel */}
        <div className="px-5 py-2 border-b border-gray-50 bg-gray-50/50 flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-[10px] text-gray-400">{infoStrip(seuilSansSuite)[ongletActif]}</p>
        </div>

        {/* Tableau filtré par onglet */}
        <div className="p-4">
          <TableauRelances
            relances={grouped[ongletActif]}
            chargement={chargement}
            onglet={ongletActif}
            onMajStatut={mettreAJourStatut}
            onArchiver={archiver}
            onSauvegarderNote={mettreAJourNote}
            onSauvegarderCommentaire={sauvegarder}
            classement={classement}
            commentaires={commentaires}
            filtreOp={filtreOp}
            onFiltreOpChange={setFiltreOp}
            seuilSansSuite={seuilSansSuite}
            facturesMapRelances={facturesMapRelances}
          />
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

      {scenariosOuvert && <ModalParametresRelances onClose={() => setScenariosOuvert(false)} />}
    </div>
  )
}
