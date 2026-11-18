// Seuil de re-relance, partagé entre le bouton de la liste et le modal.
//
// QUINZE JOURS, ET NON LES TRENTE DU ROBOT. Mesure du 2026-11-18 sur SAS
// MELEZE, sur les relances externes uniquement :
//
//   jour 0        66
//   jour 1         8
//   jours 2 à 7   16
//   jours 8 à 14  19
//   jours 15 à 30 129
//   plus de 30 j  266
//
// À 30 jours, l'avertissement se déclencherait sur une re-relance sur deux —
// et une alerte qui sonne une fois sur deux n'est plus lue. À 15 jours il
// couvre 109 cas, dont les 66 du jour même qui sont le vrai sujet : sur 1 325
// relances externes, une sur vingt est un doublon du jour.
//
// Le robot garde son propre délai (`delai_rerelance_jours`, 30 par défaut,
// réglable dans Admin → Mode auto). Les deux nombres ne disent pas la même
// chose : le robot décide seul et doit être plus prudent, l'opérateur voit son
// client et peut juger.
export const SEUIL_RERELANCE_JOURS = 15

/**
 * Le message à montrer, ou null s'il n'y a rien à signaler.
 *
 * Deux niveaux, parce que « déjà relancé aujourd'hui » et « relancé il y a
 * douze jours » n'ont pas la même gravité : le premier est presque toujours un
 * doublon, le second peut être un choix.
 */
export function alerteRerelance(jours: number | null | undefined): 'meme_jour' | 'recente' | null {
  if (jours == null || jours >= SEUIL_RERELANCE_JOURS) return null
  return jours === 0 ? 'meme_jour' : 'recente'
}
