import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useRole } from '../contexts/RoleContext'
import { useAuth } from '../contexts/AuthContext'
import { useCorrectionContext } from '../contexts/CorrectionContext'
import { useCompteurRelances } from '../hooks/useCompteurRelances'
import { MenuAdmin } from './admin/MenuAdmin'
import { IcSun, IcMoon } from './Icones'

function ChipCorrection() {
  const { minimise, lignesCorrection, restaurer, fermer } = useCorrectionContext()
  const navigate = useNavigate()

  if (!minimise) return null

  const nbSaisies = lignesCorrection.filter(l => l.numero_facture.trim() || l.montant.trim()).length

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-amber-500 hover:bg-amber-600 text-white pl-4 pr-2 py-2.5 rounded-xl shadow-xl cursor-pointer transition-colors select-none"
      onClick={() => { restaurer(); navigate('/lettrage') }}
    >
      <div>
        <p className="text-xs font-bold leading-none">✏ Correction en cours</p>
        {nbSaisies > 0 && (
          <p className="text-[10px] opacity-80 mt-0.5">
            {nbSaisies} ligne{nbSaisies > 1 ? 's' : ''} saisie{nbSaisies > 1 ? 's' : ''}
          </p>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); fermer() }}
        className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-xs transition-colors flex-shrink-0"
        title="Abandonner la correction"
      >×</button>
    </div>
  )
}

// Icônes sidebar — stroke 1.8, viewBox 24×24
function IcDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}
function IcLettrage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  )
}
function IcCompteClient() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
}
function IcRelances() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  )
}
function IcImportExport() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

const NAV_PRINCIPALE = [
  { chemin: '/tableau-de-bord', label: 'Tableau de bord', icone: <IcDashboard />, commercial: true },
  { chemin: '/lettrage',        label: 'Lettrage',        icone: <IcLettrage />,  commercial: false },
  { chemin: '/compte-client',   label: 'Compte client',   icone: <IcCompteClient />, commercial: true },
  { chemin: '/relances',        label: 'Relances',        icone: <IcRelances />,  commercial: false },
]

const NAV_OUTILS = [
  { chemin: '/import-export', label: 'Import / Export', icone: <IcImportExport />, commercial: false },
]

const TOUS_ONGLETS = [...NAV_PRINCIPALE, ...NAV_OUTILS]

function labelModule(pathname: string): string {
  return TOUS_ONGLETS.find(o => pathname.startsWith(o.chemin))?.label ?? 'OCKHAM'
}

export function Layout() {
  const { theme, toggleTheme } = useTheme()
  const { isCommercial } = useRole()
  const { profil } = useAuth()
  const nbRelancesEnAttente = useCompteurRelances()
  const { pathname } = useLocation()

  const navPrincipale = NAV_PRINCIPALE.filter(o => !isCommercial || o.commercial)
  const navOutils     = NAV_OUTILS.filter(o => !isCommercial || o.commercial)

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-slate-950">

      {/* ── SIDEBAR ── */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col h-screen" style={{ background: '#0E1A2B' }}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/[0.06]">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-[1.1rem] flex-shrink-0"
            style={{ background: 'rgba(76,197,187,0.1)', color: '#4CC5BB', border: '1.5px solid rgba(76,197,187,0.35)' }}
          >O</div>
          <span className="text-white font-bold text-[15px] tracking-[0.06em]">OCKHAM</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-0.5">

          {/* Section Navigation */}
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40 px-2.5 pt-1 pb-1.5">
            Navigation
          </p>

          {navPrincipale.map(({ chemin, label, icone }) => (
            <NavLink
              key={chemin}
              to={chemin}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors border ${
                  isActive
                    ? 'bg-ockham-teal/[0.12] text-ockham-teal border-ockham-teal/20'
                    : 'text-white/65 border-transparent hover:bg-white/[0.05] hover:text-white/90'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-ockham-teal' : 'text-white/55'}>
                    {icone}
                  </span>
                  {label}
                  {chemin === '/relances' && nbRelancesEnAttente > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {nbRelancesEnAttente}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}

          {/* Séparateur + Section Outils */}
          {navOutils.length > 0 && (
            <>
              <div className="h-px bg-white/[0.06] mx-1 my-2" />
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40 px-2.5 pb-1.5">
                Outils
              </p>
              {navOutils.map(({ chemin, label, icone }) => (
                <NavLink
                  key={chemin}
                  to={chemin}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors border ${
                      isActive
                        ? 'bg-ockham-teal/[0.12] text-ockham-teal border-ockham-teal/20'
                        : 'text-white/65 border-transparent hover:bg-white/[0.05] hover:text-white/90'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? 'text-ockham-teal' : 'text-white/55'}>
                        {icone}
                      </span>
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Bas sidebar — profil + menu admin (auto-suffisant) */}
        <div className="border-t border-white/[0.06] px-2 py-3">
          {/* Badge lecture seule */}
          {isCommercial && (
            <div className="mx-1 mb-2 px-2.5 py-1.5 rounded-lg bg-amber-900/30 border border-amber-700/40 text-[11px] font-semibold text-amber-400 text-center">
              Lecture seule
            </div>
          )}

          {/* Super Admin */}
          {profil?.role === 'superadmin' && (
            <a
              href="/superadmin"
              className="flex items-center gap-2 px-2.5 py-2 mb-1 rounded-lg text-[12px] font-semibold text-ockham-teal border border-ockham-teal/20 hover:bg-ockham-teal/10 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
              </svg>
              Super Admin
            </a>
          )}

          <MenuAdmin />
        </div>
      </aside>

      {/* ── ZONE DROITE ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar fine — module actif + toggle thème */}
        <div className="h-12 flex-shrink-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 flex items-center px-6 gap-3">
          <span className="text-[13px] font-semibold text-gray-800 dark:text-slate-200">
            {labelModule(pathname)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            >
              {theme === 'dark' ? <IcSun size={14} /> : <IcMoon size={14} />}
            </button>
          </div>
        </div>

        {/* Contenu de la page */}
        <main className="flex-1 overflow-y-auto px-6 py-6 dark:bg-slate-950">
          <div className="max-w-screen-xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <ChipCorrection />
    </div>
  )
}
