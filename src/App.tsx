import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { FournisseurAuth, useAuth } from './contexts/AuthContext'
import { FournisseurDonnees, useAppData } from './contexts/AppDataContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { RoleProvider } from './contexts/RoleContext'
import { Layout } from './components/Layout'
import { PageConnexion } from './pages/PageConnexion'
import { PageLettrage } from './pages/PageLettrage'
import { PageCompteClient } from './pages/PageCompteClient'
import { PageTableauDeBord } from './pages/PageTableauDeBord'
import { PageImportExport } from './pages/PageImportExport'
import { PageAdmin } from './pages/PageAdmin'
import { PageRelances } from './pages/PageRelances'

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
        <div className="w-8 h-8 border-2 border-ockham-teal border-t-transparent rounded-full animate-spin" />
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
        element={session ? <Navigate to="/tableau-de-bord" replace /> : <PageConnexion />}
      />
      <Route
        element={
          <RoutePrivee>
            <Layout />
          </RoutePrivee>
        }
      >
        <Route index element={<Navigate to="/tableau-de-bord" replace />} />
        <Route path="/lettrage" element={<PageLettrage />} />
        <Route path="/compte-client" element={<PageCompteClient />} />
        <Route path="/tableau-de-bord" element={<PageTableauDeBord />} />
        <Route path="/relances" element={<PageRelances />} />
        <Route path="/import-export" element={<PageImportExport />} />
        {/* Redirections pour les anciens liens */}
        <Route path="/depot" element={<Navigate to="/import-export" replace />} />
        <Route path="/extraction" element={<Navigate to="/import-export" replace />} />
        <Route path="/admin" element={<PageAdmin />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
    <FournisseurAuth>
      <RoleProvider>
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
      </RoleProvider>
    </FournisseurAuth>
    </ThemeProvider>
  )
}
