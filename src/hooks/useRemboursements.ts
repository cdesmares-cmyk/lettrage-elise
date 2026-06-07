import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export interface RemboursementLigneForm {
  _key: string
  numero_facture: string
  montant: string
  code_client: string
  info_facture: { montant_ttc: number; code_client: string; nom_client: string | null } | null
  chargement: boolean
}

export interface RemboursementEnAttente {
  id: string
  created_at: string
  lignes: { id: string; numero_facture: string; code_client: string; montant: number }[]
}

export function useRemboursements(onSuccess?: () => void) {
  const { utilisateur } = useAuth()
  const [enAttente, setEnAttente] = useState<RemboursementEnAttente[]>([])
  const [chargement, setChargement] = useState(false)

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('remboursements')
      .select('id, created_at, remboursement_lignes(id, numero_facture, code_client, montant)')
      .eq('statut', 'en_attente')
      .order('created_at', { ascending: false })

    setEnAttente(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((data ?? []) as any[]).map(r => ({
        id: r.id,
        created_at: r.created_at,
        lignes: r.remboursement_lignes ?? [],
      }))
    )
  }, [])

  async function declarer(lignes: { numero_facture: string; code_client: string; montant: number }[]) {
    setChargement(true)
    try {
      const { data: rembData, error: rembError } = await supabase
        .from('remboursements')
        .insert({ created_by: utilisateur?.id ?? null } as never)
        .select('id')
        .single()
      if (rembError) throw rembError

      const { error: lignesError } = await supabase
        .from('remboursement_lignes')
        .insert(lignes.map(l => ({ remboursement_id: (rembData as { id: string }).id, ...l })) as never)
      if (lignesError) throw lignesError

      await charger()
      onSuccess?.()
    } finally {
      setChargement(false)
    }
  }

  async function affecter(remboursementId: string, idLigneBancaire: string) {
    const { error } = await supabase
      .from('remboursements')
      .update({ id_ligne_bancaire: idLigneBancaire, statut: 'effectue' } as never)
      .eq('id', remboursementId)
    if (error) throw error
    await charger()
  }

  async function annuler(remboursementId: string) {
    const { error } = await supabase
      .from('remboursements')
      .delete()
      .eq('id', remboursementId)
    if (error) throw error
    await charger()
  }

  return { enAttente, chargement, charger, declarer, affecter, annuler }
}
