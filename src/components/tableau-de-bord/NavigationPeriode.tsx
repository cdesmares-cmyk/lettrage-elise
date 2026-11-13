// Les deux fleches qui font reculer la fenetre d'un graphique dans le passe.
//
// POURQUOI UN COMPOSANT. Trois graphiques du tableau de bord les portent :
// l'activite de recouvrement, les encaissements, et leur anciennete. Ecrire le
// meme balisage trois fois, c'est se garantir que l'un des trois divergera le
// jour ou on touchera a l'autre.
//
// UN CRAN = UNE UNITE DE LA PERIODE AFFICHEE. Un jour en vue « 7 jours », une
// semaine en « 12 sem. », un mois en « 12 mois ». Le calcul vit dans
// useDashboard, ce composant ne fait qu'appeler.

interface PropsNavigation {
  decalage: number
  /** Borne a gauche : au-dela, les donnees ne sont plus chargees. */
  decalageMax: number
  onReculer: () => void
  onAvancer: () => void
}

export function NavigationPeriode({ decalage, decalageMax, onReculer, onAvancer }: PropsNavigation) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={onReculer}
        disabled={decalage >= decalageMax}
        title="Période précédente"
        className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:border-ockham-teal hover:text-ockham-teal disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        onClick={onAvancer}
        disabled={decalage === 0}
        title="Période suivante"
        className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:border-ockham-teal hover:text-ockham-teal disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  )
}

/**
 * Le rappel qu'on ne regarde plus la periode en cours.
 *
 * Sans lui, on recule de six mois, on oublie, et on lit des chiffres anciens en
 * croyant regarder la semaine en cours. Le retour est colle a l'avertissement :
 * voir le probleme et le corriger au meme endroit.
 *
 * Il s'affiche sur CHAQUE graphique concerne, meme quand un seul porte les
 * fleches : les encaissements et leur anciennete partagent un decalage mais
 * sont deux blocs distincts, et celui du bas peut etre lu seul apres un
 * defilement.
 */
export function BadgeHistorique({ onRetour }: { onRetour: () => void }) {
  return (
    <button
      onClick={onRetour}
      title="Revenir à la période en cours"
      className="inline-flex items-center gap-1 text-[10px] font-bold text-ockham-copper bg-ockham-copper/10 border border-ockham-copper/30 px-2 py-0.5 rounded-full hover:bg-ockham-copper/20 transition-colors cursor-pointer whitespace-nowrap"
    >
      Historique · revenir à aujourd'hui
    </button>
  )
}
