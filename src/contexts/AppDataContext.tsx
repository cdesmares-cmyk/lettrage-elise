// Store global : chargement unique au démarrage de l'app
// clients + factures actives (impayées + avoirs non soldés) en mémoire
// → toutes les pages lisent depuis ce contexte, zéro requête à la navigation
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { unstable_batchedUpdates } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'
import type { CompteClient, FactureDetail, StatutFacture, StatutJuridique } from '../types/client'
import type { MembreOrg } from '../types/commentaire'

interface RowCompteClient {
  code_dso: string; nom: string; statut_juridique: string | null
  commercial: string | null; commercial_id: string | null; operateur: string | null
  plateforme: string | null; code_groupement: string | null
  nb_factures_total: number; nb_impayees: number; encours_total: number; derniere_emission: string | null; siret: string | null
  score_risque: number | null
  relance_auto_alerte: boolean | null
  note_client: string | null
  a_suivre: boolean | null
}

interface OptsClientLocal {
  statut_juridique?: StatutJuridique | null
  commercial?: string | null
  commercial_id?: string | null
  operateur?: string | null
  plateforme?: string | null
  code_groupement?: string | null
  siret?: string | null
  note_client?: string | null
  a_suivre?: boolean
}

const COULEURS_MEMBRES = ['#6366F1','#0891B2','#7C3AED','#3BA89F','#C07840','#DC2626','#0D9488']
function couleurMembre(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return COULEURS_MEMBRES[hash % COULEURS_MEMBRES.length]
}
function initialesMembre(nom: string, prenom: string | null): string {
  if (prenom) return `${prenom[0]}${nom[0]}`.toUpperCase()
  return nom.slice(0, 2).toUpperCase()
}

export interface ScenarioRelance {
  id: string
  nom: string
  niveau: number
  type: 'externe' | 'interne'
  objet: string
  corps_texte: string
}

