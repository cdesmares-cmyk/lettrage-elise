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
  export_id: string | null
  id_ligne_bancaire: string | null
  lignes: { id: string; numero_facture: string; code_client: string; montant: number }[]
}

export type RemboursementEffectue = RemboursementEnAttente

export function useRemboursements(onSuccess?: () => void) {
  const { utilisateur } = useAuth()
  const [enAttente, setEnAttente]   = useState<RemboursementEnAttente[]>([])
  const [effectues, setEffectues]   = useState<RemboursementEffectue[]>([])
  const [chargement, setChargement] = useState(false)

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('remboursements')
      .select('id, created_at, statut, export_id, id_ligne_bancaire, remboursement_lignes(id, numero_facture, code_client, montant)')
      .in('statut', ['en_attente', 'effectue'])
      .order('created_at', { ascending: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tous = ((data ?? []) as any[]).map(r => ({
      id:                r.id as string,
      created_at:        r.created_at as string,
      export_id:         r.export_id as string | null,
      id_ligne_bancaire: r.id_ligne_bancaire as string | null,
      lignes:            (r.remboursement_lignes ?? []) as { id: string; numero_facture: string; code_client: string; montant: number }[],
      statut:            r.statut as 'en_attente' | 'effectue',
    }))
    setEnAttente(tous.filter(r => r.statut === 'en_attente'))
    setEffectues(tous.filter(r => r.statut === 'effectue'))
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

  async function desaffecter(remboursementId: string) {
    const { data: check } = await supabase
      .from('remboursements')
      .select('export_id')
      .eq('id', remboursementId)
      .single()
    if ((check as { export_id: string | null } | null)?.export_id) {
      throw new Error('Ce remboursement a été exporté — désaffectation impossible')
    }
    const { error } = await supabase
      .from('remboursements')
      .update({ id_ligne_bancaire: null, statut: 'en_attente' } as never)
      .eq('id', remboursementId)
    if (error) throw error
    await charger()
  }

  async function annuler(remboursementId: string) {
    const { data: check } = await supabase
      .from('remboursements')
      .select('export_id')
      .eq('id', remboursementId)
      .single()
    if ((check as { export_id: string | null } | null)?.export_id) {
      throw new Error('Ce remboursement a été exporté — annulation impossible')
    }
    const { error } = await supabase
      .from('remboursements')
      .delete()
      .eq('id', remboursementId)
    if (error) throw error
    await charger()
  }

  return { enAttente, effectues, chargement, charger, declarer, affecter, desaffecter, annuler }
}
