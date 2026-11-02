import { useState, useEffect, useMemo, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export type StatutRelance = 'brouillon' | 'envoyee' | 'repondue' | 'promesse_paiement' | 'sans_reponse' | 'payee'
export type EtatVueRelance = 'en_cours' | 'payee' | 'sans_suite'

export const SEUIL_SANS_SUITE_DEFAUT = 30

// Une ligne de relances_auto_log : le journal du robot.
//
// ATTENTION au comptage. Cette table porte UNE LIGNE PAR FACTURE, pas une par
// email. Un envoi couvrant deux factures laisse deux lignes partageant le meme
// resend_id. Compter les lignes revient a compter double.
export interface RelanceAuto {
  code_client: string
  numero_facture: string
  envoye_le: string
  statut: 'envoye' | 'bounce' | 'erreur'
  resend_id: string | null
  contact_email: string | null
  /** Montant de l'ENVOI, recopie sur chaque ligne. Ne jamais sommer. */
  montant_total: number | null
}

/** Un envoi du robot, reconstitue depuis les lignes de son journal. */
export interface EnvoiAuto {
  cle: string
  code_client: string
  envoye_le: string
  statut: 'envoye' | 'bounce' | 'erreur'
  contact_email: string | null
  montant_total: number
  numeros: string[]
}

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
  type: 'externe' | 'interne'
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
  payee_detectee_le: string | null
}

export function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// Un lettrage rattaché à une relance.
// date_lettrage porte la date BANCAIRE — le jour où l'argent est arrivé sur le
// compte (migration 071, verrouillé par un trigger). saisi_le porte la date
// d'enregistrement dans l'outil.
export interface LettrageRelance {
  date_lettrage: string
  saisi_le: string
  montant: number
}

// Un lettrage compte comme encaissement de la relance s'il est positif — une
// écriture négative est une correction, elle augmente la dette — et s'il est
// postérieur à l'envoi, par sa date bancaire OU par sa date de saisie.
// Le second cas couvre le paiement reçu juste avant la relance mais lettré
// après : la date bancaire seule ne le voit jamais.
export function estEncaissement(l: LettrageRelance, dateEnvoi: string): boolean {
  return l.montant > 0 && (l.date_lettrage >= dateEnvoi || l.saisi_le.slice(0, 10) >= dateEnvoi)
}

