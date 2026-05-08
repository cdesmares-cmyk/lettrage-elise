// Chargement des factures — préchargement global au load de page pour perf optimale
import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { FactureDetail, HistoriqueLettrage, StatutFacture } from '../types/client'

export function useFacturesClient() {
  const [toutes, setToutes] = useState<FactureDetail[]>([])
  const [codesCharges, setCodesCharges] = useState<Set<string>>(new Set())
  const [enCours, setEnCours] = useState(false)

  // Charge toutes les factures pour une liste de codes en une seule requête
  const chargerFactures = useCallback(async (codes: string | string[]) => {
    const arr = (Array.isArray(codes) ? codes : [codes]).filter(c => c && !codesCharges.has(c))
    if (!arr.length) return

    setEnCours(true)
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select('numero_piece,code_client,nom_client,date_emission,date_echeance,montant_ht,montant_ttc,reste_du,statut_paiement,statut_facture,est_avoir')
      .in('code_client', arr)
      .order('code_client', { ascending: true })
      .order('date_emission', { ascending: false })

    const rows = (data as unknown as FactureDetail[]) ?? []
    setToutes(prev => {
      // Remplace les factures des codes rechargés, ajoute les nouvelles
      const sansCodes = prev.filter(f => !arr.includes(f.code_client))
      return [...sansCodes, ...rows]
    })
    setCodesCharges(prev => new Set([...prev, ...arr]))
    setEnCours(false)
  }, [codesCharges])

  function getFactures(codes: string | string[]): FactureDetail[] {
    const arr = Array.isArray(codes) ? codes : [codes]
    return toutes.filter(f => arr.includes(f.code_client))
  }

  function estChargement(codes: string | string[]): boolean {
    if (!enCours) return false
    const arr = Array.isArray(codes) ? codes : [codes]
    return arr.some(c => !codesCharges.has(c))
  }

  async function mettreAJourStatut(numeroPiece: string, statut: StatutFacture | null) {
    const { error } = await supabase
      .from('factures')
      .update({ statut_facture: statut } as never)
      .eq('numero_piece', numeroPiece)
    if (error) return false
    setToutes(prev => prev.map(f => f.numero_piece === numeroPiece ? { ...f, statut_facture: statut } : f))
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
