// Changement de structure depuis l'application.
//
// S'ouvre depuis le bloc de contexte en bas de la barre laterale. On y retrouve
// les memes structures que dans le portail, plus un retour vers celui-ci.
//
// Aucune donnee comptable ici non plus : des noms, des codes. Le choix est
// verifie par la base — la fonction de bascule refuse une structure qui ne
// figure pas parmi les appartenances declarees.
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { oublierStructureChoisie } from '../lib/structureSession'

export function ModalChangerStructure({ onFermer }: { onFermer: () => void }) {
  const { organisations, basculerStructure } = useAuth()
  const [enCours, setEnCours] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  async function choisir(id: string) {
    setErreur(null)
    setEnCours(id)
    try {
      await basculerStructure(id)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Structure refusée')
      setEnCours(null)
    }
  }

  function retourPortail() {
    // On oublie le choix de la session, pas la structure active en base :
    // l'utilisateur reste rattache a celle d'ou il vient tant qu'il n'en a pas
    // choisi une autre. Rechargement complet, comme toute bascule.
    oublierStructureChoisie()
    window.location.assign('/tableau-de-bord')
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onClick={onFermer}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-gray-900 text-[15px]">Changer de structure</p>
          <p className="text-[12px] text-gray-500 mt-0.5">
            {organisations.length} structures dans votre périmètre
          </p>
        </div>

        {erreur && (
          <div className="mx-5 mt-4 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px]">
            {erreur}
          </div>
        )}

        <div className="p-2.5 max-h-[55vh] overflow-y-auto">
          {organisations.map(o => (
            <button
              key={o.id}
              onClick={() => (o.est_active ? onFermer() : choisir(o.id))}
              disabled={enCours !== null}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait ${
                o.est_active ? 'bg-ockham-teal-muted' : 'hover:bg-gray-50'
              }`}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[12px] flex-shrink-0"
                style={{ background: '#E6F7F5', color: '#3BA89F' }}
              >
                {o.nom.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 text-[13px] truncate leading-tight">{o.nom}</p>
                {o.code_org && <p className="text-gray-400 text-[10px] font-mono mt-0.5">{o.code_org}</p>}
              </div>
              {o.est_active ? (
                <span className="text-[10px] font-bold uppercase tracking-[.08em] text-ockham-teal-dark flex-shrink-0">
                  Actuelle
                </span>
              ) : (
                <span className="text-ockham-teal text-sm flex-shrink-0">
                  {enCours === o.id ? '…' : '→'}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="border-t border-gray-100 p-2.5">
          <button
            onClick={retourPortail}
            disabled={enCours !== null}
            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-100 text-gray-500">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-gray-700">Retour à la page d’accueil</span>
          </button>
        </div>
      </div>
    </div>
  )
}
