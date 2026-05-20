import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  onDone: () => void
  type: 'invite' | 'recovery'
}

export function PageDefinirMotDePasse({ onDone, type }: Props) {
  const [mdp, setMdp] = useState('')
  const [mdp2, setMdp2] = useState('')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (mdp.length < 8) { setErreur('Minimum 8 caractères.'); return }
    if (mdp !== mdp2) { setErreur('Les mots de passe ne correspondent pas.'); return }
    setChargement(true)
    const { error } = await supabase.auth.updateUser({ password: mdp })
    if (error) { setErreur(error.message); setChargement(false); return }
    window.history.replaceState(null, '', window.location.pathname)
    onDone()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-ockham-navy mb-1">OCKHAM</h1>
        <p className="text-sm font-semibold text-gray-800 mb-1">
          {type === 'invite' ? 'Bienvenue — définissez votre mot de passe' : 'Nouveau mot de passe'}
        </p>
        <p className="text-xs text-gray-400 mb-6">
          {type === 'invite'
            ? 'Choisissez un mot de passe pour accéder à votre compte.'
            : 'Choisissez un nouveau mot de passe pour votre compte.'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              required
              autoFocus
              value={mdp}
              onChange={e => setMdp(e.target.value)}
              placeholder="8 caractères minimum"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ockham-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer</label>
            <input
              type="password"
              required
              value={mdp2}
              onChange={e => setMdp2(e.target.value)}
              placeholder="Répétez le mot de passe"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ockham-teal"
            />
          </div>

          {erreur && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>
          )}

          <button
            type="submit"
            disabled={chargement}
            className="bg-ockham-teal text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors"
          >
            {chargement ? 'Enregistrement…' : 'Définir mon mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}
