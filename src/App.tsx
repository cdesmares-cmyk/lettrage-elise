import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { FournisseurAuth, useAuth } from './contexts/AuthContext'
import { FournisseurDonnees, useAppData } from './contexts/AppDataContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { RoleProvider } from './contexts/RoleContext'
import { Layout } from './components/Layout'
import { PageMobileIndisponible } from './components/PageMobileIndisponible'
import { PageConnexion } from './pages/PageConnexion'
import { PageDefinirMotDePasse } from './pages/PageDefinirMotDePasse'
import { PageLettrage } from './pages/PageLettrage'
import { PageCompteClient } from './pages/PageCompteClient'
import { PageTableauDeBord } from './pages/PageTableauDeBord'
import { PageImportExport } from './pages/PageImportExport'
import { PageRelances } from './pages/PageRelances'

function SplashChargement({ nom }: { nom?: string }) {
  return (
    <div className="min-h-screen bg-ockham-navy flex flex-col items-center justify-center">
      <div className="flex flex-col items-center animate-fade-up">
        {/* Hexagone logo */}
        <svg
          width="64" height="72"
          viewBox="0 0 64 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mb-5"
        >
          <path
            d="M32 2L61 18.5v35L32 70 3 53.5v-35L32 2z"
            stroke="#4CC5BB"
            strokeWidth="2"
            fill="rgba(76,197,187,0.08)"
          />
          <text
            x="32" y="46"
            textAnchor="middle"
            fontFamily="-apple-system, 'Plus Jakarta Sans', sans-serif"
            fontWeight="900"
            fontSize="28"
            fill="#4CC5BB"
            letterSpacing="-1"
          >O</text>
        </svg>

        <p className="text-2xl font-black tracking-widest text-white uppercase mb-1">OCKHAM</p>
        {nom && (
          <p className="text-xs font-semibold text-ockham-teal/70 tracking-widest uppercase mb-0">{nom}</p>
        )}

        {/* Barre de progression shimmer */}
        <div className="mt-8 w-40 h-[2px] bg-ockham-teal/15 rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-ockham-teal rounded-full animate-shimmer-bar" />
        </div>
      </div>
    </div>
  )
}

// Garde de route : redirige vers /connexion si non authentifié,
// affiche un écran de chargement pendant la récupération des données initiales
function RoutePrivee({ children }: { children: React.ReactNode }) {
  const { session, chargement: chargementAuth, profil } = useAuth()
  const { chargement: chargementDonnees } = useAppData()

  if (chargementAuth) return <div className="min-h-screen bg-gray-50" />

  if (!session) return <Navigate to="/connexion" replace />

  if (chargementDonnees) return <SplashChargement nom={profil?.nom_organisation} />

  return <>{children}</>
}

function AppRoutes() {
  const { session, typeMotDePasse, motDePasseDefini } = useAuth()

  // Interception prioritaire : invitation ou reset mot de passe
  if (typeMotDePasse) {
    return <PageDefinirMotDePasse type={typeMotDePasse} onDone={motDePasseDefini} />
  }

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
        <Route path="/admin" element={<Navigate to="/tableau-de-bord" replace />} />
      </Route>
    </Routes>
  )
}

function DetecteurMobile({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 768)
  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  if (isMobile) return <PageMobileIndisponible />
  return <>{children}</>
}

export default function App() {
  return (
    <ThemeProvider>
    <FournisseurAuth>
      <RoleProvider>
      <FournisseurDonnees>
      <BrowserRouter>
        <DetecteurMobile>
          <AppRoutes />
        </DetecteurMobile>
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
