// Store global : chargement unique au démarrage de l'app
// clients + factures actives (impayées + avoirs non soldés) en mémoire
// → toutes les pages lisent depuis ce contexte, zéro requête à la navigation
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'
import type { CompteClient, FactureDetail, StatutFacture, StatutJuridique } from '../types/client'

interface RowCompteClient {
  code_dso: string; nom: string; statut_juridique: string | null
  commercial: string | null; operateur: string | null
  plateforme: string | null; code_groupement: string | null
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
      const COLS = 'numero_piece,code_client,nom_client,date_emission,date_echeance,montant_ht,montant_ttc,reste_du,statut_paiement,statut_facture,est_avoir'
      const PAGE = 1000

      // Première page clients + première page factures en parallèle
      const [clientsPage0, page0] = await Promise.all([
        supabase.from('v_comptes_clients').select('*').order('nom', { ascending: true }).range(0, PAGE - 1),
        supabase.from('v_factures_avec_reste_du').select(COLS)
          .or('reste_du.gt.0.005,reste_du.lt.-0.005')
          .order('code_client', { ascending: true })
          .order('date_emission', { ascending: false })
          .range(0, PAGE - 1),
      ])

      if (clientsPage0.error) { toast.error('Erreur chargement clients'); return }

      let tousClients: RowCompteClient[] = (clientsPage0.data as unknown as RowCompteClient[]) ?? []
      let offsetClients = PAGE
      while (tousClients.length === offsetClients) {
        const { data, error } = await supabase.from('v_comptes_clients').select('*')
          .order('nom', { ascending: true })
          .range(offsetClients, offsetClients + PAGE - 1)
        if (error || !data?.length) break
        tousClients = [...tousClients, ...(data as unknown as RowCompteClient[])]
        offsetClients += PAGE
      }

      if (page0.error) { return }

      let toutes: FactureDetail[] = (page0.data as unknown as FactureDetail[]) ?? []

      // Charger les pages suivantes si la première était pleine (pagination automatique)
      let offset = PAGE
      while (toutes.length === offset) {
        const { data, error } = await supabase.from('v_factures_avec_reste_du').select(COLS)
          .or('reste_du.gt.0.005,reste_du.lt.-0.005')
          .order('code_client', { ascending: true })
          .order('date_emission', { ascending: false })
          .range(offset, offset + PAGE - 1)
        if (error || !data?.length) break
        toutes = [...toutes, ...(data as unknown as FactureDetail[])]
        offset += PAGE
      }

      // Ancienneté moyenne des impayés par client (score risque = 40% ancienneté + 35% encours + 25% nb)
      const aggrAge = new Map<string, number[]>()
      const now = Date.now()
      for (const f of toutes) {
        if (f.reste_du > 0.005 && !f.est_avoir && f.date_emission) {
          const jours = Math.floor((now - new Date(f.date_emission).getTime()) / 86400000)
          if (!aggrAge.has(f.code_client)) aggrAge.set(f.code_client, [])
          aggrAge.get(f.code_client)!.push(jours)
        }
      }
      const ancienneteMoy = new Map<string, number>()
      aggrAge.forEach((jours, code) => {
        ancienneteMoy.set(code, jours.reduce((a, b) => a + b, 0) / jours.length)
      })

      const maxEncours = Math.max(...tousClients.map(r => r.encours_total), 1)
      const maxImpayees = Math.max(...tousClients.map(r => r.nb_impayees), 1)
      setClients(tousClients.map(r => {
        const ageMoy = ancienneteMoy.get(r.code_dso) ?? 0
        const sAge = Math.min(ageMoy / 365, 1)
        const sEncours = r.encours_total / maxEncours
        const sNb = r.nb_impayees / maxImpayees
        return {
          ...r,
          statut_juridique: r.statut_juridique as StatutJuridique | null,
          note_risque: Math.round((0.40 * sAge + 0.35 * sEncours + 0.25 * sNb) * 100),
        }
      }))
      setFacturesActives(toutes)
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
