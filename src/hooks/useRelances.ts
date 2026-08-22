import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export type StatutRelance = 'brouillon' | 'envoyee' | 'repondue' | 'promesse_paiement' | 'sans_reponse' | 'payee'
export type EtatVueRelance = 'en_cours' | 'payee' | 'sans_suite'

export const SEUIL_SANS_SUITE_DEFAUT = 30

export interface ContactSnapshot {
  id: string
  nom: string
  prenom: string | null
  email: string
  role_contact?: string | null
}

export interface FactureSnapshot {
  numero_piece: string
  reste_du: number
}

export interface Relance {
  id: string
  code_client: string
  operateur_id: string
  contacts_ids: string[]
  contacts_snapshot: ContactSnapshot[] | null
  factures_ids: string[]
  factures_snapshot: FactureSnapshot[] | null
  objet: string
  statut: StatutRelance
  points_attribues: number
  cree_le: string
  envoyee_le: string | null
  mis_a_jour_le: string
  archivee: boolean
  note: string | null
  note_operateur: string | null
  note_archivee_le: string | null
  date_rappel: string | null
  solde_snapshot: number
}

export function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// Dérive l'état d'affichage d'une relance à partir des données actuelles.
// Payée : le reste dû a diminué depuis l'envoi (lettrage détecté).
// Sans suite : aucun paiement et seuil de jours dépassé.
export function etatVue(
  r: Relance,
  facturesMap: Map<string, { reste_du: number }>,
  seuilSansSuite: number = SEUIL_SANS_SUITE_DEFAUT
): EtatVueRelance {
  if (!r.envoyee_le) return 'en_cours'

  if (r.factures_snapshot?.length) {
    // Comparaison par facture : si absent de la Map, on prend la valeur snapshot (delta = 0)
    const aPayement = r.factures_snapshot.some(snap => {
      const current = facturesMap.get(snap.numero_piece)?.reste_du ?? snap.reste_du
      return snap.reste_du > 0 && current < snap.reste_du
    })
    if (aPayement) return 'payee'
  } else {
    // Fallback relances sans snapshot : total, uniquement si toutes les factures sont dans la Map
    const ids = r.factures_ids ?? []
    const tousPresents = ids.length > 0 && ids.every(id => facturesMap.has(id))
    if (tousPresents) {
      const soldeCourant = ids.reduce((s, id) => s + facturesMap.get(id)!.reste_du, 0)
      if (r.solde_snapshot > 0 && soldeCourant < r.solde_snapshot) return 'payee'
    }
  }

  if (joursDepuis(r.envoyee_le) >= seuilSansSuite) return 'sans_suite'
  return 'en_cours'
}

export interface KpisRelance {
  scoreMois: number
  streak: number
  nbRelancesMois: number
  tauxReponse: number
  nbSansReponse: number
}

const POINTS: Record<StatutRelance, number> = {
  brouillon: 0,
  envoyee: 10,
  repondue: 20,
  promesse_paiement: 25,
  sans_reponse: 0,
  payee: 30,
}

