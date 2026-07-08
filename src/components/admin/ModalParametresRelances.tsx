// Modale paramètres relances — onglets [Scénarios] [Mode Auto]
import { useState } from 'react'
import { TabScenariosRelance } from './TabScenariosRelance'
import { TabModeAutoRelance } from './TabModeAutoRelance'
import { useRole } from '../../contexts/RoleContext'
import { IcSliders } from '../Icones'

type Onglet = 'scenarios' | 'auto'

interface Props {
  onClose: () => void
  ongletInitial?: Onglet
}

export function ModalParametresRelances({ onClose, ongletInitial = 'scenarios' }: Props) {
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial)
  const { peutModifier } = useRole()

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">

          <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 rounded-t-2xl" style={{ background: '#0E1A2B' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(76,197,187,0.12)' }}>
                <span className="text-ockham-teal"><IcSliders size={14} /></span>
              </div>
              <h3 className="text-sm font-bold text-white">Paramètres Relances</h3>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-lg leading-none"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}
            >
              ×
            </button>
          </div>

          <div className="flex border-b border-gray-100 px-6 flex-shrink-0">
            <button
              onClick={() => setOnglet('scenarios')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                onglet === 'scenarios' ? 'border-ockham-teal text-ockham-teal' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Scénarios
            </button>
            {peutModifier && (
              <button
                onClick={() => setOnglet('auto')}
                className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  onglet === 'auto' ? 'border-ockham-teal text-ockham-teal' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Mode Auto
              </button>
            )}
          </div>

          {onglet === 'scenarios' && <TabScenariosRelance />}
          {onglet === 'auto' && <TabModeAutoRelance />}
        </div>
      </div>
    </>
  )
}
