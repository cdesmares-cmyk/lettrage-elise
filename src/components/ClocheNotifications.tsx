// Cloche de notifications — badge + panneau déroulant
// Positionnée dans le bas de la sidebar, panel à droite de la sidebar
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { ModalJournalNotifications } from './ModalJournalNotifications'
import type { Notification } from '../types/commentaire'

const LIBELLES_CONTEXTE: Record<string, string> = {
  client:   'Client',
  facture:  'Facture',
  relance:  'Relance',
  procedure:'Procédure',
}

function tempsRelatif(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'maintenant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h}h`
  const j = Math.floor(h / 24)
  return j === 1 ? 'hier' : `il y a ${j}j`
}

function LigneNotif({
  n,
  onLu,
  onNaviguer,
}: {
  n: Notification
  onLu: (id: string) => void
  onNaviguer: (n: Notification) => void
}) {
  const nonLue = !n.lu_le
  return (
    <button
      onClick={() => { if (!n.lu_le) onLu(n.id); onNaviguer(n) }}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 transition-colors ${
        nonLue ? 'bg-ockham-teal/[0.04] hover:bg-ockham-teal/[0.08]' : 'hover:bg-gray-50'
      } cursor-pointer`}
    >
      <div className="flex items-start gap-2">
        {nonLue && (
          <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-ockham-teal" />
        )}
        <div className={`flex-1 min-w-0 ${!nonLue ? 'pl-3.5' : ''}`}>
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-[10px] font-bold text-ockham-teal uppercase tracking-wide">
              {LIBELLES_CONTEXTE[n.contexte] ?? n.contexte}
            </span>
            <span className="text-[10px] text-gray-400">
              {n.type === 'mention' ? '• @mention' : '• réponse'}
            </span>
          </div>
          <p className="text-[11px] text-gray-700 leading-relaxed line-clamp-2">{n.corps_extrait}</p>
          <p className="text-[10px] text-gray-400 mt-1">
            <strong className="text-gray-600">{n.auteur_nom}</strong> · {tempsRelatif(n.cree_le)}
          </p>
        </div>
      </div>
    </button>
  )
}

export function ClocheNotifications() {
  const { notifications, nonLues, marquerLu, marquerToutLu } = useNotifications()
  const [ouvert, setOuvert] = useState(false)
  const [journalOuvert, setJournalOuvert] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!ouvert) return
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ouvert])

  function handleNaviguer(n: Notification) {
    setOuvert(false)
    if (n.contexte === 'client') {
      navigate(`/compte-client?client=${n.contexte_id}&onglet=commentaires`)
    } else if (n.contexte === 'facture') {
      navigate(`/compte-client?facture=${n.contexte_id}`)
    } else if (n.contexte === 'relance') {
      navigate('/relances')
    } else if (n.contexte === 'procedure') {
      navigate('/procedures')
    }
  }

  function ouvrirJournal() {
    setOuvert(false)
    setJournalOuvert(true)
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOuvert(o => !o)}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[13px] font-medium text-white/65 hover:bg-white/[0.05] hover:text-white/90 transition-colors border border-transparent cursor-pointer"
        >
          <span className="relative text-white/55 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {nonLues > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-ockham-teal text-[8px] font-bold text-white flex items-center justify-center leading-none">
                {nonLues > 9 ? '9+' : nonLues}
              </span>
            )}
          </span>
          <span>Notifications</span>
          {nonLues > 0 && (
            <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-ockham-teal text-white text-[9px] font-bold flex items-center justify-center">
              {nonLues > 9 ? '9+' : nonLues}
            </span>
          )}
        </button>

        {ouvert && (
          <div className="fixed left-[220px] bottom-0 mb-2 ml-2 z-50 w-[300px] max-h-[480px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
            {/* Header navy */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0 bg-ockham-navy">
              <p className="text-xs font-bold text-white">Notifications</p>
              {nonLues > 0 && (
                <button onClick={marquerToutLu} className="text-[10px] text-ockham-teal hover:text-[#4CC5BB] hover:underline cursor-pointer transition-colors">
                  Tout marquer lu
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 text-center">Aucune notification.</p>
              ) : (
                notifications.map((n: Notification) => (
                  <LigneNotif key={n.id} n={n} onLu={marquerLu} onNaviguer={handleNaviguer} />
                ))
              )}
            </div>

            {/* Pied — lien Journal */}
            <div className="flex-shrink-0 border-t border-gray-100 px-4 py-2.5 bg-gray-50">
              <button
                onClick={ouvrirJournal}
                className="w-full text-center text-[10px] font-semibold text-ockham-teal hover:underline cursor-pointer transition-colors"
              >
                Tout voir — Journal de notifications
              </button>
            </div>
          </div>
        )}
      </div>

      {journalOuvert && (
        <ModalJournalNotifications onFermer={() => setJournalOuvert(false)} />
      )}
    </>
  )
}
