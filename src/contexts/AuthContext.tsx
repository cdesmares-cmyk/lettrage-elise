import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { marquerStructureChoisie } from '../lib/structureSession'

interface ProfilUtilisateur {
  role: string
  /** Structure ACTIVE, pas celle d'origine. Tout le front doit lire celle-ci :
   *  c'est elle que get_my_organisation_id() renvoie cote base, donc la seule
   *  avec laquelle une ecriture sera acceptee. */
  organisation_id: string
  nom_organisation: string
  code_org: string
  prenom: string
  nom: string
  initiales: string
}

/** Une structure dont l'utilisateur est membre. Liste vide = compte
 *  mono-structure, c'est le cas de tous les comptes aujourd'hui. */
export interface OrganisationMembre {
  id: string
  nom: string
  code_org: string | null
  est_active: boolean
}

interface ContexteAuth {
  session: Session | null
  utilisateur: User | null
  profil: ProfilUtilisateur | null
  organisations: OrganisationMembre[]
  basculerStructure: (organisationId: string) => Promise<void>
  chargement: boolean
  typeMotDePasse: 'invite' | 'recovery' | null
  motDePasseDefini: () => void
}

const ContexteAuth = createContext<ContexteAuth>({
  session: null,
  utilisateur: null,
  profil: null,
  organisations: [],
  basculerStructure: async () => {},
  chargement: true,
  typeMotDePasse: null,
  motDePasseDefini: () => {},
})

export function FournisseurAuth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profil, setProfil] = useState<ProfilUtilisateur | null>(null)
  const [organisations, setOrganisations] = useState<OrganisationMembre[]>([])
  const [chargement, setChargement] = useState(true)
  // Détection invitation ou reset mot de passe via le hash de l'URL
  const [typeMotDePasse, setTypeMotDePasse] = useState<'invite' | 'recovery' | null>(() => {
    const hash = window.location.hash
    if (hash.includes('type=invite')) return 'invite'
    if (hash.includes('type=recovery')) return 'recovery'
    return null
  })

  async function chargerProfil(userId: string) {
    // Le lien a suivre est NOMME explicitement.
    //
    // Depuis la table membres_organisations, il existe deux chemins entre
    // utilisateurs et organisations : la cle etrangere directe, et la table de
    // liaison. L'API refuse alors la requete entiere (PGRST201) — et le profil
    // revenant vide, c'est le nom de l'organisation, le mois de reference, le
    // chiffre d'affaires, le DSO et les roles qui tombent d'un coup.
    //
    // Nommer le lien rend cette requete insensible a l'ajout de n'importe
    // quelle relation future entre ces deux tables.
    const { data, error } = await supabase
      .from('utilisateurs')
      .select('role, organisation_id, prenom, nom, initiales, organisations!utilisateurs_organisation_id_fkey(nom, code_org)')
      .eq('id', userId)
      .single()
    // Signalee, jamais avalee : c'est ce silence qui a rendu la panne
    // invisible, le profil vide ne se manifestant que par des ecrans
    // incomplets.
    if (error) console.warn('[Ockham] chargement du profil impossible :', error.message, error)
    const d = data as { role: string; organisation_id: string; prenom: string; nom: string; initiales: string; organisations: { nom: string; code_org: string | null } | null } | null

    // Les structures dont le compte est membre. Vide pour un compte
    // mono-structure — c'est le cas des 22 comptes existants, qui gardent donc
    // exactement le comportement d'avant.
    // L'erreur est signalee, pas avalee : sans ca, une fonction absente ou un
    // droit manquant se traduit par un portail qui ne s'affiche jamais, sans
    // aucune trace. C'est exactement ce qui nous a fait chercher a l'aveugle.
    const { data: orgsData, error: orgsErr } = await supabase.rpc('mes_organisations')
    if (orgsErr) console.warn('[Ockham] mes_organisations() a echoue :', orgsErr.message, orgsErr)
    const orgs = (orgsData ?? []) as OrganisationMembre[]
    setOrganisations(orgs)

    // La structure active fait foi des qu'elle existe. Le nom embarque par la
    // requete ci-dessus suit la cle etrangere organisation_id, c'est-a-dire la
    // structure D'ORIGINE : apres une bascule il ne correspondrait plus a ce
    // qui est affiche a l'ecran.
    const active = orgs.find(o => o.est_active) ?? null

    if (d) setProfil({
      role: d.role,
      organisation_id: active?.id ?? d.organisation_id,
      prenom: d.prenom ?? '',
      nom: d.nom ?? '',
      initiales: d.initiales ?? '',
      nom_organisation: active?.nom ?? d.organisations?.nom ?? '',
      code_org: active?.code_org ?? d.organisations?.code_org ?? '',
    })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        chargerProfil(session.user.id).finally(() => setChargement(false))
      } else {
        setChargement(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setTypeMotDePasse('recovery')
      setSession(session)
      if (session?.user) {
        chargerProfil(session.user.id)
      } else {
        setProfil(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function basculerStructure(organisationId: string) {
    // C'est la base qui decide : la fonction verifie l'appartenance avant
    // d'ecrire, et un declencheur la verifie une seconde fois. Le navigateur
    // demande, il ne choisit pas.
    // Les types Supabase generes ne connaissent pas encore les fonctions des
    // migrations 170/171. A regenerer quand le CLI sera relance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('basculer_organisation', { p_organisation_id: organisationId })
    if (error) throw new Error(error.message)

    marquerStructureChoisie(organisationId)

    // Rechargement COMPLET, volontairement. L'application garde les factures et
    // les clients en memoire : un changement d'etat en douceur afficherait les
    // donnees de la structure precedente sous le nom de la nouvelle.
    window.location.assign('/tableau-de-bord')
  }

  function motDePasseDefini() { setTypeMotDePasse(null) }

  return (
    <ContexteAuth.Provider value={{ session, utilisateur: session?.user ?? null, profil, organisations, basculerStructure, chargement, typeMotDePasse, motDePasseDefini }}>
      {children}
    </ContexteAuth.Provider>
  )
}

export function useAuth() {
  return useContext(ContexteAuth)
}
