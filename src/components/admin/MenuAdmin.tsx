import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useRole } from '../../contexts/RoleContext'
import { supabase } from '../../lib/supabase'
import { ModalGestionRessources } from './ModalGestionRessources'
import { ModalChampsPersonnalises } from './ModalChampsPersonnalises'
import { ModalHistoriqueImport } from './ModalHistoriqueImport'
import { ModalCorrectionLettrage } from './ModalCorrectionLettrage'
import { ModalReinitialisation } from './ModalReinitialisation'
import { ModalAlertesParametres } from './ModalAlertesParametres'
import { ModalIntegrations } from './ModalIntegrations'
import { IcUsers, IcSliders, IcClock, IcEdit, IcBell, IcTrash, IcLogOut, IcLink } from '../Icones'

type ModalId = 'ressources' | 'champs' | 'imports' | 'lettrages' | 'alertes' | 'integrations' | 'reset'

function getInitiales(email: string): string {
  const nom = email.split('@')[0]
  const parties = nom.split(/[._-]/)
  if (parties.length >= 2) return (parties[0][0] + parties[1][0]).toUpperCase()
  return nom.slice(0, 2).toUpperCase()
}

interface ItemProps {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
  separator?: boolean
}

function Item({ label, icon, onClick, danger, separator }: ItemProps) {
  return (
    <>
      {separator && <div className="h-px bg-gray-100 my-1 mx-2" />}
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors ${
          danger
            ? 'text-red-600 hover:bg-red-50'
            : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <span className="w-4 flex items-center justify-center flex-shrink-0">{icon}</span>
        {label}
      </button>
    </>
  )
}

export function MenuAdmin() {
  const { utilisateur, profil } = useAuth()
  const { isAdmin, peutModifier } = useRole()
  const [ouvert, setOuvert] = useState(false)
  const [modal, setModal] = useState<ModalId | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const initiales = utilisateur?.email ? getInitiales(utilisateur.email) : '?'

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false)
    }
    if (ouvert) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [ouvert])

  function ouvrir(id: ModalId) {
    setModal(id)
    setOuvert(false)
  }

  return (
    <>
      <div className="relative" ref={ref}>
        {/* Trigger */}
        <button
          onClick={() => setOuvert(!ouvert)}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
            style={{ background: '#0E1A2B', color: '#4CC5BB', border: '1.5px solid #4CC5BB40' }}
          >
            {initiales}
          </div>
          <span className="text-slate-300 text-xs font-medium">Mon compte</span>
          <svg className={`w-3 h-3 text-slate-500 transition-transform ${ouvert ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown */}
        {ouvert && (
          <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1.5 overflow-hidden">

            {/* En-tête organisation */}
            {profil?.nom_organisation && (
              <div className="px-3.5 py-2.5 border-b border-gray-100 mb-1">
                <p className="text-[11px] font-bold text-gray-800 truncate">{profil.nom_organisation}</p>
                {profil.code_org && (
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">{profil.code_org}</p>
                )}
              </div>
            )}

            {isAdmin && (
              <Item label="Gestion des ressources" icon={<IcUsers size={14} />} onClick={() => ouvrir('ressources')} />
            )}
            {peutModifier && (
              <Item label="Champs personnalisés" icon={<IcSliders size={14} />} onClick={() => ouvrir('champs')} />
            )}
            {peutModifier && (
              <Item label="Historique d'import" icon={<IcClock size={14} />} onClick={() => ouvrir('imports')} />
            )}
            {peutModifier && (
              <Item label="Correction lettrage" icon={<IcEdit size={14} />} onClick={() => ouvrir('lettrages')} />
            )}
            {peutModifier && (
              <Item label="Alertes & Scoring" icon={<IcBell size={14} />} onClick={() => ouvrir('alertes')} />
            )}
            {peutModifier && (
              <Item label="Intégrations" icon={<IcLink size={14} />} onClick={() => ouvrir('integrations')} separator />
            )}
            {isAdmin && (
              <Item label="Réinitialisation" icon={<IcTrash size={14} />} onClick={() => ouvrir('reset')} danger separator />
            )}
            <Item label="Déconnexion" icon={<IcLogOut size={14} />} onClick={async () => { await supabase.auth.signOut(); window.location.href = '/connexion' }} separator />
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'ressources'    && <ModalGestionRessources   onClose={() => setModal(null)} />}
      {modal === 'champs'        && <ModalChampsPersonnalises onClose={() => setModal(null)} />}
      {modal === 'imports'       && <ModalHistoriqueImport     onClose={() => setModal(null)} />}
      {modal === 'lettrages'     && <ModalCorrectionLettrage  onClose={() => setModal(null)} />}
      {modal === 'alertes'       && <ModalAlertesParametres    onClose={() => setModal(null)} />}
      {modal === 'integrations'  && <ModalIntegrations         onClose={() => setModal(null)} />}
      {modal === 'reset'         && <ModalReinitialisation     onClose={() => setModal(null)} />}
    </>
  )
}