// Dérive l'état d'affichage d'une relance à partir des données actuelles.
// Sans suite : aucun encaissement et seuil de jours dépassé.
export function etatVue(
  r: Relance,
  lettragesMap: Map<string, LettrageRelance[]>,
  seuilSansSuite: number = SEUIL_SANS_SUITE_DEFAUT
): EtatVueRelance {
  if (!r.envoyee_le) return 'en_cours'
  const dateEnvoi = r.envoyee_le.slice(0, 10)
  const ids = r.factures_ids ?? []
  const aEncaissement = ids.some(id =>
    (lettragesMap.get(id) ?? []).some(l => estEncaissement(l, dateEnvoi))
  )
  if (aEncaissement) return 'payee'
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
  const [lettragesMap, setLettragesMap] = useState<Map<string, LettrageRelance[]>>(new Map())
  const [relancesAuto, setRelancesAuto] = useState<RelanceAuto[]>([])

  // Compteur de rechargement. L'incrementer relance le chargement des relances.
  // Appele apres un envoi, pour que l'ecran reflete immediatement ce qui vient
  // de partir, sans attendre un rechargement de page.
  const [tickRechargement, setTickRechargement] = useState(0)
  const recharger = useCallback(() => setTickRechargement(t => t + 1), [])

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
      .select('id, code_client, operateur_id, contacts_ids, contacts_snapshot, factures_ids, factures_snapshot, objet, statut, type, points_attribues, cree_le, envoyee_le, mis_a_jour_le, archivee, note, note_operateur, note_archivee_le, date_rappel, solde_snapshot, payee_detectee_le')
      .order('cree_le', { ascending: false })
      .then(async ({ data }) => {
        const relancesData = (data ?? []) as Relance[]
        setRelances(relancesData)

        // Le journal du robot. L'interface l'ignorait entierement : un client
        // relance automatiquement affichait « jamais relance », et le bouton
        // « Relance aujourd'hui » ne se colorait pas. Le robot, lui, lit les
        // deux tables depuis toujours pour sa deduplication — l'ignorance
        // n'allait que dans un sens, et c'etait le mauvais.
        supabase
          .from('relances_auto_log')
          .select('code_client, numero_facture, envoye_le, statut, resend_id, contact_email, montant_total')
          .order('envoye_le', { ascending: false })
          .then(({ data: autoData }) => setRelancesAuto((autoData ?? []) as RelanceAuto[]))

        const ids = [...new Set(relancesData.flatMap(r => r.factures_ids ?? []))]
        if (!ids.length) { setChargement(false); return }

        const CHUNK = 200
        const chunks: string[][] = []
        for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))

        const [facturesResults, lettragesResults] = await Promise.all([
          Promise.all(chunks.map(chunk =>
            supabase.from('v_factures_avec_reste_du').select('numero_piece, reste_du, montant_ttc').in('numero_piece', chunk)
          )),
          Promise.all(chunks.map(chunk =>
            supabase.from('lettrages').select('numero_facture, date_lettrage, created_at, montant').in('numero_facture', chunk).or('annule.is.null,annule.eq.false')
          )),
        ])

        const allFactures = facturesResults.flatMap(({ data, error }) => {
          if (error) console.error('[useRelances] facturesMap chunk:', error)
          return (data ?? []) as { numero_piece: string; reste_du: number; montant_ttc: number }[]
        })
        setFacturesMapRelances(
          new Map(allFactures.map(f => [f.numero_piece, { reste_du: f.reste_du, montant_ttc: f.montant_ttc }]))
        )

        const allLettrages = lettragesResults.flatMap(({ data, error }) => {
          if (error) console.error('[useRelances] lettragesMap chunk:', error)
          return (data ?? []) as { numero_facture: string; date_lettrage: string; created_at: string; montant: number }[]
        })
        const ltMap = new Map<string, LettrageRelance[]>()
        for (const row of allLettrages) {
          const arr = ltMap.get(row.numero_facture) ?? []
          arr.push({ date_lettrage: row.date_lettrage, saisi_le: row.created_at, montant: row.montant })
          ltMap.set(row.numero_facture, arr)
        }
        for (const [k, v] of ltMap) ltMap.set(k, v.sort((a, b) => a.date_lettrage.localeCompare(b.date_lettrage)))
        setLettragesMap(ltMap)
        setChargement(false)
      })
  }, [utilisateur, tickRechargement])

  // Écrit payee_detectee_le la première fois qu'une relance est détectée comme payée
  useEffect(() => {
    if (chargement || !lettragesMap.size) return
    const aPatcher = relances.filter(r =>
      !r.payee_detectee_le &&
      r.envoyee_le &&
      etatVue(r, lettragesMap, seuilSansSuite) === 'payee'
    )
    if (!aPatcher.length) return
    Promise.all(
      aPatcher.map(r => {
        const dateEnvoi = r.envoyee_le!.slice(0, 10)
        // On stocke la date BANCAIRE de l'encaissement : elle dit quand l'argent
        // est réellement arrivé, y compris avant l'envoi de la relance.
        let minDate: string | null = null
        for (const id of r.factures_ids ?? []) {
          for (const l of lettragesMap.get(id) ?? []) {
            if (!estEncaissement(l, dateEnvoi)) continue
            if (!minDate || l.date_lettrage < minDate) minDate = l.date_lettrage
          }
        }
        const dateAEcrire = minDate ? new Date(minDate).toISOString() : r.envoyee_le!
        return supabase.from('relances').update({ payee_detectee_le: dateAEcrire } as never).eq('id', r.id)
          .then(() => ({ id: r.id, date: dateAEcrire }))
      })
    ).then(patches => {
      setRelances(prev => prev.map(r => {
        const patch = patches.find(p => p.id === r.id)
        return patch ? { ...r, payee_detectee_le: patch.date } : r
      }))
    })
  }, [chargement, lettragesMap, seuilSansSuite])

  // Les lignes du journal regroupees en envois.
  //
  // La cle est le resend_id : c'est lui qui identifie un email. Une ligne sans
  // resend_id est un envoi qui a echoue avant de partir ; on la regroupe alors
  // par client et par horodatage, faute de mieux.
  //
  // montant_total est recopie a l'identique sur chaque ligne de l'envoi. Le
  // sommer multiplierait le montant par le nombre de factures — c'est le piege
  // de cette table, et la raison d'etre de ce regroupement.
  const envoisAuto = useMemo<EnvoiAuto[]>(() => {
    const parEnvoi = new Map<string, EnvoiAuto>()
    for (const r of relancesAuto) {
      const cle = r.resend_id ?? `${r.code_client}|${r.envoye_le}`
      const existant = parEnvoi.get(cle)
      if (existant) {
        existant.numeros.push(r.numero_facture)
        continue
      }
      parEnvoi.set(cle, {
        cle,
        code_client:   r.code_client,
        envoye_le:     r.envoye_le,
        statut:        r.statut,
        contact_email: r.contact_email,
        montant_total: r.montant_total ?? 0,
        numeros:       [r.numero_facture],
      })
    }
    return [...parEnvoi.values()].sort((a, b) => b.envoye_le.localeCompare(a.envoye_le))
  }, [relancesAuto])

  // Date du dernier envoi ABOUTI par client. Un rebond ne compte pas : le
  // client n'a rien recu, le relancer a nouveau n'est pas un doublon.
  const derniereRelanceAutoParClient = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of relancesAuto) {
      if (r.statut !== 'envoye') continue
      const actuelle = map.get(r.code_client)
      if (!actuelle || r.envoye_le > actuelle) map.set(r.code_client, r.envoye_le)
    }
    return map
  }, [relancesAuto])

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

  return { relances, chargement, kpis, mettreAJourStatut, mettreAJourNote, archiver, seuilSansSuite, facturesMapRelances, lettragesMap, recharger, relancesAuto, envoisAuto, derniereRelanceAutoParClient }
}
