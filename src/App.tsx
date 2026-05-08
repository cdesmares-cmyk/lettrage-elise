import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { FournisseurAuth, useAuth } from './contexts/AuthContext'
import { FournisseurDonnees } from './contexts/AppDataContext'
import { Layout } from './components/Layout'
import { PageConnexion } from './pages/PageConnexion'
import { PageDepot } from './pages/PageDepot'
import { PageLettrage } from './pages/PageLettrage'
import { PageCompteClient } from './pages/PageCompteClient'
import { PageTableauDeBord } from './pages/PageTableauDeBord'
import { PageExtraction } from './pages/PageExtraction'

// Garde de route : redirige vers /connexion si l'utilisateur n'est pas authentifié
function RoutePrivee({ children }: { children: React.ReactNode }) {
  const { session, chargement } = useAuth()

  if (chargement) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Chargement…</p>
      </div>
    )
  }

  return session ? <>{children}</> : <Navigate to="/connexion" replace />
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
