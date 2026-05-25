import { useState } from 'react'
import { supabase } from '../lib/supabase'

const SITE_URL = 'https://app.ockham-finance.com'

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(76,197,187,0.12)', border: '1.5px solid rgba(76,197,187,0.3)' }}
      >
        <span className="text-2xl font-black text-ockham-teal leading-none select-none">O</span>
      </div>
      <div>
        <p className="text-base font-black tracking-widest text-white uppercase leading-none">OCKHAM</p>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-ockham-teal mt-0.5">Recouvrement intelligent</p>
      </div>
    </div>
  )
}

function InputField({
  label, type, value, onChange, placeholder, autoFocus, action
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  action?: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
        {action}
      </div>
      <input
        type={type}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-ockham-teal focus:ring-2 focus:ring-ockham-teal/10 transition-all"
      />
    </div>
  )
}

export function PageConnexion() {
  const [email, setEmail]           = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur]         = useState<string | null>(null)
  const [modeReset, setModeReset]   = useState(false)
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

  return (
    <div className="min-h-screen flex">

      {/* Panneau gauche — identité de marque */}
      <div
        className="hidden lg:flex flex-col w-[480px] flex-shrink-0 px-12 py-12"
        style={{ background: 'linear-gradient(160deg, #0E1A2B 0%, #142840 100%)', position: 'relative', overflow: 'hidden' }}
      >
        {/* Halo décoratif */}
        <div style={{ position: 'absolute', right: -100, top: -100, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(76,197,187,0.2), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: -80, bottom: -80, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(76,197,187,0.12), transparent)', pointerEvents: 'none' }} />

        <Logo />

        <div className="mt-auto relative z-10">
          <h2 className="text-2xl font-bold text-white leading-snug mb-4">
            Pilotez votre recouvrement<br />
            <span style={{ color: '#4CC5BB' }}>avec précision.</span>
          </h2>
          <p className="text-sm text-white/50 leading-relaxed max-w-xs">
            Lettrage automatique, scoring risque client, relances — tout votre cycle de recouvrement en un seul outil.
          </p>

          {/* Mini card stats */}
          <div
            className="mt-6 rounded-xl p-4 max-w-xs"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {[
              { label: 'Encours lettré ce mois', value: '94 %' },
              { label: 'DSO moyen', value: '28 j' },
              { label: 'Alertes traitées', value: '17 / 20' },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center py-1.5">
                <span className="text-xs text-white/40">{row.label}</span>
                <span className="text-xs font-bold" style={{ color: '#4CC5BB' }}>{row.value}</span>
              </div>
            ))}
            <div className="mt-2 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: '72%', background: 'linear-gradient(90deg, #4CC5BB, #A7F3EE)' }} />
            </div>
          </div>
        </div>

        <p className="text-[11px] text-white/20 mt-10 relative z-10">
          © 2025 OCKHAM Finance · <a href="https://www.ockham-finance.com/" className="hover:text-white/40 transition-colors">ockham-finance.com</a>
        </p>
      </div>

      {/* Panneau droit — formulaire */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-[#F8FAFC]">

        {/* Logo mobile uniquement */}
        <div className="lg:hidden mb-8">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: '#0E1A2B' }}
          >
            <span className="text-2xl font-black text-ockham-teal leading-none">O</span>
          </div>
          <p className="text-center text-base font-black tracking-widest text-ockham-navy uppercase">OCKHAM</p>
        </div>

        <div className="w-full max-w-sm">

          {modeReset ? (
            /* — Mode reset mot de passe — */
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h1 className="text-base font-semibold text-gray-900 mb-1">Réinitialiser le mot de passe</h1>
              <p className="text-xs text-gray-400 mb-6">Un lien vous sera envoyé par email.</p>

              {resetEnvoye ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-3">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    <p className="text-sm text-emerald-700">
                      Email envoyé à <strong>{email}</strong>. Vérifiez votre boîte de réception.
                    </p>
                  </div>
                  <button
                    onClick={() => { setModeReset(false); setResetEnvoye(false) }}
                    className="w-full text-sm text-gray-500 border border-gray-200 rounded-lg px-4 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    ← Retour à la connexion
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReset} className="flex flex-col gap-4">
                  <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="vous@domaine.fr" autoFocus />
                  {erreur && <ErreurMessage message={erreur} />}
                  <button
                    type="submit"
                    disabled={chargement}
                    className="w-full bg-ockham-teal text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors"
                  >
                    {chargement ? 'Envoi…' : 'Envoyer le lien'}
                  </button>
                  <button type="button" onClick={() => { setModeReset(false); setErreur(null) }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors text-center">
                    ← Retour
                  </button>
                </form>
              )}
            </div>

          ) : (
            /* — Mode connexion — */
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h1 className="text-base font-semibold text-gray-900 mb-1">Connexion</h1>
              <p className="text-xs text-gray-400 mb-6">Accédez à votre espace de travail.</p>

              <form onSubmit={handleConnexion} className="flex flex-col gap-4">
                <InputField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="vous@domaine.fr"
                  autoFocus
                />
                <InputField
                  label="Mot de passe"
                  type="password"
                  value={motDePasse}
                  onChange={setMotDePasse}
                  action={
                    <button
                      type="button"
                      onClick={() => { setModeReset(true); setErreur(null) }}
                      className="text-xs text-ockham-teal hover:text-ockham-teal-dark transition-colors"
                    >
                      Mot de passe oublié ?
                    </button>
                  }
                />

                {erreur && <ErreurMessage message={erreur} />}

                <button
                  type="submit"
                  disabled={chargement}
                  className="w-full bg-ockham-teal text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors mt-1"
                >
                  {chargement ? 'Connexion…' : 'Se connecter'}
                </button>
              </form>
            </div>
          )}

          <p className="text-center text-[11px] text-gray-300 mt-6">
            © 2025 OCKHAM Finance ·{' '}
            <a href="https://www.ockham-finance.com/" className="hover:text-gray-500 transition-colors">
              ockham-finance.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

function ErreurMessage({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-3.5 py-3">
      <span className="text-red-400 text-sm mt-0.5 flex-shrink-0">⚠</span>
      <p className="text-sm text-red-700">{message}</p>
    </div>
  )
}
