export function PageMobileIndisponible() {
  return (
    <div className="min-h-screen bg-ockham-navy flex flex-col items-center justify-center px-8 text-center">
      <div className="mb-8">
        <p className="text-3xl font-black tracking-tight text-white">OCKHAM</p>
        <p className="text-xs font-semibold text-ockham-teal tracking-widest uppercase mt-1">Finance</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl px-8 py-10 max-w-sm w-full space-y-5">
        <div className="text-5xl">💻</div>
        <div>
          <p className="text-white font-bold text-lg leading-snug">
            Version mobile en cours de développement
          </p>
          <p className="text-white/50 text-sm mt-2 leading-relaxed">
            L'application OCKHAM est optimisée pour une utilisation sur ordinateur. Connectez-vous depuis un PC ou un Mac pour accéder à toutes les fonctionnalités.
          </p>
        </div>

        <div className="border-t border-white/10 pt-5 space-y-2">
          <p className="text-[11px] font-semibold text-ockham-teal uppercase tracking-wider">Accès recommandé</p>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <span>🖥</span><span>Navigateur Chrome ou Firefox</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <span>🔗</span><span>app.ockham-finance.com</span>
          </div>
        </div>
      </div>

      <a
        href="https://www.ockham-finance.com/"
        className="text-white/20 text-[11px] mt-10 hover:text-white/40 transition-colors"
      >
        ockham-finance.com
      </a>
    </div>
  )
}
