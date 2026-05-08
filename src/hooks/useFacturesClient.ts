// Factures — lit les actives depuis AppDataContext, charge l'historique à la demande
import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAppData } from '../contexts/AppDataContext'
import type { FactureDetail, HistoriqueLettrage, StatutFacture } from '../types/client'

export function useFacturesClient() {
  const { facturesActives, mettreAJourStatutLocal } = useAppData()

  // Factures réglées chargées à la demande (non incluses dans le contexte global)
  const [historiqueLocal, setHistoriqueLocal] = useState<FactureDetail[]>([])
  const codesHistoriqueRef = useRef<Set<string>>(new Set())
  const [enCoursHistorique, setEnCoursHistorique] = useState(false)

  // Retourne factures actives + historique local chargé pour ces codes (sans doublons)
  function getFactures(codes: string | string[]): FactureDetail[] {
    const arr = Array.isArray(codes) ? codes : [codes]
    const actives = facturesActives.filter(f => arr.includes(f.code_client))
    const historique = historiqueLocal.filter(f => arr.includes(f.code_client))
    // Historique est prioritaire (contient aussi les lignes actives avec données fraîches)
    const numsHistorique = new Set(historique.map(f => f.numero_piece))
    return [
      ...historique,
      ...actives.filter(f => !numsHistorique.has(f.numero_piece)),
    ].sort((a, b) => (b.date_emission ?? '').localeCompare(a.date_emission ?? ''))
  }

  // Charge TOUTES les factures d'un client (y compris réglées) — déclenché par bouton explicite
  const chargerToutesFactures = useCallback(async (codes: string | string[]) => {
    const arr = (Array.isArray(codes) ? codes : [codes]).filter(c => c && !codesHistoriqueRef.current.has(c))
    if (!arr.length) return

    setEnCoursHistorique(true)
    const { data, error } = await supabase
      .from('v_factures_avec_reste_du')
      .select('numero_piece,code_client,nom_client,date_emission,date_echeance,montant_ht,montant_ttc,reste_du,statut_paiement,statut_facture,est_avoir')
      .in('code_client', arr)
      .order('date_emission', { ascending: false })

    if (!error) {
      const rows = (data as unknown as FactureDetail[]) ?? []
      setHistoriqueLocal(prev => {
        const sans = prev.filter(f => !arr.includes(f.code_client))
        return [...sans, ...rows]
      })
      arr.forEach(c => codesHistoriqueRef.current.add(c))
    }
    setEnCoursHistorique(false)
  }, [])

  // Compatibilité ascendante — plus d'effet (données déjà dans le contexte)
  const chargerFactures = useCallback(async (_codes: string | string[]) => {}, [])

  function estHistoriqueCharge(codes: string | string[]): boolean {
    const arr = Array.isArray(codes) ? codes : [codes]
    return arr.every(c => codesHistoriqueRef.current.has(c))
  }

  function estChargement(codes: string | string[]): boolean {
    if (!enCoursHistorique) return false
    const arr = Array.isArray(codes) ? codes : [codes]
    return arr.some(c => !codesHistoriqueRef.current.has(c))
  }

  async function mettreAJourStatut(numeroPiece: string, statut: StatutFacture | null) {
    const { error } = await supabase
      .from('factures')
      .update({ statut_facture: statut } as never)
      .eq('numero_piece', numeroPiece)
    if (error) return false
    mettreAJourStatutLocal(numeroPiece, statut)
    setHistoriqueLocal(prev => prev.map(f =>
      f.numero_piece === numeroPiece ? { ...f, statut_facture: statut } : f
    ))
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

  return {
    chargerFactures,
    chargerToutesFactures,
    estHistoriqueCharge,
    getFactures,
    estChargement,
    mettreAJourStatut,
    chargerHistorique,
  }
}
