import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { supabase } from '../lib/supabase'

const ADMIN_EMAIL = 'cdesmares@elise.com.fr'

const ONGLETS = [
  { chemin: '/tableau-de-bord', label: 'Tableau de bord' },
  { chemin: '/depot', label: 'Dépôt' },
  { chemin: '/lettrage', label: 'Lettrage' },
  { chemin: '/compte-client', label: 'Compte client' },
  { chemin: '/extraction', label: 'Extraction' },
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
  const initiales = utilisateur?.email ? getInitiales(utilisateur.email) : '?'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col">
      <header className="bg-slate-900 flex items-center px-6 h-14 gap-8 sticky top-0 z-50">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-4 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
            E
          </div>
          <div className="leading-none">
            <p className="text-white font-semibold text-[13px] tracking-tight">Lettrage Élise</p>
            <p className="text-slate-500 text-[10px]">Finance · Comptabilité</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex gap-1">
          {ONGLETS.map(({ chemin, label }) => (
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
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Lien admin — visible uniquement pour l'administrateur */}
        {utilisateur?.email === ADMIN_EMAIL && (
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