interface AppDataContextType {
  clients: CompteClient[]
  facturesActives: FactureDetail[]    // impayées + avoirs non soldés
  chargement: boolean
  enRafraichissement: boolean
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
  membresOrg: MembreOrg[]
  rechargerMembresOrg: () => Promise<void>
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

// Chargement des factures ouvertes, page apres page, PAR CURSEUR.
//
// POURQUOI PAS range(). range(19000, 19999) devient LIMIT 1000 OFFSET 19000 :
// Postgres produit 20 000 lignes et en jette 19 000. La page 20 refait le
// travail des 19 precedentes, et le cout total est quadratique. Mesure du
// 2026-11-02 sur Elise Lyon : 1 995 ms pour la page 20, 48 pages a charger,
// 1 176 000 lignes lues pour en servir 47 056. Environ deux minutes de temps
// base par chargement complet.
//
// Le curseur demande « les 1000 suivantes APRES cette facture ». Chaque page
// coute 1000 lignes, quelle que soit sa position.
//
// POURQUOI numero_piece. Un curseur exige une cle UNIQUE : sans elle, deux
// lignes ex aequo a la frontiere d'une page sont sautees ou servies deux fois,
// et des factures disparaissent SANS AUCUNE ERREUR. factures porte
// UNIQUE (organisation_id, numero_piece) depuis la migration 019, et le RLS
// enferme deja la requete dans une seule organisation : la cle est sure.
//
// Index dedie : idx_factures_curseur, migration 185.
async function chargerFacturesParCurseur(): Promise<FactureDetail[] | null> {
  const all: FactureDetail[] = []
  let curseur: string | null = null

  for (;;) {
    let requete = supabase.from('v_factures_avec_reste_du').select(COLS)
      .or('reste_du.gt.0.005,reste_du.lt.-0.005')
      .neq('numero_piece', '411_ATTENTE')
      .order('numero_piece', { ascending: true })
      .limit(PAGE)
    if (curseur !== null) requete = requete.gt('numero_piece', curseur)

    const { data, error } = await requete
    // Echec au milieu de la pagination : on renvoie null et PAS une liste
    // partielle. L'ancienne version faisait « break » et rendait ce qu'elle
    // avait : l'application affichait alors un encours amoute sans que rien ne
    // le signale, ce qui est pire qu'une erreur visible.
    if (error) return null

    const lot = (data ?? []) as unknown as FactureDetail[]
    all.push(...lot)
    if (lot.length < PAGE) break
    curseur = lot[lot.length - 1].numero_piece
  }

  return all
}

// L'ordre d'affichage d'avant, retabli ici.
//
// Le serveur triait par client puis par date decroissante. Le curseur impose
// son propre ordre (numero_piece), donc le tri revient au navigateur. Trier
// 47 000 lignes en memoire coute quelques dizaines de millisecondes, sans
// commune mesure avec ce qu'on economise.
//
// Les 68 usages de facturesActives sont des find, filter, map et reduce :
// aucun ne depend d'une position. Seul l'ordre de listes filtrees affichees
// telles quelles pouvait changer, et ce tri le preserve.
//
// localeCompare('fr') et non la collation Postgres : l'ordre entre deux clients
// aux noms proches peut donc differer a la marge de celui d'avant. Sans
// consequence, les listes etant filtrees par client avant affichage — ce qui
// compte est l'ordre des dates DANS un client, et il est identique.
function trierFactures(factures: FactureDetail[]): FactureDetail[] {
  return factures.sort((a, b) => {
    const parClient = a.code_client.localeCompare(b.code_client, 'fr')
    if (parClient !== 0) return parClient
    return (b.date_emission ?? '').localeCompare(a.date_emission ?? '')
  })
}

export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const { session, profil } = useAuth()
  const [clients, setClients] = useState<CompteClient[]>([])
  const [facturesActives, setFacturesActives] = useState<FactureDetail[]>([])
  const [scenarios, setScenarios] = useState<ScenarioRelance[]>([])
  const [membresOrg, setMembresOrg] = useState<MembreOrg[]>([])
  const [chargement, setChargement] = useState(true)
  const [enRafraichissement, setEnRafraichissement] = useState(false)
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
      .select('id, nom, niveau, type, objet, corps_texte')
      .order('niveau', { ascending: true })
      .order('nom', { ascending: true })
    setScenarios((data as ScenarioRelance[]) ?? [])
  }, [])

  const rechargerMembresOrg = useCallback(async () => {
    const { data } = await supabase
      .from('utilisateurs')
      .select('id, nom, prenom, email, role')
      .order('nom', { ascending: true })
    const membres: MembreOrg[] = ((data ?? []) as { id: string; nom: string; prenom: string | null; email: string; role: string }[])
      .filter(u => u.role !== 'externe')
      .map(u => ({
        id:        u.id,
        nom:       u.nom,
        prenom:    u.prenom,
        email:     u.email,
        initiales: initialesMembre(u.nom, u.prenom),
        couleur:   couleurMembre(u.id),
      }))
    setMembresOrg(membres)
  }, [])

  const rafraichir = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    if (!initialLoadDoneRef.current) setChargement(true)
    setEnRafraichissement(true)
    try {
      // Clients et factures en parallèle. Les factures n'ont plus de « page 0 »
      // a part : le curseur enchaine ses pages lui-meme, et la premiere n'a
      // rien de particulier.
      const [clientsPage0, facturesChargees] = await Promise.all([
        supabase.from('v_comptes_clients').select('*').order('nom', { ascending: true }).range(0, PAGE - 1),
        chargerFacturesParCurseur(),
      ])

      if (clientsPage0.error) { toast.error('Erreur chargement clients'); return }
      // null = la pagination a echoue en cours de route. On garde l'etat
      // precedent plutot que d'afficher un encours incomplet.
      if (facturesChargees === null) { toast.error('Erreur chargement factures'); return }

      const tousClients = await paginateClients((clientsPage0.data as unknown as RowCompteClient[]) ?? [])
      const toutes = trierFactures(facturesChargees)

      // Mise à jour état — un seul render garanti (batching explicite)
      unstable_batchedUpdates(() => {
        setClients(tousClients.map(r => ({
          ...r,
          statut_juridique: r.statut_juridique as StatutJuridique | null,
          note_risque: r.score_risque ?? 0,
          relance_auto_alerte: r.relance_auto_alerte ?? false,
          a_suivre: r.a_suivre ?? false,
        })))
        setFacturesActives(toutes)
      })
      lastFetchAtRef.current = Date.now()
    } finally {
      setChargement(false)
      setEnRafraichissement(false)
      initialLoadDoneRef.current = true
      isFetchingRef.current = false
    }
  }, [])

  // Charge dès que l'utilisateur est authentifié, stoppe le chargement si déconnecté
  useEffect(() => {
    if (session) { rafraichir(); rechargerScenarios(); rechargerMembresOrg() }
    else {
      setClients([]); setFacturesActives([]); setScenarios([]); setMembresOrg([])
      setMoisMaxBrut(''); setCa12Mois(0); setCa12MoisPrec(0)
      setChargement(false); setEnRafraichissement(false)
      initialLoadDoneRef.current = false
      isFetchingRef.current = false
      lastFetchAtRef.current = 0
    }
  }, [session, rafraichir, rechargerScenarios, rechargerMembresOrg])

  // Polling silencieux toutes les 15 minutes + rechargement au retour sur la
  // fenêtre, limité à 1 appel par tranche de 2 minutes.
  //
  // HISTORIQUE DES RELEVEMENTS. 60s a l'origine, puis 300s le 2026-07-29 face a
  // un depassement d'EGRESS Supabase (voir CHANTIER_EGRESS_FACTURES.md, phase
  // 0), puis 900s le 2026-11-02. Les commentaires annoncaient encore 60s alors
  // que le code disait 300_000 : corrige en meme temps.
  //
  // POURQUOI CE RECHARGEMENT COUTE CHER. Il relit L'INTEGRALITE des factures
  // ouvertes, pas un delta. Trois leviers, deux tires :
  //   - Le cout par ligne : traite, index partiels 184 et 185.
  //   - Le cout par page : traite, pagination par curseur.
  //   - La FREQUENCE : c'est ce reglage, et c'est un choix de produit, pas une
  //     optimisation technique. Passer a 15 minutes divise par trois le nombre
  //     de rechargements.
  //
  // CE QUE 15 MINUTES COUTE. Une modification faite dans une AUTRE session met
  // jusqu'a 15 minutes a apparaitre. L'evenement focus ci-dessous rattrape le
  // cas courant : quelqu'un qui revient sur Ockham apres etre alle ailleurs
  // declenche une mise a jour, au plus une fois toutes les 2 minutes.
  //
  // CE QUI N'EST PAS RATTRAPE, et c'est le vrai defaut a connaitre : deux
  // operateurs travaillant EN MEME TEMPS sur le meme client, sans changer
  // d'onglet. Le second voit l'etat d'il y a quinze minutes. Pour revenir en
  // arriere, remettre 300_000 : un seul nombre, aucun effet de bord.
  //
  // RESTE A FAIRE, phase 1 du chantier EGRESS : ne plus recharger les factures
  // du tout, une fois au login. Bloque par un defaut mesure le 2026-11-02 — la
  // compensation et la correction de lettrage appellent
  // rafraichirFacturesClient(), qui n'ecrit que dans l'etat local du hook
  // useFacturesClient et PAS dans facturesActives. Sans le rechargement
  // periodique, le tableau de bord garderait l'ancien reste_du apres une
  // compensation. A corriger AVANT de supprimer ce timer.
  useEffect(() => {
    if (!session) return
    const timer = setInterval(() => { rafraichir() }, 900_000)
    const onFocus = () => {
      if (Date.now() - lastFetchAtRef.current < 120_000) return
      rafraichir()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [session, rafraichir])

  // Fetch séparé des données org — déclenché quand profil est disponible (après login).
  // Filtre explicite par organisation_id : fonctionne pour tous les rôles y compris superadmin
  // dont la RLS renverrait plusieurs lignes avec un simple .single() sans filtre.
  useEffect(() => {
    if (!session || !profil?.organisation_id) return
    supabase
      .from('organisations')
      .select('mois_ref, ca12_mois, ca12_mois_prec')
      .eq('id', profil.organisation_id)
      .single()
      .then(({ data }) => {
        const org = data as { mois_ref: string; ca12_mois: number; ca12_mois_prec: number } | null
        if (org?.mois_ref) {
          setMoisMaxBrut(org.mois_ref)
          setCa12Mois(Number(org.ca12_mois) || 0)
          setCa12MoisPrec(Number(org.ca12_mois_prec) || 0)
        }
      })
  }, [session, profil?.organisation_id])

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
    <AppDataContext.Provider value={{ clients, facturesActives, chargement, enRafraichissement, rafraichir, mettreAJourStatutLocal, mettreAJourClientLocal, mettreAJourResteDuLocal, supprimerFactureLocale, moisMaxBrut, ca12Mois, ca12MoisPrec, scenarios, rechargerScenarios, membresOrg, rechargerMembresOrg }}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData(): AppDataContextType {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData doit être utilisé dans FournisseurDonnees')
  return ctx
}
