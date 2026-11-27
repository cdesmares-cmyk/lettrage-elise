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
