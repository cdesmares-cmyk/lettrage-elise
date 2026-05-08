// Chargement lazy des factures par client (ou groupe de clients)
import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { FactureDetail, HistoriqueLettrage, StatutFacture } from '../types/client'

type CacheMap = Map<string, FactureDetail[]>

function cleCache(codes: string[]) {
  return [...codes].sort().join(',')
}

export function useFacturesClient() {
  const [cache, setCache] = useState<CacheMap>(new Map())
  const [enCours, setEnCours] = useState<Set<string>>(new Set())

  const chargerFactures = useCallback(async (codes: string | string[]) => {
    const arr = Array.isArray(codes) ? codes : [codes]
    const cle = cleCache(arr)
    if (cache.has(cle) || enCours.has(cle)) return

    setEnCours(prev => new Set([...prev, cle]))
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select('numero_piece,code_client,nom_client,date_emission,date_echeance,montant_ht,montant_ttc,reste_du,statut_paiement,statut_facture,est_avoir')
      .in('code_client', arr)
      .eq('est_avoir', false)
      .order('date_emission', { ascending: false })

    const rows = (data as unknown as FactureDetail[]) ?? []
    setCache(prev => new Map([...prev, [cle, rows]]))
    setEnCours(prev => { const s = new Set(prev); s.delete(cle); return s })
  }, [cache, enCours])

  function getFactures(codes: string | string[]): FactureDetail[] {
    return cache.get(cleCache(Array.isArray(codes) ? codes : [codes])) ?? []
  }

  function estChargement(codes: string | string[]): boolean {
    return enCours.has(cleCache(Array.isArray(codes) ? codes : [codes]))
  }

  async function mettreAJourStatut(numeroPiece: string, statut: StatutFacture | null) {
    const { error } = await supabase
      .from('factures')
      .update({ statut_facture: statut } as never)
      .eq('numero_piece', numeroPiece)
    if (error) return false
    // Mise à jour optimiste dans tout le cache
    setCache(prev => {
      const next = new Map(prev)
      for (const [k, facs] of next) {
        next.set(k, facs.map(f => f.numero_piece === numeroPiece ? { ...f, statut_facture: statut } : f))
      }
      return next
    })
    return true
  }

  async function chargerHistorique(numeroPiece: string): Promise<HistoriqueLettrage[]> {
    const { data } = await supabase
      .from('lettrages')
      .select('id,id_ligne_bancaire,montant,date_lettrage,mode,commentaire')
      .eq('numero_facture', numeroPiece)
      .order('date_lettrage', { ascending: false })
    return (data as unknown as HistoriqueLettrage[]) ?? []
  }

  return { chargerFactures, getFactures, estChargement, mettreAJourStatut, chargerHistorique }
}
