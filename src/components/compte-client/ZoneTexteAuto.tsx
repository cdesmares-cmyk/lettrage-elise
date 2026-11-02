// Zone de texte qui s'allonge a la frappe, sans ascenseur.
//
// POURQUOI. Un commentaire d'appel fait trois mots ou quinze lignes, on ne
// sait pas a l'avance. Une hauteur fixe donne soit du vide, soit un ascenseur
// qui apparait des la deuxieme ligne et cache ce qu'on vient d'ecrire.
//
// Elle grandit jusqu'a MAX_LIGNES, puis se fige et l'ascenseur prend le relais.
// Sans ce plafond, un texte long pousserait le bouton Enregistrer hors de
// l'ecran dans un panneau lateral deja etroit.
import { useRef, useLayoutEffect } from 'react'

const MAX_LIGNES = 10
const MIN_LIGNES = 2
// Hauteur de ligne posee en dur, et pas heritee du CSS : le calcul de hauteur
// doit etre deterministe. Si leading-* changeait dans la feuille de style, le
// plafond ne vaudrait plus dix lignes et personne ne s'en apercevrait.
const HAUTEUR_LIGNE = 16
const PADDING_V = 12

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}

export function ZoneTexteAuto({ value, onChange, placeholder, className = '' }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // useLayoutEffect et non useEffect : la hauteur est recalculee avant que le
  // navigateur peigne. Avec useEffect la zone sauterait d'une taille a l'autre
  // de facon visible a chaque frappe.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Remise a zero obligatoire avant la mesure : scrollHeight ne redescend
    // jamais tout seul quand on efface du texte.
    el.style.height = 'auto'
    const mini = MIN_LIGNES * HAUTEUR_LIGNE + PADDING_V
    const maxi = MAX_LIGNES * HAUTEUR_LIGNE + PADDING_V
    const voulue = Math.max(mini, Math.min(el.scrollHeight, maxi))
    el.style.height = `${voulue}px`
    el.style.overflowY = el.scrollHeight > maxi ? 'auto' : 'hidden'
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={MIN_LIGNES}
      style={{ lineHeight: `${HAUTEUR_LIGNE}px`, overflowY: 'hidden' }}
      className={`w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-ockham-teal resize-none ${className}`}
    />
  )
}
