// Listes de référence gérées par l'admin (commercial, opérateur, plateforme)
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

type Categorie = 'commercial' | 'operateur' | 'plateforme' | 'format_facture'

// Capitalise chaque mot, trim et normalise les espaces multiples
export function normaliserValeurRef(v: string): string {
  return v
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '')
    .join(' ')
}

interface RowRef { valeur: string }

export function useRefValeurs(categorie: Categorie) {
  const [valeurs, setValeurs] = useState<string[]>([])
  const [chargement, setChargement] = useState(false)

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('ref_valeurs')
      .select('valeur')
      .eq('categorie', categorie)
      .eq('actif', true)
      .order('ordre', { ascending: true })
      .order('valeur', { ascending: true })
    setValeurs((data as unknown as RowRef[] | null)?.map(r => r.valeur) ?? [])
  }, [categorie])

  useEffect(() => { charger() }, [charger])

  async function ajouter(valeur: string): Promise<boolean> {
    const v = normaliserValeurRef(valeur)
    if (!v) return false
    setChargement(true)
    const { error } = await supabase
      .from('ref_valeurs')
      .insert({ categorie, valeur: v } as never)
    setChargement(false)
    if (error) { toast.error('Valeur déjà existante ou erreur.'); return false }
    await charger()
    return true
  }

  async function desactiver(valeur: string): Promise<boolean> {
    setChargement(true)
    const { error } = await supabase
      .from('ref_valeurs')
      .update({ actif: false } as never)
      .eq('categorie', categorie)
      .eq('valeur', valeur)
    setChargement(false)
    if (error) { toast.error(error.message); return false }
    await charger()
    return true
  }

  return { valeurs, chargement, ajouter, desactiver, rafraichir: charger }
}
