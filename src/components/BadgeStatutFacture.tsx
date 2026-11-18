// Badge et menu de statut de facture, partagés par tous les écrans.
//
// Avant ce fichier, le badge était réécrit dans la liste des factures, le
// détail de relance et l'envoi auto — trois fois le même rendu, avec des
// couleurs recopiées et des icônes différentes. Le libellé l'était cinq fois.
// Tout vient maintenant de STATUTS_FACTURE.
import type { StatutFacture } from '../types/client'
import { STATUTS_FACTURE, definitionStatut } from '../lib/statutsFacture'

const BASE = 'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap transition-colors'
const VIDE = 'border-dashed border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600 font-medium'

interface BadgeProps {
  statut: StatutFacture | null
  /** Affiche « Payée » à la place du statut. Une facture soldée n'a plus de statut à poser. */
  estSolde?: boolean
  /** Absent : badge en lecture seule, sans curseur ni interaction. */
  onClick?: (e: React.MouseEvent) => void
  /** Les modals rendent un bouton, les tableaux un span. Défaut : span. */
  as?: 'span' | 'button'
  className?: string
}

export function BadgeStatutFacture({ statut, estSolde, onClick, as = 'span', className = '' }: BadgeProps) {
  if (estSolde) {
    return (
      <span className={`${BASE} bg-emerald-100 text-emerald-700 border-emerald-200 ${className}`}>
        ✓ Payée
      </span>
    )
  }

  const def = definitionStatut(statut)
  const cls = `${BASE} ${def ? def.classes : VIDE} ${onClick ? 'cursor-pointer' : ''} ${className}`
  const contenu = def
    ? <><def.Icone size={11} className="flex-shrink-0" /> {def.libelle}</>
    : <>Statut</>

  return as === 'button'
    ? <button onClick={onClick} className={cls}>{contenu}</button>
    : <span onClick={onClick} className={cls}>{contenu}</span>
}

/**
 * Les choix du menu de statut : les statuts, puis le retrait.
 *
 * Seule la liste est partagée, pas le positionnement : chaque écran ouvre son
 * popup à sa façon, et uniformiser ça aurait demandé de reprendre trois
 * mécaniques de placement pour un gain nul.
 */
export function OptionsStatutFacture({ onChoisir }: { onChoisir: (v: StatutFacture | null) => void }) {
  return (
    <>
      {STATUTS_FACTURE.map(s => (
        <button
          key={s.valeur}
          onClick={() => onChoisir(s.valeur)}
          className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-gray-50 transition-colors text-gray-700 flex items-center gap-2 cursor-pointer"
        >
          <s.Icone size={12} className="flex-shrink-0 text-gray-400" />
          {s.libelle}
        </button>
      ))}
      <button
        onClick={() => onChoisir(null)}
        className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-gray-50 transition-colors text-gray-500 cursor-pointer"
      >
        ✕ Retirer le statut
      </button>
    </>
  )
}
