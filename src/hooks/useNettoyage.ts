// Hook du module Nettoyage — diagnostic de joignabilité.
//
// Lecture seule, par construction : il montre ce qui manque et ce que ça pèse,
// il ne corrige rien. La correction se fait dans le compte client, où les
// contacts vivent déjà. Deux endroits pour éditer, ce serait deux vérités.
//
// Mesure du 2026-10-31 qui a motivé ce module : 13,7 M€ d'encours chez Elise
// Lyon derrière 3675 clients sans aucune adresse, et 1357 contacts sur 2504
// écartés de la relance automatique pour une majuscule.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Les cinq rôles que l'écran de saisie propose. Tout le reste vient d'un import
// et doit être rangé à la main.
const ROLES_CONNUS = ['comptabilite', 'relance', 'direction', 'terrain', 'autre']

// Même normalisation que la relance automatique : sans casse ni accent.
// « Relance » et « Comptabilité » sont donc reconnus.
function normaliserRole(r: string | null | undefined): string {
  return (r ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export interface ClientInjoignable {
  code_dso: string
  nom: string
  encours: number
  nb_impayees: number
}

export type ProblemeContact = 'role_non_reconnu' | 'rebond'

export interface ContactAProbleme {
  id: string
  code_client: string
  nom_client: string
  identite: string
  email: string
  role_contact: string
  encours_client: number
  probleme: ProblemeContact
}

interface RowClient  { code_dso: string; nom: string; relance_auto_alerte: boolean }
interface RowEncours { code_dso: string; encours_total: number; nb_impayees: number }
interface RowContact { id: string; code_client: string; nom: string; prenom: string | null; email: string; role_contact: string }

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

export function useNettoyage() {
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [clients, setClients] = useState<ClientInjoignable[]>([])
  const [contacts, setContacts] = useState<ContactAProbleme[]>([])

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur(null)
    try {
      const [lignesClients, lignesEncours, lignesContacts] = await Promise.all([
        toutCharger<RowClient>((de, a) =>
          supabase.from('clients').select('code_dso, nom, relance_auto_alerte').range(de, a)
        ),
        toutCharger<RowEncours>((de, a) =>
          supabase.from('v_comptes_clients').select('code_dso, encours_total, nb_impayees').range(de, a)
        ),
        toutCharger<RowContact>((de, a) =>
          supabase.from('contacts_client')
            .select('id, code_client, nom, prenom, email, role_contact')
            .eq('actif', true).range(de, a)
        ),
      ])

      const encoursParClient = new Map(lignesEncours.map(e => [e.code_dso, e]))
      const nomParClient     = new Map(lignesClients.map(c => [c.code_dso, c.nom]))

      // Un client est joignable s'il a au moins un contact actif avec une
      // adresse. Le rôle n'entre pas en compte ici : une adresse mal rangée
      // reste utilisable à la main, c'est le sujet de l'autre onglet.
      const clientsAvecAdresse = new Set(
        lignesContacts.filter(c => (c.email ?? '').trim() !== '').map(c => c.code_client)
      )

      const injoignables: ClientInjoignable[] = []
      for (const c of lignesClients) {
        if (clientsAvecAdresse.has(c.code_dso)) continue
        const e = encoursParClient.get(c.code_dso)
        // Sans encours, il n'y a rien à recouvrer : le client n'a pas à figurer
        // dans une file de travail.
        if (!e || e.encours_total <= 0.005) continue
        injoignables.push({
          code_dso: c.code_dso,
          nom: c.nom,
          encours: e.encours_total,
          nb_impayees: e.nb_impayees ?? 0,
        })
      }
      injoignables.sort((a, b) => b.encours - a.encours)

      const clientsEnRebond = new Set(
        lignesClients.filter(c => c.relance_auto_alerte).map(c => c.code_dso)
      )

      const aProbleme: ContactAProbleme[] = []
      for (const ct of lignesContacts) {
        const probleme: ProblemeContact | null =
          clientsEnRebond.has(ct.code_client)              ? 'rebond'
          : !ROLES_CONNUS.includes(normaliserRole(ct.role_contact)) ? 'role_non_reconnu'
          : null
        if (!probleme) continue
        aProbleme.push({
          id: ct.id,
          code_client: ct.code_client,
          nom_client: nomParClient.get(ct.code_client) ?? ct.code_client,
          identite: [ct.prenom, ct.nom].filter(Boolean).join(' ') || '—',
          email: ct.email,
          role_contact: ct.role_contact,
          encours_client: encoursParClient.get(ct.code_client)?.encours_total ?? 0,
          probleme,
        })
      }
      aProbleme.sort((a, b) => b.encours_client - a.encours_client)

      setClients(injoignables)
      setContacts(aProbleme)
    } catch (err) {
      console.error('[useNettoyage]', err)
      setErreur(err instanceof Error ? err.message : 'Chargement impossible.')
      setClients([])
      setContacts([])
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => { charger() }, [charger])

  const encoursInjoignable = clients.reduce((s, c) => s + c.encours, 0)

  return { clients, contacts, chargement, erreur, charger, encoursInjoignable }
}
