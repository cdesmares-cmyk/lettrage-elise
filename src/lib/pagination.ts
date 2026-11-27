// Lecture complète d'une table malgré le plafond de lignes de PostgREST.
//
// POURQUOI CE FICHIER EXISTE. PostgREST tronque toute requête sans borne à
// `db-max-rows`, fixé à 1000 sur ce projet. Il le fait EN SILENCE : pas
// d'erreur, pas d'en-tête d'avertissement exploitable côté client, juste mille
// lignes au lieu de trois mille. Un compteur affiche alors un chiffre rond,
// une somme est sous-estimée, et rien ne signale que la réponse est partielle.
//
// Ce piège a déjà mordu deux fois sur ce dépôt : sur la lecture des clients
// par le robot de relance, et sur l'aperçu de l'export comptable, qui
// annonçait « 1000 lignes » et un montant amputé juste avant un verrouillage
// irréversible.
//
// Cette fonction était écrite deux fois, dans exportLettrageXls.ts et dans
// SectionExport.tsx. Deux copies d'un contournement, c'est deux occasions de
// corriger l'une sans l'autre.

const PAGE = 1000

/**
 * Rapatrie toutes les pages d'une requête, par tranches de 1000.
 *
 * LA REQUÊTE DOIT PORTER UN TRI TOTALEMENT ORDONNÉ, c'est-à-dire se terminer
 * par une colonne unique — en pratique `.order('id')`. Sans elle, PostgreSQL
 * ne garantit aucun ordre entre deux appels : deux lignes de même date peuvent
 * s'échanger d'une page à l'autre, et on obtient alors un doublon d'un côté et
 * une ligne manquante de l'autre. Le bug est rare, silencieux, et il fausse
 * des montants comptables — exactement ce qu'on ne veut pas découvrir dans un
 * fichier déjà remis à un expert-comptable.
 *
 * `buildQuery` reçoit les bornes inclusives à passer à `.range(from, to)`.
 */
export async function fetchAll<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown; error?: unknown }>
): Promise<T[]> {
  const acc: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await buildQuery(offset, offset + PAGE - 1)
    // Sans ce relais, une erreur au milieu de la pagination rendrait un
    // résultat tronqué qu'on prendrait pour complet : le pire des deux.
    if (error) throw error
    const rows = (data ?? []) as T[]
    acc.push(...rows)
    if (rows.length < PAGE) return acc
    offset += PAGE
  }
}

/**
 * Budget d'identifiants, en caractères, pour un seul filtre `.in()`.
 *
 * MESURÉ le 2026-11-27 contre l'API du projet, et non deviné :
 *
 *   600 identifiants  ~22 000 caractères d'URL  ->  HTTP 200
 *   800 identifiants  ~29 700 caractères d'URL  ->  HTTP 400 Bad Request
 *
 * supabase-js envoie les `select()` en GET : la liste passe donc dans l'URL,
 * et la passerelle la refuse au-delà d'environ 24 Ko. 8 000 caractères laissent
 * un facteur trois de marge, y compris si un identifiant s'allonge.
 */
const BUDGET_FILTRE_IN = 8000

/**
 * Découpe une liste d'identifiants en lots tenant dans une URL.
 *
 * Découpé PAR LONGUEUR et non par nombre : `id_operation` est du texte libre,
 * pas un UUID de taille fixe. Compter les éléments marcherait aujourd'hui et
 * casserait le jour où une banque produit des références plus longues.
 */
export function lotsPourFiltreIn(ids: string[], budget = BUDGET_FILTRE_IN): string[][] {
  const lots: string[][] = []
  let courant: string[] = []
  let longueur = 0
  for (const id of ids) {
    // +1 pour la virgule de séparation.
    if (courant.length && longueur + id.length + 1 > budget) {
      lots.push(courant)
      courant = []
      longueur = 0
    }
    courant.push(id)
    longueur += id.length + 1
  }
  if (courant.length) lots.push(courant)
  return lots
}

/**
 * Comme `fetchAll`, mais pour une requête filtrée par une longue liste d'`id`.
 *
 * POURQUOI. Un filtre `.in()` portant des milliers d'identifiants produit une
 * URL que la passerelle refuse en 400. Jusqu'au 2026-11-27 cette erreur était
 * AVALÉE par le helper de pagination : l'export rendait alors un fichier dont
 * la feuille « Affectation » était vide, sans rien signaler. Un fichier remis
 * à un expert-comptable, amputé de toutes ses affectations, et personne pour
 * le savoir.
 *
 * Chaque lot est paginé indépendamment ; les résultats sont concaténés.
 */
export async function fetchAllParLots<T>(
  ids: string[],
  buildQuery: (lot: string[], from: number, to: number) => PromiseLike<{ data: unknown; error?: unknown }>
): Promise<T[]> {
  if (!ids.length) return []
  const acc: T[] = []
  for (const lot of lotsPourFiltreIn(ids)) {
    acc.push(...await fetchAll<T>((from, to) => buildQuery(lot, from, to)))
  }
  return acc
}
