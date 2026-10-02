// Portail de choix de structure.
//
// S'affiche a chaque connexion pour les comptes rattaches a plusieurs
// structures, et seulement pour eux : un compte mono-structure entre
// directement, comme avant. La condition porte sur le NOMBRE d'appartenances,
// pas sur le role — un commercial a qui on ouvre une seconde structure la
// semaine prochaine en beneficie sans qu'on touche a quoi que ce soit.
//
// Cet ecran ne porte AUCUNE donnee comptable : uniquement des noms de
// structures. Meme en cas de defaut, il n'y a rien a fuiter ici.
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function PortailStructures() {
  const { organisations, basculerStructure, utilisateur } = useAuth()
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

  async function deconnexion() {
    const { supabase } = await import('../lib/supabase')
    await supabase.auth.signOut()
    window.location.assign('/connexion')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: '#0E1A2B' }}>

      <div className="flex items-center gap-2.5 mb-10">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center font-extrabold text-[1.2rem]"
          style={{ background: 'rgba(76,197,187,0.1)', color: '#4CC5BB', border: '1.5px solid rgba(76,197,187,0.35)' }}
        >O</div>
        <span className="text-white font-bold text-[17px] tracking-[0.06em]">OCKHAM</span>
      </div>

      <h1 className="text-white text-2xl font-bold mb-1.5 text-center">Choisissez votre structure</h1>
      <p className="text-white/50 text-sm mb-9 text-center">
        {utilisateur?.email} — {organisations.length} structures
      </p>

      {erreur && (
        <div className="mb-6 px-4 py-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-200 text-sm max-w-md text-center">
          {erreur}
        </div>
      )}

      <div className="grid gap-3 w-full max-w-2xl sm:grid-cols-2">
        {organisations.map(o => (
          <button
            key={o.id}
            onClick={() => choisir(o.id)}
            disabled={enCours !== null}
            className="group text-left bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-ockham-teal/50 rounded-xl px-5 py-4 transition-colors disabled:opacity-40 disabled:cursor-wait"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white font-semibold text-[15px] truncate">{o.nom}</p>
                {o.code_org && (
                  <p className="text-white/40 text-[11px] font-mono mt-0.5">{o.code_org}</p>
                )}
              </div>
              <span className="text-ockham-teal text-sm opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                {enCours === o.id ? '…' : '→'}
              </span>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={deconnexion}
        className="mt-10 text-white/40 hover:text-white/70 text-xs transition-colors"
      >
        Se déconnecter
      </button>
    </div>
  )
}