function debutMois(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function calcStreak(relances: Relance[]): number {
  const envoyeesParJour = new Set(
    relances
      .filter(r => r.statut !== 'brouillon' && r.envoyee_le)
      .map(r => r.envoyee_le!.slice(0, 10))
  )
  let streak = 0
  const auj = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(auj)
    d.setDate(auj.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (envoyeesParJour.has(key)) {
      streak++
    } else if (i === 0) {
      // Aujourd'hui sans relance : on commence à vérifier hier
      continue
    } else {
      break
    }
  }
  return streak
}

export function useRelances() {
  const { utilisateur, profil } = useAuth()
  const [relances, setRelances] = useState<Relance[]>([])
  const [chargement, setChargement] = useState(false)
  const [seuilSansSuite, setSeuilSansSuite] = useState(SEUIL_SANS_SUITE_DEFAUT)
  const [facturesMapRelances, setFacturesMapRelances] = useState<Map<string, { reste_du: number; montant_ttc: number }>>(new Map())

  useEffect(() => {
    supabase.from('ref_valeurs').select('valeur').eq('categorie', 'config_seuil_sans_suite').maybeSingle()
      .then(({ data }) => {
        const val = parseInt((data as { valeur: string } | null)?.valeur ?? '')
        if (!isNaN(val) && val > 0) setSeuilSansSuite(val)
      })
  }, [])

  useEffect(() => {
    if (!utilisateur) { setRelances([]); setFacturesMapRelances(new Map()); return }
    setChargement(true)
    supabase
      .from('relances')
      .select('id, code_client, operateur_id, contacts_ids, contacts_snapshot, factures_ids, factures_snapshot, objet, statut, points_attribues, cree_le, envoyee_le, mis_a_jour_le, archivee, note, note_operateur, note_archivee_le, date_rappel, solde_snapshot')
      .order('cree_le', { ascending: false })
      .then(async ({ data }) => {
        const relancesData = (data ?? []) as Relance[]
        setRelances(relancesData)

        const ids = [...new Set(relancesData.flatMap(r => r.factures_ids ?? []))]
        if (!ids.length) { setChargement(false); return }

        const CHUNK = 200
        const chunks: string[][] = []
        for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))

        const results = await Promise.all(
          chunks.map(chunk =>
            supabase
              .from('v_factures_avec_reste_du')
              .select('numero_piece, reste_du, montant_ttc')
              .in('numero_piece', chunk)
          )
        )

        const allRows = results.flatMap(({ data, error }) => {
          if (error) console.error('[useRelances] facturesMap chunk:', error)
          return (data ?? []) as { numero_piece: string; reste_du: number; montant_ttc: number }[]
        })

        setFacturesMapRelances(
          new Map(allRows.map(f => [f.numero_piece, { reste_du: f.reste_du, montant_ttc: f.montant_ttc }]))
        )
        setChargement(false)
      })
  }, [utilisateur])

  const kpis = useMemo<KpisRelance>(() => {
    const debut = debutMois()
    const cesMois = relances.filter(r => r.envoyee_le && new Date(r.envoyee_le) >= debut)
    const envoyeesCeMois = cesMois.filter(r => r.statut !== 'brouillon')

    const scoreMois = cesMois.reduce((sum, r) => sum + r.points_attribues, 0)
    const nbRelancesMois = envoyeesCeMois.length
    const nbReponduOuPayee = cesMois.filter(r => r.statut === 'repondue' || r.statut === 'promesse_paiement' || r.statut === 'payee').length
    const tauxReponse = nbRelancesMois > 0 ? Math.round((nbReponduOuPayee / nbRelancesMois) * 100) : 0
    const nbSansReponse = relances.filter(r => r.statut === 'sans_reponse').length
    const streak = calcStreak(relances)

    return { scoreMois, streak, nbRelancesMois, tauxReponse, nbSansReponse }
  }, [relances])

  async function mettreAJourStatut(id: string, statut: StatutRelance, dateRappel?: string) {
    const pts = POINTS[statut]
    const patch: Record<string, unknown> = { statut, points_attribues: pts }
    if (statut === 'envoyee') patch.envoyee_le = new Date().toISOString()
    if (statut === 'sans_reponse' && dateRappel) patch.date_rappel = dateRappel
    const { error } = await supabase.from('relances').update(patch as never).eq('id', id)
    if (error) { toast.error('Erreur mise à jour statut'); return false }
    setRelances(prev => prev.map(r => r.id === id ? { ...r, ...patch } as Relance : r))
    const messages: Partial<Record<StatutRelance, string>> = {
      repondue:           '✓ Prise de contact · +20 pts',
      promesse_paiement:  '✓ Promesse de paiement · +25 pts',
      payee:              '🎉 Payée · +30 pts',
      sans_reponse:       'Marquée sans réponse',
    }
    if (messages[statut]) toast.success(messages[statut]!)
    return true
  }

  async function mettreAJourNote(id: string, note: string) {
    const { error } = await supabase.from('relances').update({ note } as never).eq('id', id)
    if (error) { toast.error('Erreur sauvegarde note'); return false }
    setRelances(prev => prev.map(r => r.id === id ? { ...r, note } : r))
    return true
  }

  async function archiver(id: string) {
    const patch: Record<string, unknown> = {
      archivee: true,
      note_operateur: profil?.initiales ?? null,
      note_archivee_le: new Date().toISOString(),
    }
    const { error } = await supabase.from('relances').update(patch as never).eq('id', id)
    if (error) { toast.error('Erreur archivage'); return false }
    setRelances(prev => prev.map(r => r.id === id ? { ...r, ...patch } as Relance : r))
    toast.success('Relance archivée')
    return true
  }

  return { relances, chargement, kpis, mettreAJourStatut, mettreAJourNote, archiver, seuilSansSuite, facturesMapRelances }
}
