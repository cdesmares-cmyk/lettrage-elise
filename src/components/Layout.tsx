import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useRole } from '../contexts/RoleContext'
import { useCompteurRelances } from '../hooks/useCompteurRelances'
import { supabase } from '../lib/supabase'

const ONGLETS_TOUS = [
  { chemin: '/tableau-de-bord', label: 'Tableau de bord', commercial: true },
  { chemin: '/depot',           label: 'Dépôt',           commercial: false },
  { chemin: '/lettrage',        label: 'Lettrage',         commercial: false },
  { chemin: '/compte-client',   label: 'Compte client',    commercial: true },
  { chemin: '/relances',        label: 'Relances',         commercial: false },
  { chemin: '/extraction',      label: 'Extraction',       commercial: true },
]

function getInitiales(email: string): string {
  const nom = email.split('@')[0]
  const parties = nom.split(/[._-]/)
  if (parties.length >= 2) return (parties[0][0] + parties[1][0]).toUpperCase()
  return nom.slice(0, 2).toUpperCase()
}

export function Layout() {
  const { utilisateur } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { isAdmin, isCommercial } = useRole()
  const nbRelancesEnAttente = useCompteurRelances()
  const initiales = utilisateur?.email ? getInitiales(utilisateur.email) : '?'
  const onglets = ONGLETS_TOUS.filter(o => !isCommercial || o.commercial)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col">
      <header className="bg-slate-900 flex items-center px-6 h-14 gap-8 sticky top-0 z-50">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-4 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
            O
          </div>
          <div className="leading-none">
            <p className="text-white font-semibold text-[13px] tracking-tight">OCKHAM</p>
            <p className="text-slate-500 text-[10px]">Efficacité · Fiabilité · Simplicité</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex gap-1">
          {onglets.map(({ chemin, label }) => (
            <NavLink
              key={chemin}
              to={chemin}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-sky-400' : 'bg-slate-700'}`} />
                  {label}
                  {chemin === '/relances' && nbRelancesEnAttente > 0 && (
                    <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {nbRelancesEnAttente}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Badge lecture seule — visible uniquement pour les commerciaux */}
        {isCommercial && (
          <span className="flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold text-amber-400 bg-amber-900/30 border border-amber-700/40 ml-1">
            Lecture seule
          </span>
        )}

        {/* Lien admin — visible uniquement pour l'administrateur */}
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                isActive ? 'bg-red-900 text-red-200' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
              }`
            }
          >
            ⚙️ Admin
          </NavLink>
        )}

        {/* Profil + déconnexion */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
              {initiales}
            </div>
            <span className="text-slate-300 text-xs font-medium">
              {utilisateur?.email?.split('@')[0] ?? ''}
            </span>
          </div>
          <button
            onClick={toggleTheme}
            className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1.5 rounded transition-colors"
            title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          >
            {theme === 'dark' ? '☀' : '◐'}
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1.5 rounded transition-colors"
            title="Se déconnecter"
          >
            ⏻
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-6 py-6 dark:bg-slate-950 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
