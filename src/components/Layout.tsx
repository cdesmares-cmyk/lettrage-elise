import { NavLink, Outlet } from 'react-router-dom'

// Onglets principaux de l'application (section 5 du CDC)
const ONGLETS = [
  { chemin: '/depot', label: 'Dépôt' },
  { chemin: '/lettrage', label: 'Lettrage' },
  { chemin: '/compte-client', label: 'Compte client' },
  { chemin: '/tableau-de-bord', label: 'Tableau de bord' },
  { chemin: '/extraction', label: 'Extraction' },
]

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* En-tête */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-8">
          <span className="font-semibold text-gray-800 text-lg tracking-tight">
            Lettrage <span className="text-blue-600">Elise</span>
          </span>

          {/* Navigation par onglets */}
          <nav className="flex gap-1">
            {ONGLETS.map(({ chemin, label }) => (
              <NavLink
                key={chemin}
                to={chemin}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Contenu de la page active */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
