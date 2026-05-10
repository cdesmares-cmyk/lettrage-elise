import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface LigneHistorique {
  id: string
  created_at: string
  date_lettrage: string
  id_ligne_bancaire: string | null
  libelle_bancaire: string | null
  code_client: string
  numero_facture: string
  montant: number
  mode: string
  commentaire: string | null
  operateur: string | null
}

export function useHistoriqueLettrage() {
  const [lignes, setLignes] = useState<LigneHistorique[]>([])
  const [chargement, setChargement] = useState(false)
  const [visible, setVisible] = useState(false)

  const charger = useCallback(async () => {
    setChargement(true)
    const { data, error } = await supabase
      .from('lettrages')
      .select('id, created_at, date_lettrage, id_ligne_bancaire, code_client, numero_facture, montant, mode, commentaire, operateur, lignes_bancaires(libelle)')
      .order('created_at', { ascending: false })
      .limit(500)

    if (!error && data) {
      setLignes(data.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        created_at: r.created_at as string,
        date_lettrage: r.date_lettrage as string,
        id_ligne_bancaire: r.id_ligne_bancaire as string | null,
        libelle_bancaire: (r.lignes_bancaires as { libelle: string } | null)?.libelle ?? null,
        code_client: r.code_client as string,
        numero_facture: r.numero_facture as string,
        montant: r.montant as number,
        mode: r.mode as string,
        commentaire: r.commentaire as string | null,
        operateur: r.operateur as string | null,
      })))
    }
    setChargement(false)
  }, [])

  function toggle() {
    if (!visible) charger()
    setVisible(v => !v)
  }

  return { lignes, chargement, visible, toggle, charger }
}
