// Store global : chargement unique au démarrage de l'app
// clients + factures actives (impayées + avoirs non soldés) en mémoire
// → toutes les pages lisent depuis ce contexte, zéro requête à la navigation
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'
import type { CompteClient, FactureDetail, StatutFacture, StatutJuridique } from '../types/client'

interface RowCompteClient {
  code_dso: string; nom: string; statut: string | null; statut_juridique: string | null
  plateforme: string | null; code_groupement: string | null; parent_code_dso: string | null
  nb_factures_total: number; nb_impayees: number; encours_total: number; derniere_emission: string | null
}

interface AppDataContextType {
  clients: CompteClient[]
  facturesActives: FactureDetail[]    // impayées + avoirs non soldés
  chargement: boolean
  rafraichir: () => Promise<void>
  mettreAJourStatutLocal: (numeroPiece: string, statut: StatutFacture | null) => void
}

const AppDataContext = createContext<AppDataContextType | null>(null)

export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [clients, setClients] = useState<CompteClient[]>([])
  const [facturesActives, setFacturesActives] = useState<FactureDetail[]>([])
  const [chargement, setChargement] = useState(false)

  const rafraichir = useCallback(async () => {
    setChargement(true)
    try {
      // Deux requêtes en parallèle — seules les factures avec balance impayée sont chargées
      const [clientsRes, facturesRes] = await Promise.all([
        supabase
          .from('v_comptes_clients')
          .select('*')
          .order('encours_total', { ascending: false }),
        supabase
          .from('v_factures_avec_reste_du')
          .select('numero_piece,code_client,nom_client,date_emission,date_echeance,montant_ht,montant_ttc,reste_du,statut_paiement,statut_facture,est_avoir')
          .gt('reste_du', 0.005)   // uniquement les factures avec un restant dû > 0
          .order('code_client', { ascending: true })
          .order('date_emission', { ascending: false }),
      ])

      if (clientsRes.error) { toast.error('Erreur chargement clients'); return }

      const rows = clientsRes.data as unknown as RowCompteClient[]
      const maxEncours = Math.max(...rows.map(r => r.encours_total), 1)
      const maxImpayees = Math.max(...rows.map(r => r.nb_impayees), 1)

      setClients(rows.map(r => ({
        ...r,
        statut_juridique: r.statut_juridique as StatutJuridique | null,
        note_risque: Math.round(
          (0.4 * (r.encours_total / maxEncours) + 0.6 * (r.nb_impayees / maxImpayees)) * 100
        ),
      })))

      if (!facturesRes.error) {
        setFacturesActives((facturesRes.data as unknown as FactureDetail[]) ?? [])
      }
    } finally {
      setChargement(false)
    }
  }, [])

  // Charge dès que l'utilisateur est authentifié, stoppe le chargement si déconnecté
  useEffect(() => {
    if (session) { rafraichir() }
    else { setClients([]); setFacturesActives([]); setChargement(false) }
  }, [session, rafraichir])

  function mettreAJourStatutLocal(numeroPiece: string, statut: StatutFacture | null) {
    setFacturesActives(prev => prev.map(f =>
      f.numero_piece === numeroPiece ? { ...f, statut_facture: statut } : f
    ))
  }

  return (
    <AppDataContext.Provider value={{ clients, facturesActives, chargement, rafraichir, mettreAJourStatutLocal }}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData(): AppDataContextType {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData doit être utilisé dans FournisseurDonnees')
  return ctx
}
