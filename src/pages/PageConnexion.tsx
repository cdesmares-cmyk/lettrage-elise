import { useState } from 'react'
import { supabase } from '../lib/supabase'

const SITE_URL = 'https://app.ockham-finance.com'

export function PageConnexion() {
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [modeReset, setModeReset] = useState(false)
  const [resetEnvoye, setResetEnvoye] = useState(false)

  async function handleConnexion(e: React.FormEvent) {
    e.preventDefault()
    setChargement(true)
    setErreur(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
    if (error) setErreur('Email ou mot de passe incorrect.')
    setChargement(false)
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setErreur('Entrez votre adresse email.'); return }
    setChargement(true)
    setErreur(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: SITE_URL })
    if (error) { setErreur(error.message); setChargement(false); return }
    setResetEnvoye(true)
    setChargement(false)
  }

  if (modeReset) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
          <h1 className="text-xl font-bold text-ockham-navy mb-1">OCKHAM</h1>
          <p className="text-sm font-semibold text-gray-800 mb-1">Réinitialiser le mot de passe</p>
          <p className="text-xs text-gray-400 mb-6">Un lien vous sera envoyé par email.</p>

          {resetEnvoye ? (
            <div className="space-y-4">
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                ✓ Email envoyé à <strong>{email}</strong>. Vérifiez votre boîte de réception.
              </p>
              <button
                onClick={() => { setModeReset(false); setResetEnvoye(false) }}
                className="w-full text-sm text-gray-500 border border-gray-200 rounded-lg px-4 py-2 hover:border-gray-300 transition-colors"
              >
                ← Retour à la connexion
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vous@domaine.fr"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ockham-teal"
                />
              </div>
              {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>}
              <button
                type="submit"
                disabled={chargement}
                className="bg-ockham-teal text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors"
              >
                {chargement ? 'Envoi…' : 'Envoyer le lien'}
              </button>
              <button
                type="button"
                onClick={() => { setModeReset(false); setErreur(null) }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Retour
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-800 mb-1">
          <span className="text-ockham-navy font-bold">OCKHAM</span>
        </h1>
        <p className="text-sm text-gray-500 mb-6">Connectez-vous pour accéder à l'application.</p>

        <form onSubmit={handleConnexion} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ockham-teal"
              placeholder="vous@domaine.fr"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Mot de passe</label>
              <button
                type="button"
                onClick={() => { setModeReset(true); setErreur(null) }}
                className="text-xs text-ockham-teal hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </div>
            <input
              type="password"
              required
              value={motDePasse}
              onChange={e => setMotDePasse(e.target.value)}
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
            {chargement ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center mt-6 text-xs text-gray-300">
          <a href="https://www.ockham-finance.com/" className="hover:text-ockham-teal transition-colors">
            ockham-finance.com
          </a>
        </p>
      </div>
    </div>
  )
}
