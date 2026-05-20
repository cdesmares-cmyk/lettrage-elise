import { useState } from 'react'
import { supabase } from '../lib/supabase'

const SITE_URL = 'https://app.ockham-finance.com'

function Logo() {
  return (
    <div className="flex flex-col items-center gap-2 mb-8">
      <div className="w-16 h-16 rounded-2xl bg-ockham-teal/10 border border-ockham-teal/20 flex items-center justify-center mb-1">
        <span className="text-4xl font-black text-ockham-teal leading-none select-none">O</span>
      </div>
      <p className="text-xl font-black tracking-widest text-white uppercase">OCKHAM</p>
    </div>
  )
}

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
      <div className="min-h-screen bg-ockham-navy flex flex-col items-center justify-center px-4">
        <Logo />
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 w-full max-w-sm">
          <p className="text-sm font-semibold text-white mb-1">Réinitialiser le mot de passe</p>
          <p className="text-xs text-white/40 mb-6">Un lien vous sera envoyé par email.</p>

          {resetEnvoye ? (
            <div className="space-y-4">
              <p className="text-sm text-ockham-teal bg-ockham-teal/10 border border-ockham-teal/20 rounded-lg px-3 py-2">
                ✓ Email envoyé à <strong>{email}</strong>. Vérifiez votre boîte de réception.
              </p>
              <button
                onClick={() => { setModeReset(false); setResetEnvoye(false) }}
                className="w-full text-sm text-white/50 border border-white/10 rounded-lg px-4 py-2 hover:border-white/20 transition-colors"
              >
                ← Retour à la connexion
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vous@domaine.fr"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-ockham-teal transition-colors"
                />
              </div>
              {erreur && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erreur}</p>}
              <button
                type="submit"
                disabled={chargement}
                className="bg-ockham-teal text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors"
              >
                {chargement ? 'Envoi…' : 'Envoyer le lien'}
              </button>
              <button
                type="button"
                onClick={() => { setModeReset(false); setErreur(null) }}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                ← Retour
              </button>
            </form>
          )}
        </div>
        <a href="https://www.ockham-finance.com/" className="text-white/20 text-[11px] mt-8 hover:text-white/40 transition-colors">
          ockham-finance.com
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ockham-navy flex flex-col items-center justify-center px-4">
      <Logo />
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 w-full max-w-sm">
        <p className="text-sm font-semibold text-white mb-1">Connexion</p>
        <p className="text-xs text-white/40 mb-6">Accédez à votre espace de travail.</p>

        <form onSubmit={handleConnexion} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vous@domaine.fr"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-ockham-teal transition-colors"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider">Mot de passe</label>
              <button
                type="button"
                onClick={() => { setModeReset(true); setErreur(null) }}
                className="text-xs text-ockham-teal hover:text-ockham-teal-light transition-colors"
              >
                Mot de passe oublié ?
              </button>
            </div>
            <input
              type="password"
              required
              value={motDePasse}
              onChange={e => setMotDePasse(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-ockham-teal transition-colors"
            />
          </div>

          {erreur && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erreur}</p>
          )}

          <button
            type="submit"
            disabled={chargement}
            className="bg-ockham-teal text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors mt-1"
          >
            {chargement ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>

      <a href="https://www.ockham-finance.com/" className="text-white/20 text-[11px] mt-8 hover:text-white/40 transition-colors">
        ockham-finance.com
      </a>
    </div>
  )
}
