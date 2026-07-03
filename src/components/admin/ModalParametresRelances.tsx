// Modale paramètres relances — onglets [Scénarios] [Mode Auto]
import { useState } from 'react'
import { TabScenariosRelance } from './TabScenariosRelance'
import { TabModeAutoRelance } from './TabModeAutoRelance'
import { useRole } from '../../contexts/RoleContext'

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

          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <h3 className="text-base font-bold text-gray-900">Paramètres Relances</h3>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors"
            >
              ✕
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
