import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { FournisseurAuth, useAuth } from './contexts/AuthContext'
import { FournisseurDonnees, useAppData } from './contexts/AppDataContext'
import { Layout } from './components/Layout'
import { PageConnexion } from './pages/PageConnexion'
import { PageDepot } from './pages/PageDepot'
import { PageLettrage } from './pages/PageLettrage'
import { PageCompteClient } from './pages/PageCompteClient'
import { PageTableauDeBord } from './pages/PageTableauDeBord'
import { PageExtraction } from './pages/PageExtraction'

// Garde de route : redirige vers /connexion si non authentifié,
// affiche un écran de chargement pendant la récupération des données initiales
function RoutePrivee({ children }: { children: React.ReactNode }) {
  const { session, chargement: chargementAuth } = useAuth()
  const { chargement: chargementDonnees } = useAppData()

  if (chargementAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Authentification…</p>
      </div>
    )
  }

  if (!session) return <Navigate to="/connexion" replace />

  if (chargementDonnees) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm font-medium">Chargement des données…</p>
        <p className="text-gray-400 text-xs">Clients et factures en cours de chargement</p>
      </div>
    )
  }

  return <>{children}</>
}

function AppRoutes() {
  const { session } = useAuth()

  return (
    <Routes>
      <Route
        path="/connexion"
        element={session ? <Navigate to="/depot" replace /> : <PageConnexion />}
      />
      <Route
        element={
          <RoutePrivee>
            <Layout />
          </RoutePrivee>
        }
      >
        <Route index element={<Navigate to="/depot" replace />} />
        <Route path="/depot" element={<PageDepot />} />
        <Route path="/lettrage" element={<PageLettrage />} />
        <Route path="/compte-client" element={<PageCompteClient />} />
        <Route path="/tableau-de-bord" element={<PageTableauDeBord />} />
        <Route path="/extraction" element={<PageExtraction />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <FournisseurAuth>
      <FournisseurDonnees>
      <BrowserRouter>
        <AppRoutes />
        {/* Toaster pour les notifications (section 10 du CDC — pas d'alert() natif) */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: { fontSize: '14px' },
          }}
        />
      </BrowserRouter>
      </FournisseurDonnees>
    </FournisseurAuth>
  )
}
