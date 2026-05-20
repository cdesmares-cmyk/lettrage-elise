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
  nb_factures_total: number; nb_impayees: number; encours_total: number; derniere_emission: string | null
}

interface OptsClientLocal {
  statut_juridique?: StatutJuridique | null
  commercial?: string | null
  operateur?: string | null
  plateforme?: string | null
  code_groupement?: string | null
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
  moisMaxFactures: string   // YYYY-MM, mois de la facture la plus récente en base
  ca12Mois: number          // Σ montant_ttc sur la fenêtre moisMax-11 → moisMax
}

const AppDataContext = createContext<AppDataContextType | null>(null)

export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [clients, setClients] = useState<CompteClient[]>([])
  const [facturesActives, setFacturesActives] = useState<FactureDetail[]>([])
  const [chargement, setChargement] = useState(true)
  const [moisMaxFactures, setMoisMaxFactures] = useState('')
  const [ca12Mois, setCa12Mois] = useState(0)
  // Après le premier chargement réussi, rafraichir() tourne silencieusement sans bloquer l'UI
  const initialLoadDoneRef = useRef(false)

  const rafraichir = useCallback(async () => {
    if (!initialLoadDoneRef.current) setChargement(true)
    try {
      const COLS = 'numero_piece,code_client,nom_client,date_emission,date_echeance,montant_ht,montant_ttc,reste_du,statut_paiement,statut_facture,est_avoir,axonaut_pdf_url'
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

      // moisMax + CA 12 mois paginé — référence DSO, recalculé à chaque import
      const { data: maxData } = await supabase.from('factures')
        .select('date_emission').eq('est_avoir', false)
        .order('date_emission', { ascending: false }).limit(1)
      const moisMaxBrut = (maxData?.[0] as { date_emission: string } | undefined)?.date_emission?.slice(0, 7) ?? ''
      if (moisMaxBrut) {
        // M-1 : le mois le plus récent est souvent incomplet → on recule d'un mois
        const yrBrut = parseInt(moisMaxBrut.slice(0, 4)), moBrut = parseInt(moisMaxBrut.slice(5, 7))
        const moRef = moBrut === 1 ? 12 : moBrut - 1
        const yrRef = moBrut === 1 ? yrBrut - 1 : yrBrut
        const moisMax = `${yrRef}-${String(moRef).padStart(2, '0')}`
        setMoisMaxFactures(moisMax)
        // Calcul pure string — évite le décalage UTC/heure locale
        const yr = yrRef, mo = moRef
        let startMo = mo - 11; let startYr = yr
        if (startMo <= 0) { startMo += 12; startYr -= 1 }
        const lastDay = new Date(yr, mo, 0).getDate()
        const dateDebut = `${startYr}-${String(startMo).padStart(2, '0')}-01`
        const dateFin = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        let ca = 0; let caOffset = 0; const CA_PAGE = 1000
        while (true) {
          const { data: caData } = await supabase.from('factures').select('montant_ttc')
            .gte('date_emission', dateDebut).lte('date_emission', dateFin)
            .eq('est_avoir', false).range(caOffset, caOffset + CA_PAGE - 1)
          if (!caData?.length) break
          ca += (caData as { montant_ttc: number | null }[]).reduce((s, r) => s + (Number(r.montant_ttc) || 0), 0)
          if (caData.length < CA_PAGE) break
          caOffset += CA_PAGE
        }
        setCa12Mois(ca)
        console.log('[DSO-CTX] moisMaxBrut:', moisMaxBrut, '| moisMax (M-1):', moisMax, '| dateDebut:', dateDebut, '| dateFin:', dateFin, '| ca12Mois:', ca)
      }

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
      initialLoadDoneRef.current = true
    }
  }, [])

  // Charge dès que l'utilisateur est authentifié, stoppe le chargement si déconnecté
  useEffect(() => {
    if (session) { rafraichir() }
    else { setClients([]); setFacturesActives([]); setMoisMaxFactures(''); setCa12Mois(0); setChargement(false) }
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
    <AppDataContext.Provider value={{ clients, facturesActives, chargement, rafraichir, mettreAJourStatutLocal, mettreAJourClientLocal, mettreAJourResteDuLocal, moisMaxFactures, ca12Mois }}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData(): AppDataContextType {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData doit être utilisé dans FournisseurDonnees')
  return ctx
}
