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
  moisMaxBrut: string    // YYYY-MM, vrai mois de la facture la plus récente
  ca12Mois: number       // Σ montant_ttc sur les 12 mois se terminant à moisMaxBrut
  ca12MoisPrec: number   // Σ montant_ttc sur les 12 mois se terminant à moisMaxBrut-1 (toggle)
  scenarios: ScenarioRelance[]
  rechargerScenarios: () => Promise<void>
}

function ca12Dates(yr: number, mo: number): { debut: string; fin: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  let startMo = mo - 11; let startYr = yr
  if (startMo <= 0) { startMo += 12; startYr -= 1 }
  const lastDay = new Date(yr, mo, 0).getDate()
  return {
    debut: `${startYr}-${pad(startMo)}-01`,
    fin: `${yr}-${pad(mo)}-${pad(lastDay)}`,
  }
}

const AppDataContext = createContext<AppDataContextType | null>(null)

export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [clients, setClients] = useState<CompteClient[]>([])
  const [facturesActives, setFacturesActives] = useState<FactureDetail[]>([])
  const [scenarios, setScenarios] = useState<ScenarioRelance[]>([])
  const [chargement, setChargement] = useState(true)
  const [moisMaxBrut, setMoisMaxBrut] = useState('')
  const [ca12Mois, setCa12Mois] = useState(0)
  const [ca12MoisPrec, setCa12MoisPrec] = useState(0)
  // Après le premier chargement réussi, rafraichir() tourne silencieusement sans bloquer l'UI
  const initialLoadDoneRef = useRef(false)
  // moisMax du dernier calcul CA12 — évite de re-calculer si rien n'a changé entre deux polls
  const moisMaxCA12Ref = useRef('')

  const rechargerScenarios = useCallback(async () => {
    const { data } = await supabase
      .from('scenarios_relance')
      .select('id, nom, niveau, objet, corps_texte')
      .order('niveau', { ascending: true })
      .order('nom', { ascending: true })
    setScenarios((data as ScenarioRelance[]) ?? [])
  }, [])

  const rafraichir = useCallback(async () => {
    if (!initialLoadDoneRef.current) setChargement(true)
    try {
      const COLS = 'numero_piece,code_client,nom_client,date_emission,date_echeance,montant_ht,montant_ttc,reste_du,statut_paiement,statut_facture,est_avoir,axonaut_pdf_url'
      const PAGE = 1000

      // Page 0 — clients et factures en parallèle
      const [clientsPage0, page0] = await Promise.all([
        supabase.from('v_comptes_clients').select('*').order('nom', { ascending: true }).range(0, PAGE - 1),
        supabase.from('v_factures_avec_reste_du').select(COLS)
          .or('reste_du.gt.0.005,reste_du.lt.-0.005')
          .order('code_client', { ascending: true })
          .order('date_emission', { ascending: false })
          .range(0, PAGE - 1),
      ])

      if (clientsPage0.error) { toast.error('Erreur chargement clients'); return }
      if (page0.error) { return }

      let tousClients: RowCompteClient[] = (clientsPage0.data as unknown as RowCompteClient[]) ?? []
      let toutes: FactureDetail[] = (page0.data as unknown as FactureDetail[]) ?? []

      // Pagination complète clients
      let offsetClients = PAGE
      while (tousClients.length === offsetClients) {
        const { data, error } = await supabase.from('v_comptes_clients').select('*')
          .order('nom', { ascending: true })
          .range(offsetClients, offsetClients + PAGE - 1)
        if (error || !data?.length) break
        tousClients = [...tousClients, ...(data as unknown as RowCompteClient[])]
        offsetClients += PAGE
      }

      // Pagination complète factures (impayées + avoirs + _compte ≠ 0)
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

      // moisMaxBrut dérivé des factures en mémoire — toujours cohérent avec facturesActives
      const moisMax = toutes
        .filter(f => !f.est_avoir && !f.numero_piece.endsWith('_compte'))
        .reduce((mx, f) => { const m = (f.date_emission ?? '').slice(0, 7); return m > mx ? m : mx }, '')

      // CA12 — RPC uniquement si moisMax a changé (nouvel import ou premier chargement)
      if (moisMax && moisMax !== moisMaxCA12Ref.current) {
        try {
          const yr = parseInt(moisMax.slice(0, 4)), mo = parseInt(moisMax.slice(5, 7))
          const yrPrec = mo === 1 ? yr - 1 : yr
          const moPrec = mo === 1 ? 12 : mo - 1
          const d  = ca12Dates(yr, mo)
          const dP = ca12Dates(yrPrec, moPrec)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, string>) => Promise<{ data: unknown }>
          const [rca, rcaPrec] = await Promise.all([
            rpc('get_ca_periode', { p_debut: d.debut, p_fin: d.fin }),
            rpc('get_ca_periode', { p_debut: dP.debut, p_fin: dP.fin }),
          ])
          moisMaxCA12Ref.current = moisMax
          setMoisMaxBrut(moisMax)
          setCa12Mois(Number((rca.data as unknown as number) ?? 0))
          setCa12MoisPrec(Number((rcaPrec.data as unknown as number) ?? 0))
        } catch (err) {
          console.warn('[CA12] RPC get_ca_periode indisponible, DSO non calculé:', err)
          setMoisMaxBrut(moisMax)
        }
      }

      // Mise à jour état — une seule fois, données complètes garanties
      setClients(tousClients.map(r => ({
        ...r,
        statut_juridique: r.statut_juridique as StatutJuridique | null,
        note_risque: r.score_risque ?? 0,
      })))
      setFacturesActives(toutes)
    } finally {
      setChargement(false)
      initialLoadDoneRef.current = true
    }
  }, [])

  // Charge dès que l'utilisateur est authentifié, stoppe le chargement si déconnecté
  useEffect(() => {
    if (session) { rafraichir(); rechargerScenarios() }
    else { setClients([]); setFacturesActives([]); setScenarios([]); setMoisMaxBrut(''); setCa12Mois(0); setCa12MoisPrec(0); setChargement(false) }
  }, [session, rafraichir, rechargerScenarios])

  // Polling silencieux toutes les 60s + rechargement au retour sur la fenêtre
  // Maintient les données à jour pour les équipes multi-utilisateurs sans Realtime
  useEffect(() => {
    if (!session) return
    const timer = setInterval(() => { rafraichir() }, 60_000)
    const onFocus = () => { rafraichir() }
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
    <AppDataContext.Provider value={{ clients, facturesActives, chargement, rafraichir, mettreAJourStatutLocal, mettreAJourClientLocal, mettreAJourResteDuLocal, moisMaxBrut, ca12Mois, ca12MoisPrec, scenarios, rechargerScenarios }}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData(): AppDataContextType {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData doit être utilisé dans FournisseurDonnees')
  return ctx
}
