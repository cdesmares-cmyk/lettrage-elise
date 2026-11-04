// Hook du module Nettoyage — diagnostic de joignabilité.
//
// Lecture seule, par construction : il montre ce qui manque et ce que ça pèse,
// il ne corrige rien. La correction se fait dans le compte client, où les
// contacts vivent déjà. Deux endroits pour éditer, ce serait deux vérités.
//
// Mesure du 2026-10-31 qui a motivé ce module : 13,7 M€ d'encours chez Elise
// Lyon derrière 3675 clients sans aucune adresse.
//
// La liste des clients vient d'AppDataContext, déjà chargée au démarrage de
// l'application : l'écran s'ouvre sans attendre. Seuls les contacts et
// l'historique des rebonds sont chargés ici, et une seule fois par session.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAppData } from '../contexts/AppDataContext'

// Les cinq rôles que l'écran de saisie propose. Tout le reste vient d'un import
// et doit être rangé à la main.
const ROLES_CONNUS = ['comptabilite', 'relance', 'direction', 'terrain', 'autre']

// Même normalisation que la relance automatique : sans casse ni accent.
// « Relance » et « Comptabilité » sont donc reconnus, et n'apparaissent pas.
function normaliserRole(r: string | null | undefined): string {
  return (r ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Un client dont la fiche est incomplete. Trois manques, de gravites
 * differentes, et c'est pour ca qu'ils ne portent pas la meme couleur :
 *
 *   sansContact    BLOQUANT. Aucune adresse e-mail : ni relance manuelle ni
 *                  robot ne peuvent l'atteindre. L'argent est hors de portee.
 *   sansSiret      Pas de veille BODACC possible. Une procedure collective
 *                  passerait inapercue, et on continuerait a relancer un client
 *                  en liquidation.
 *   sansCommercial Personne ne porte le dossier, et le client echappe au filtre
 *                  par commercial du compte client.
 */
export interface ClientInjoignable {
  code_dso: string
  nom: string
  encours: number
  nb_impayees: number
  sansContact: boolean
  sansSiret: boolean
  sansCommercial: boolean
}

export type ProblemeContact = 'rebond' | 'role_non_reconnu'

export interface ContactAProbleme {
  id: string
  code_client: string
  nom_client: string
  identite: string
  email: string
  role_contact: string
  encours_client: number
  probleme: ProblemeContact
  detail: string
}

interface RowContact { id: string; code_client: string; nom: string; prenom: string | null; email: string; role_contact: string }
interface RowRebond  { code_client: string; contact_email: string | null; envoye_le: string }

// Supabase plafonne une réponse à 1000 lignes. Sans pagination explicite, la
// liste serait tronquée en silence — et un écran de diagnostic qui sous-compte
// est pire que pas d'écran du tout.
const PAGE = 1000
async function toutCharger<T>(
  requete: (de: number, a: number) => PromiseLike<{ data: unknown }>
): Promise<T[]> {
  const acc: T[] = []
  let offset = 0
  for (;;) {
    const { data } = await requete(offset, offset + PAGE - 1)
    const lot = (data ?? []) as T[]
    acc.push(...lot)
    if (lot.length < PAGE) break
    offset += PAGE
  }
  return acc
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR')
}

export function useNettoyage() {
  const { clients: clientsApp, chargement: chargementApp } = useAppData()

  const [contactsBruts, setContactsBruts] = useState<RowContact[] | null>(null)
  const [rebonds, setRebonds] = useState<RowRebond[]>([])
  const [chargementLocal, setChargementLocal] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setChargementLocal(true)
    setErreur(null)
    try {
      const [lignesContacts, lignesRebonds] = await Promise.all([
        toutCharger<RowContact>((de, a) =>
          supabase.from('contacts_client')
            .select('id, code_client, nom, prenom, email, role_contact')
            .eq('actif', true).range(de, a)
        ),
        // Le drapeau relance_auto_alerte se lève à un rebond et se baisse dès
        // que quelqu'un corrige. L'historique, lui, reste : c'est lui qui dit
        // qu'une adresse a déjà échoué, même si le drapeau est retombé.
        toutCharger<RowRebond>((de, a) =>
          supabase.from('relances_auto_log')
            .select('code_client, contact_email, envoye_le')
            .eq('statut', 'bounce').range(de, a)
        ),
      ])
      setContactsBruts(lignesContacts)
      setRebonds(lignesRebonds)
    } catch (err) {
      console.error('[useNettoyage]', err)
      setErreur(err instanceof Error ? err.message : 'Chargement impossible.')
      setContactsBruts([])
      setRebonds([])
    } finally {
      setChargementLocal(false)
    }
  }, [])

  // Une seule fois par session : contactsBruts reste en mémoire tant que
  // l'application tourne, donc revenir sur l'écran est instantané.
  useEffect(() => { if (contactsBruts === null) charger() }, [contactsBruts, charger])

  const clients = useMemo<ClientInjoignable[]>(() => {
    if (!contactsBruts) return []
    const avecAdresse = new Set(
      contactsBruts.filter(c => (c.email ?? '').trim() !== '').map(c => c.code_client)
    )
    return clientsApp
      // Sans encours, il n'y a rien à recouvrer : le client n'a pas à figurer
      // dans une file de travail. Cette borne vaut pour les trois manques.
      .filter(c => c.encours_total > 0.005)
      .map(c => ({
        code_dso:       c.code_dso,
        nom:            c.nom,
        encours:        c.encours_total,
        nb_impayees:    c.nb_impayees,
        sansContact:    !avecAdresse.has(c.code_dso),
        sansSiret:      (c.siret ?? '').trim() === '',
        // commercial_id est la reference fiable ; commercial est un libelle
        // texte hérité des imports. Un client n'est rattaché que si l'un des
        // deux est renseigné.
        sansCommercial: !c.commercial_id && (c.commercial ?? '').trim() === '',
      }))
      // Un client dont la fiche est complète n'a rien à faire dans un module
      // qui s'appelle Nettoyage.
      .filter(c => c.sansContact || c.sansSiret || c.sansCommercial)
      .sort((a, b) => b.encours - a.encours)
  }, [clientsApp, contactsBruts])

  const contacts = useMemo<ContactAProbleme[]>(() => {
    if (!contactsBruts) return []
    const parCode = new Map(clientsApp.map(c => [c.code_dso, c]))

    // Dernier rebond par adresse, et par client quand l'adresse n'est pas tracée.
    const rebondParEmail = new Map<string, string>()
    const rebondParClient = new Map<string, string>()
    for (const r of rebonds) {
      const mail = (r.contact_email ?? '').trim().toLowerCase()
      if (mail && (!rebondParEmail.get(mail) || r.envoye_le > rebondParEmail.get(mail)!)) rebondParEmail.set(mail, r.envoye_le)
      if (!rebondParClient.get(r.code_client) || r.envoye_le > rebondParClient.get(r.code_client)!) rebondParClient.set(r.code_client, r.envoye_le)
    }

    const out: ContactAProbleme[] = []
    for (const ct of contactsBruts) {
      const cl = parCode.get(ct.code_client)
      const mail = (ct.email ?? '').trim().toLowerCase()
      const dateRebond = rebondParEmail.get(mail)
        ?? (cl?.relance_auto_alerte ? rebondParClient.get(ct.code_client) : undefined)

      let probleme: ProblemeContact | null = null
      let detail = ''
      if (dateRebond) {
        probleme = 'rebond'
        detail = `Rebond le ${fmtDate(dateRebond)}`
      } else if (cl?.relance_auto_alerte) {
        probleme = 'rebond'
        detail = 'Alerte de contact active'
      } else if (!ROLES_CONNUS.includes(normaliserRole(ct.role_contact))) {
        probleme = 'role_non_reconnu'
        detail = `Rôle « ${ct.role_contact || '—'} » non reconnu`
      }
      if (!probleme) continue

      out.push({
        id: ct.id,
        code_client: ct.code_client,
        nom_client: cl?.nom ?? ct.code_client,
        identite: [ct.prenom, ct.nom].filter(Boolean).join(' ') || '—',
        email: ct.email,
        role_contact: ct.role_contact,
        encours_client: cl?.encours_total ?? 0,
        probleme,
        detail,
      })
    }
    return out.sort((a, b) => b.encours_client - a.encours_client)
  }, [clientsApp, contactsBruts, rebonds])

  const encoursInjoignable = useMemo(
    // sansContact UNIQUEMENT : ce chiffre dit l'argent qu'on ne peut pas aller
    // chercher. Un SIRET manquant est une lacune, pas une impossibilite.
    () => clients.filter(c => c.sansContact).reduce((s, c) => s + c.encours, 0),
    [clients]
  )

  const nbContactsActifs = contactsBruts?.length ?? 0

  return {
    clients,
    contacts,
    chargement: chargementApp || chargementLocal || contactsBruts === null,
    erreur,
    charger,
    encoursInjoignable,
    nbContactsActifs,
  }
}
