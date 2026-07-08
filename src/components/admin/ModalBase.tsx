import { useEffect, type ReactNode } from 'react'

interface Props {
  titre: string
  onClose: () => void
  children: ReactNode
  largeur?: string
  icon?: ReactNode
}

export function ModalBase({ titre, onClose, children, largeur = 'max-w-2xl', icon }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full ${largeur} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 rounded-t-2xl"
          style={{ background: '#0E1A2B' }}>
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(76,197,187,0.12)' }}>
                <span className="text-ockham-teal">{icon}</span>
              </div>
            )}
            <h2 className="text-sm font-bold text-white">{titre}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-lg leading-none transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)' }}
          >×</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
