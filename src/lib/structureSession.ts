// Memoire de session du choix de structure.
//
// Marqueur de SESSION, pas de navigateur : il disparait a la fermeture de
// l'onglet. C'est ce qui fait reapparaitre le portail a chaque connexion sans
// le reimposer a chaque navigation interne.
//
// Le choix lui-meme ne vit pas ici — il vit en base, dans
// utilisateurs.organisation_active_id. Ce fichier ne retient que « l'utilisateur
// a deja choisi pendant cette session », une information d'affichage sans
// aucune portee sur le cloisonnement.

const CLE = 'ockham:structure-choisie'

/** Vrai si une structure a deja ete choisie dans cette session.
 *
 *  En cas d'echec de lecture — navigation privee, stockage bloque — on repond
 *  faux : le portail s'affiche. C'est le cote prudent, celui qui redemande
 *  plutot que celui qui suppose. */
export function structureChoisieCetteSession(): boolean {
  try { return sessionStorage.getItem(CLE) !== null } catch { return false }
}

export function marquerStructureChoisie(organisationId: string): void {
  try { sessionStorage.setItem(CLE, organisationId) } catch { /* stockage indisponible */ }
}
