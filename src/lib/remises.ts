// Logique partagée du module Remises Chèque / LCR.
//
// Ce fichier existe pour une seule raison : le libellé d'une ligne 471 est lu
// à deux endroits — le modal de saisie et le panneau d'encaissement. Deux
// copies du découpage finiraient par diverger, et la divergence serait
// silencieuse : un libellé affiché ici, tronqué là.

/**
 * Séparateur entre la référence de remise et le libellé saisi par l'opérateur.
 * Posé par les RPC creer_ et modifier_remise_atomique (migration 190), qui
 * écrivent « Remise CHQ n°X — libellé ».
 */
export const SEP_LIBELLE = ' — '

/**
 * Extrait le libellé d'une ligne « Autres (471) » depuis son commentaire.
 *
 * Le libellé n'a pas de colonne dédiée : il vit dans le commentaire, derrière
 * la référence de remise. On découpe sur le PREMIER séparateur et on garde
 * tout le reste — un libellé contenant lui-même un tiret cadratin ne doit pas
 * être tronqué à la réouverture.
 *
 * Renvoie une chaîne vide pour une ligne facture, dont le commentaire ne
 * porte que la référence de remise.
 */
export function libelleDepuisCommentaire(commentaire: string | null): string {
  if (!commentaire) return ''
  const i = commentaire.indexOf(SEP_LIBELLE)
  return i === -1 ? '' : commentaire.slice(i + SEP_LIBELLE.length)
}
