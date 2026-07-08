import { useState } from 'react'
import { useGmailAuth } from '../../hooks/useGmailAuth'
import { useAxonautIntegration } from '../../hooks/useAxonautIntegration'
import { ModalBase } from './ModalBase'
import { IcLink } from '../Icones'
import { SectionIntegrationAxonaut } from './SectionIntegrationAxonaut'
import { ModalVeilleBodacc } from './ModalVeilleBodacc'

interface Props { onClose: () => void }

type Panneau = 'axonaut' | 'bodacc' | null

function BadgeStatut({ connecte }: { connecte: boolean }) {
  return connecte
    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">Connecté</span>
    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-400">Non connecté</span>
}

function BadgeBientot() {
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-500">Bientôt disponible</span>
}

interface CarteProps {
  logo: React.ReactNode
  nom: string
  description: string
  statut: React.ReactNode
  actions?: React.ReactNode
  onClick?: () => void
  grise?: boolean
}

function CarteConnecteur({ logo, nom, description, statut, actions, onClick, grise }: CarteProps) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
        grise
          ? 'border-gray-100 bg-gray-50/50 opacity-60'
          : onClick
          ? 'border-gray-200 bg-white hover:border-ockham-teal/40 cursor-pointer'
          : 'border-gray-200 bg-white'
      }`}
      onClick={onClick}
    >
      <div className="w-10 h-10 rounded-lg border border-gray-100 bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
        {logo}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-800">{nom}</p>
          {statut}
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>
      </div>
      {actions && <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>{actions}</div>}
    </div>
  )
}

// Logos SVG inline
function LogoGmail() {
  return (
    <svg width="22" height="16" viewBox="0 0 24 18" fill="none">
      <path d="M1 1h22v16H1z" fill="#fff" />
      <path d="M1 1l11 9L23 1" stroke="#EA4335" strokeWidth="2" fill="none" />
      <rect x="1" y="1" width="22" height="16" rx="1" stroke="#D1D5DB" strokeWidth="1" fill="none" />
    </svg>
  )
}

function LogoAxonaut() {
  return <span className="text-[11px] font-extrabold text-slate-700 tracking-tight">AXO</span>
}

function LogoBodacc() {
  return <span className="text-[11px] font-extrabold text-slate-700 tracking-tight">BODACC</span>
}

function LogoOutlook() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="2" fill="#0078D4" />
      <path d="M2 8l10 6 10-6" stroke="white" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

function LogoPennylane() {
  return <span className="text-[11px] font-extrabold text-violet-600 tracking-tight">PL</span>
}

export function ModalIntegrations({ onClose }: Props) {
  const { token: gmailToken, chargement: gmailChargement, connecterGmail, deconnecterGmail } = useGmailAuth()
  const { integration: axonaut } = useAxonautIntegration()
  const [panneau, setPanneau] = useState<Panneau>(null)
  const [confirmDecoGmail, setConfirmDecoGmail] = useState(false)

  const gmailConnecte = !!gmailToken
  const axonautConnecte = !!(axonaut?.actif && axonaut.verifie_le)

  async function handleDeconnecterGmail() {
    await deconnecterGmail()
    setConfirmDecoGmail(false)
  }

  if (panneau === 'bodacc') return <ModalVeilleBodacc onClose={() => setPanneau(null)} />

  return (
    <ModalBase titre="Intégrations" onClose={onClose} largeur="max-w-xl" icon={<IcLink size={14} />}>
      <div className="px-6 py-5 space-y-3">

        {panneau === 'axonaut' ? (
          <div>
            <button
              onClick={() => setPanneau(null)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
            >
              ← Retour
            </button>
            <SectionIntegrationAxonaut />
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-4">Connectez vos outils à OCKHAM pour enrichir votre workflow de recouvrement.</p>

            {/* Messagerie */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Messagerie</p>
              <div className="space-y-2">

                <CarteConnecteur
                  logo={<LogoGmail />}
                  nom="Gmail"
                  description="Envoi de relances depuis votre boîte Gmail personnelle"
                  statut={gmailChargement ? null : <BadgeStatut connecte={gmailConnecte} />}
                  actions={
                    gmailConnecte ? (
                      confirmDecoGmail ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-red-600 font-semibold">Confirmer ?</span>
                          <button
                            onClick={handleDeconnecterGmail}
                            className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition-colors"
                          >Oui</button>
                          <button
                            onClick={() => setConfirmDecoGmail(false)}
                            className="text-[10px] text-gray-400 hover:text-gray-600"
                          >Non</button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          {gmailToken?.gmail_email && (
                            <p className="text-[10px] text-gray-400 font-mono">{gmailToken.gmail_email}</p>
                          )}
                          <button
                            onClick={() => setConfirmDecoGmail(true)}
                            className="text-[10px] font-semibold text-red-400 hover:text-red-600 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Déconnecter
                          </button>
                        </div>
                      )
                    ) : (
                      <button
                        onClick={connecterGmail}
                        className="text-[11px] font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Connecter
                      </button>
                    )
                  }
                />

                <CarteConnecteur
                  logo={<LogoOutlook />}
                  nom="Outlook / Microsoft 365"
                  description="Envoi de relances depuis votre boîte Outlook"
                  statut={<BadgeBientot />}
                  grise
                />

              </div>
            </div>

            {/* ERP & Données */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 mt-4">ERP & Données</p>
              <div className="space-y-2">

                <CarteConnecteur
                  logo={<LogoAxonaut />}
                  nom="Axonaut"
                  description="Synchronisation des factures et liens PDF dans les relances"
                  statut={<BadgeStatut connecte={axonautConnecte} />}
                  onClick={() => setPanneau('axonaut')}
                />

                <CarteConnecteur
                  logo={<LogoPennylane />}
                  nom="Pennylane"
                  description="Import des factures depuis votre comptabilité Pennylane"
                  statut={<BadgeBientot />}
                  grise
                />

              </div>
            </div>

            {/* Veille juridique */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 mt-4">Veille juridique</p>
              <div className="space-y-2">

                <CarteConnecteur
                  logo={<LogoBodacc />}
                  nom="BODACC"
                  description="Surveillance des procédures collectives sur vos clients"
                  statut={<BadgeStatut connecte={true} />}
                  onClick={() => setPanneau('bodacc')}
                />

              </div>
            </div>
          </>
        )}

      </div>
    </ModalBase>
  )
}
