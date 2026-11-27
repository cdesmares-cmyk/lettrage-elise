// Le compte d'attente 471, et ses deux valeurs stockées.
//
// CE QU'EST LE 471. Un crédit bancaire qui n'a structurellement aucun client
// en face : une aide publique, un remboursement de sécurité sociale, un
// remboursement fournisseur pour trop-payé. On le loge en compte d'attente
// plutôt que de l'imputer à un client qui n'y est pour rien.
//
// POURQUOI DEUX VALEURS. Le même concept est écrit différemment selon l'écran
// de saisie :
//
//     Panneau de lettrage, « 471 - Autres »   ->  '471'
//     Modale Remises chèque/LCR, « Autres »   ->  'AUTRES'
//     Panneau Dispatch 411, « Autres »        ->  'AUTRES'
//
// Ce n'est pas une distinction voulue. Dans useLettrageForm, les classes
// 'autres' et '471' sont traitées à l'identique sur toutes les lignes —
// numero_facture à NULL, montant par défaut, commentaire libre — SAUF
// précisément sur celle qui assigne code_client.
//
// CE QUE ÇA A CASSÉ, trouvé le 2026-11-27 : l'onglet Cadrage de l'export ne
// testait que 'AUTRES'. Les 471 du parcours quotidien n'apparaissaient donc
// jamais dans la colonne « dont Autres (471) » — et, pire, tombaient dans le
// total lettré client. Un remboursement fournisseur ressemblait à un
// encaissement client soldé. Symétriquement, les vues SQL ne testaient que
// '471' et comptaient les lignes 'AUTRES' comme des encaissements clients.
//
// LA RÈGLE, décidée avec Clément le 2026-11-27 :
//   - on LIT les deux valeurs, pour que l'historique reste juste
//   - on n'ÉCRIT plus que '471'
//   - on ne migre PAS les données : des fichiers déjà remis à
//     l'expert-comptable portent 'AUTRES', et le ré-téléchargement les
//     régénère depuis la base. Normaliser réécrirait un document transmis.
//
// L'équivalent SQL de cette liste vit dans la migration 196. Les deux doivent
// rester d'accord.

/** La valeur écrite pour toute nouvelle affectation en compte d'attente. */
export const CODE_471 = '471'

/**
 * Valeur historique, écrite par les remises et les dispatches jusqu'au
 * 2026-11-27. EN LECTURE SEULE : ne jamais l'écrire dans un nouvel
 * enregistrement.
 */
export const CODE_471_HISTORIQUE = 'AUTRES'

/** Libellé unique à l'écran, quel que soit le parcours de saisie. */
export const LIBELLE_471 = '471_Autres'

/**
 * Ce lettrage loge-t-il un crédit en compte d'attente ?
 *
 * À utiliser partout où l'on compte, totalise ou exclut le 471 — jamais un
 * test en dur sur l'une des deux valeurs, qui serait aveugle à la moitié des
 * données.
 */
export function estCompte471(codeClient: string | null | undefined): boolean {
  return codeClient === CODE_471 || codeClient === CODE_471_HISTORIQUE
}
