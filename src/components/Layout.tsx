import { NavLink, Outlet, useNavigate } from 'react-router-dom'
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

const ONGLETS_TOUS = [
  { chemin: '/tableau-de-bord',  label: 'Tableau de bord', commercial: true },
  { chemin: '/lettrage',         label: 'Lettrage',         commercial: false },
  { chemin: '/compte-client',    label: 'Compte client',    commercial: true },
  { chemin: '/relances',         label: 'Relances',         commercial: false },
  { chemin: '/import-export',    label: 'Import / Export',  commercial: false },
]


export function Layout() {
  const { theme, toggleTheme } = useTheme()
  const { isCommercial } = useRole()
  const { profil } = useAuth()
  const nbRelancesEnAttente = useCompteurRelances()
  const onglets = ONGLETS_TOUS.filter(o => !isCommercial || o.commercial)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col">
      <header className="bg-slate-900 sticky top-0 z-50">
        <div className="max-w-screen-xl mx-auto w-full px-6 h-14 flex items-center">

          {/* Colonne gauche — Logo */}
          <div className="flex-1 flex items-center justify-start">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-[1.1rem]" style={{ background: '#0E1A2B', color: '#4CC5BB' }}>
                O
              </div>
              <span className="text-white font-bold text-[1.1rem] tracking-[.04em]">OCKHAM</span>
            </div>
          </div>

          {/* Colonne centre — Navigation */}
          <div className="flex-1 flex items-center justify-center">
          <nav className="flex items-center gap-1">
            {onglets.map(({ chemin, label }) => {
              const isImportExport = chemin === '/import-export'
              return (
              <NavLink
                key={chemin}
                to={chemin}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                    isImportExport
                      ? isActive
                        ? 'bg-ockham-navy text-white ring-1 ring-ockham-teal/40'
                        : 'text-ockham-teal hover:bg-ockham-navy/80 hover:text-white'
                      : isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isImportExport
                        ? isActive ? 'bg-ockham-teal' : 'bg-ockham-teal/50'
                        : isActive ? 'bg-ockham-teal' : 'bg-slate-700'
                    }`} />
                    {label}
                    {chemin === '/relances' && nbRelancesEnAttente > 0 && (
                      <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                        {nbRelancesEnAttente}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
              )
            })}
            {isCommercial && (
              <span className="flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold text-amber-400 bg-amber-900/30 border border-amber-700/40 ml-1">
                Lecture seule
              </span>
            )}
          </nav>
          </div>

          {/* Colonne droite — Profil */}
          <div className="flex-1 flex items-center justify-end gap-2">
            {profil?.role === 'superadmin' && (
              <a
                href="/superadmin"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-ockham-teal border border-ockham-teal/30 hover:bg-ockham-teal/10 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
                </svg>
                Super Admin
              </a>
            )}
            <button
              onClick={toggleTheme}
              className="text-slate-500 hover:text-slate-300 px-2 py-1.5 rounded transition-colors flex items-center justify-center"
              title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            >
              {theme === 'dark' ? <IcSun size={15} /> : <IcMoon size={15} />}
            </button>
            <MenuAdmin />
          </div>

        </div>

      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-6 py-6 dark:bg-slate-950 min-h-screen">
        <Outlet />
      </main>

      <ChipCorrection />
    </div>
  )
}
