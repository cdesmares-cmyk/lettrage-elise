// Toast popup bas-droite pour nouvelle notification reçue en temps réel
import { useEffect } from 'react'
import type { Notification } from '../types/commentaire'

const LIBELLES_CONTEXTE: Record<string, string> = {
  client:    'Client',
  facture:   'Facture',
  relance:   'Relance',
  procedure: 'Procédure',
}

const COULEURS_CONTEXTE: Record<string, string> = {
  client:    'bg-blue-500/10 text-blue-700 border-blue-500/20',
  facture:   'bg-violet-500/10 text-violet-700 border-violet-500/20',
  relance:   'bg-orange-500/10 text-orange-700 border-orange-500/20',
  procedure: 'bg-red-500/10 text-red-700 border-red-500/20',
}

type Props = {
  notif: Notification
  onFermer: () => void
  onClic: () => void
}

export function ToastNotification({ notif, onFermer, onClic }: Props) {
  useEffect(() => {
    const t = setTimeout(onFermer, 10000)
    return () => clearTimeout(t)
  }, [onFermer])

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] w-[272px] rounded-xl shadow-2xl overflow-hidden cursor-pointer animate-in fade-in slide-in-from-bottom-3 duration-200"
      onClick={onClic}
    >
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: '#0E1A2B' }}>
        <span className="relative flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-ockham-teal opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-ockham-teal" />
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4CC5BB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <span className="text-[11.5px] font-bold text-white flex-1">Nouvelle notification</span>
        <button
          onClick={e => { e.stopPropagation(); onFermer() }}
          className="text-white/40 hover:text-white/80 transition-colors cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="bg-white px-4 py-3 flex items-center gap-3">
        <p className="text-[11.5px] text-gray-600 flex-1">
          de <span className="font-semibold text-gray-900">{notif.auteur_nom}</span>
        </p>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
          COULEURS_CONTEXTE[notif.contexte] ?? 'bg-gray-100 text-gray-600 border-gray-200'
        }`}>
          {LIBELLES_CONTEXTE[notif.contexte] ?? notif.contexte}
        </span>
      </div>
    </div>
  )
}
