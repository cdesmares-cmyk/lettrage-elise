// Le filtre de pilotage, et sa persistance.
//
// DEUX MECANISMES, DEUX BESOINS DIFFERENTS.
//
//   localStorage  — le filtre survit a la navigation, au F5 et a la fermeture
//                   du navigateur. C'est ce que Clement a demande : garder un
//                   profil de filtre « quelques semaines ».
//   l'URL         — le filtre devient PARTAGEABLE. Un lien envoye a un collegue
//                   ouvre la meme liste de travail.
//
// L'URL gagne sur localStorage au chargement : si quelqu'un ouvre un lien
// filtre, c'est ce lien qu'il veut voir, pas son propre filtre de la veille.
//
// POURQUOI PAS UN COMPOSANT PARENT OU UN CONTEXTE. PageCompteClient est
// demontee des qu'on va sur Lettrage. Un etat local y serait perdu a chaque
// aller-retour dans le menu, ce qui est exactement ce qu'il fallait eviter.
//
// POURQUOI localStorage EST ACCEPTABLE ICI, alors qu'il est ecarte pour mettre
// les factures en cache : on y ecrit quelques centaines d'octets, pas 3 Mo. Son
// defaut est d'etre synchrone, ce qui ne se voit pas sur un objet de cette
// taille, et le quota n'est pas un sujet.
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FILTRE_VIDE,
  filtreDepuisParams,
  filtreVersParams,
  type FiltrePilotage,
} from '../lib/pilotageRelances'

// La cle porte l'organisation. Sans ca, un operateur qui bascule de structure
// retrouverait le filtre de l'autre, avec des references a des commerciaux et
// des montants qui n'ont aucun sens dans son nouveau contexte.
function cleStockage(organisationId: string | null | undefined): string {
  return `ockham.filtre-pilotage.${organisationId ?? 'inconnu'}`
}

function lireStockage(cle: string): FiltrePilotage | null {
  try {
    const brut = localStorage.getItem(cle)
    if (!brut) return null
    const parse = JSON.parse(brut) as Partial<FiltrePilotage>
    // Fusion avec le filtre vide : une version anterieure du filtre, sauvegardee
    // avant l'ajout d'un critere, ne doit pas laisser un champ a undefined.
    return {
      ...FILTRE_VIDE,
      ...parse,
      niveaux: Array.isArray(parse.niveaux) ? parse.niveaux.filter(n => typeof n === 'number') : [],
    }
  } catch {
    // Mode navigation privee, stockage bloque, JSON corrompu : on repart du
    // filtre vide plutot que de casser l'ecran.
    return null
  }
}

export function useFiltrePilotage(organisationId: string | null | undefined) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filtre, setFiltreBrut] = useState<FiltrePilotage>(FILTRE_VIDE)
  // L'initialisation ne doit se faire qu'une fois : sans ce verrou, chaque
  // changement d'URL fait par un autre code reinitialiserait le filtre.
  const initialise = useRef(false)

  useEffect(() => {
    if (initialise.current || !organisationId) return
    initialise.current = true
    const depuisUrl = filtreDepuisParams(k => searchParams.get(k))
    setFiltreBrut(depuisUrl ?? lireStockage(cleStockage(organisationId)) ?? FILTRE_VIDE)
    // searchParams volontairement absent des dependances : on ne lit l'URL
    // qu'au premier rendu, ensuite c'est nous qui l'ecrivons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisationId])

  const setFiltre = useCallback((maj: FiltrePilotage | ((f: FiltrePilotage) => FiltrePilotage)) => {
    setFiltreBrut(prev => {
      const suivant = typeof maj === 'function' ? maj(prev) : maj
      if (organisationId) {
        try {
          localStorage.setItem(cleStockage(organisationId), JSON.stringify(suivant))
        } catch {
          // Stockage indisponible : le filtre marche quand meme, il ne survit
          // juste pas au rechargement. Pas de quoi alerter l'utilisateur.
        }
      }
      // L'URL est reecrite en conservant les parametres des autres
      // fonctionnalites (?client=, ?onglet=, ?facture=).
      setSearchParams(prevParams => {
        const p = new URLSearchParams(prevParams)
        for (const k of ['niv', 'jam', 'jrel', 'nbf', 'enc', 'de', 'df', 'exg']) p.delete(k)
        for (const [k, v] of Object.entries(filtreVersParams(suivant))) p.set(k, v)
        return p
      }, { replace: true })
      return suivant
    })
  }, [organisationId, setSearchParams])

  const reinitialiser = useCallback(() => setFiltre(FILTRE_VIDE), [setFiltre])

  return { filtre, setFiltre, reinitialiser }
}
