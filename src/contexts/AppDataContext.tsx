// Store global : chargement unique au démarrage de l'app
// clients + factures actives (impayées + avoirs non soldés) en mémoire
// → toutes les pages lisent depuis ce contexte, zéro requête à la navigation
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'
import type { CompteClient, FactureDetail, StatutFacture, StatutJuridique } from '../types/client'

interface RowCompteClient {
  code_dso: string; nom: string; statut_juridique: string | null
  commercial: string | null; operateur: string | null
  plateforme: string | null; code_groupement: string | null
  nb_factures_total: number; nb_impayees: number; encours_total: number; derniere_emission: string | null; siret: string | null
  score_risque: number | null
}

interface OptsClientLocal {
  statut_juridique?: StatutJuridique | null
  commercial?: string | null
  operateur?: string | null
  plateforme?: string | null
  code_groupement?: string | null
  siret?: string | null
}

export interface ScenarioRelance {
  id: string
  nom: string
  niveau: number
  objet: string
  corps_texte: string
}

interface AppDataContextType {
  clients: CompteClient[]
  facturesActives: FactureDetail[]    // impayées + avoirs non soldés
  chargement: boolean
  rafraichir: () => Promise<void>
  mettreAJourStatutLocal: (numeroPiece: string, statut: StatutFacture | null) => void
  mettreAJourClientLocal: (codeDso: string, opts: OptsClientLocal) => void
  // Mise à jour optimiste après lettrage : réduit reste_du sans recharger tout le dataset
  mettreAJourResteDuLocal: (lettres: { numeroPiece: string; montant: number }[]) => void
  supprimerFactureLocale: (numeroPiece: string) => void
  moisMaxBrut: string    // YYYY-MM, vrai mois de la facture la plus récente
  ca12Mois: number       // Σ montant_ttc sur les 12 mois se terminant à moisMaxBrut
  ca12MoisPrec: number   // Σ montant_ttc sur les 12 mois se terminant à moisMaxBrut-1 (toggle)
  scenarios: ScenarioRelance[]
  rechargerScenarios: () => Promise<void>
}


const AppDataContext = createContext<AppDataContextType | null>(null)

const COLS = 'numero_piece,code_client,nom_client,date_emission,date_echeance,montant_ht,montant_ttc,reste_du,statut_paiement,statut_facture,est_avoir,axonaut_pdf_url'
const PAGE = 1000

async function paginateClients(initial: RowCompteClient[]): Promise<RowCompteClient[]> {
  let all = initial
  let offset = PAGE
  while (all.length === offset) {
    const { data, error } = await supabase.from('v_comptes_clients').select('*')
      .order('nom', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error || !data?.length) break
    all = [...all, ...(data as unknown as RowCompteClient[])]
    offset += PAGE
  }
  return all
}

async function paginateFactures(initial: FactureDetail[]): Promise<FactureDetail[]> {
  let all = initial
  let offset = PAGE
  while (all.length === offset) {
    const { data, error } = await supabase.from('v_factures_avec_reste_du').select(COLS)
      .or('reste_du.gt.0.005,reste_du.lt.-0.005')
      .order('code_client', { ascending: true })
      .order('date_emission', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error || !data?.length) break
    all = [...all, ...(data as unknown as FactureDetail[])]
    offset += PAGE
  }
  return all
}

export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [clients, setClients] = useState<CompteClient[]>([])
  const [facturesActives, setFacturesActives] = useState<FactureDetail[]>([])
  const [scenarios, setScenarios] = useState<ScenarioRelance[]>([])
  const [chargement, setChargement] = useState(true)
  const [moisMaxBrut, setMoisMaxBrut] = useState('')
  const [ca12Mois, setCa12Mois] = useState(0)
  const [ca12MoisPrec, setCa12MoisPrec] = useState(0)
  const initialLoadDoneRef = useRef(false)
  // Verrou : empêche deux rafraichir() simultanés (timer 60s + focus event)
  const isFetchingRef = useRef(false)
  // Horodatage du dernier fetch complet — cooldown 30s sur les focus events
  const lastFetchAtRef = useRef(0)

  const rechargerScenarios = useCallback(async () => {
    const { data } = await supabase
      .from('scenarios_relance')
      .select('id, nom, niveau, objet, corps_texte')
      .order('niveau', { ascending: true })
      .order('nom', { ascending: true })
    setScenarios((data as ScenarioRelance[]) ?? [])
  }, [])

  const rafraichir = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    if (!initialLoadDoneRef.current) setChargement(true)
    try {
      // Page 0 — clients, factures et organisation en parallèle
      const [clientsPage0, page0, orgRow] = await Promise.all([
        supabase.from('v_comptes_clients').select('*').order('nom', { ascending: true }).range(0, PAGE - 1),
        supabase.from('v_factures_avec_reste_du').select(COLS)
          .or('reste_du.gt.0.005,reste_du.lt.-0.005')
          .order('code_client', { ascending: true })
          .order('date_emission', { ascending: false })
          .range(0, PAGE - 1),
        supabase.from('organisations').select('mois_ref, ca12_mois, ca12_mois_prec').single(),
      ])

      if (clientsPage0.error) { toast.error('Erreur chargement clients'); return }
      if (page0.error) { return }

      // Pagination clients et factures en parallèle
      const [tousClients, toutes] = await Promise.all([
        paginateClients((clientsPage0.data as unknown as RowCompteClient[]) ?? []),
        paginateFactures((page0.data as unknown as FactureDetail[]) ?? []),
      ])

      // CA12 lu depuis organisations
      const org = orgRow.data as { mois_ref: string; ca12_mois: number; ca12_mois_prec: number } | null
      if (org?.mois_ref) {
        setMoisMaxBrut(org.mois_ref)
        setCa12Mois(Number(org.ca12_mois) || 0)
        setCa12MoisPrec(Number(org.ca12_mois_prec) || 0)
      }

      // Mise à jour état — une seule fois, données complètes garanties
      setClients(tousClients.map(r => ({
        ...r,
        statut_juridique: r.statut_juridique as StatutJuridique | null,
        note_risque: r.score_risque ?? 0,
      })))
      setFacturesActives(toutes)
      lastFetchAtRef.current = Date.now()
    } finally {
      setChargement(false)
      initialLoadDoneRef.current = true
      isFetchingRef.current = false
    }
  }, [])

  // Charge dès que l'utilisateur est authentifié, stoppe le chargement si déconnecté
  useEffect(() => {
    if (session) { rafraichir(); rechargerScenarios() }
    else {
      setClients([]); setFacturesActives([]); setScenarios([])
      setMoisMaxBrut(''); setCa12Mois(0); setCa12MoisPrec(0)
      setChargement(false)
      initialLoadDoneRef.current = false
      isFetchingRef.current = false
      lastFetchAtRef.current = 0
    }
  }, [session, rafraichir, rechargerScenarios])

  // Polling silencieux toutes les 60s + rechargement au retour sur la fenêtre
  // Focus limité à 1 appel par tranche de 30s pour éviter les doubles rechargements
  useEffect(() => {
    if (!session) return
    const timer = setInterval(() => { rafraichir() }, 60_000)
    const onFocus = () => {
      if (Date.now() - lastFetchAtRef.current < 30_000) return
      rafraichir()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [session, rafraichir])

  function mettreAJourStatutLocal(numeroPiece: string, statut: StatutFacture | null) {
    setFacturesActives(prev => prev.map(f =>
      f.numero_piece === numeroPiece ? { ...f, statut_facture: statut } : f
    ))
  }

  function mettreAJourClientLocal(codeDso: string, opts: OptsClientLocal) {
    setClients(prev => prev.map(c =>
      c.code_dso === codeDso ? { ...c, ...opts } : c
    ))
  }

  function supprimerFactureLocale(numeroPiece: string) {
    setFacturesActives(prev => prev.filter(f => f.numero_piece !== numeroPiece))
  }

  function mettreAJourResteDuLocal(lettres: { numeroPiece: string; montant: number }[]) {
    if (!lettres.length) return
    const map = new Map(lettres.map(l => [l.numeroPiece, l.montant]))

    // Delta d'encours par client (calculé sur l'état courant avant màj)
    const deltaParClient = new Map<string, number>()
    for (const f of facturesActives) {
      const m = map.get(f.numero_piece)
      if (m !== undefined)
        deltaParClient.set(f.code_client, (deltaParClient.get(f.code_client) ?? 0) + m)
    }

    setFacturesActives(prev =>
      prev
        .map(f => {
          const m = map.get(f.numero_piece)
          if (m === undefined) return f
          return { ...f, reste_du: Math.round((f.reste_du - m) * 100) / 100 }
        })
        .filter(f => Math.abs(f.reste_du) > 0.005)
    )

    // Mise à jour ciblée de encours_total par client — évite un rafraichir() complet
    if (deltaParClient.size > 0) {
      setClients(prev => prev.map(c => {
        const delta = deltaParClient.get(c.code_dso)
        if (!delta) return c
        return { ...c, encours_total: Math.max(0, Math.round((c.encours_total - delta) * 100) / 100) }
      }))
    }
  }

  return (
    <AppDataContext.Provider value={{ clients, facturesActives, chargement, rafraichir, mettreAJourStatutLocal, mettreAJourClientLocal, mettreAJourResteDuLocal, supprimerFactureLocale, moisMaxBrut, ca12Mois, ca12MoisPrec, scenarios, rechargerScenarios }}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData(): AppDataContextType {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData doit être utilisé dans FournisseurDonnees')
  return ctx
}
