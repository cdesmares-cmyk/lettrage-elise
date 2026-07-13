// Compensation interne avoir/facture — sans ligne bancaire
// Un avoir source compense une ou plusieurs factures du même client.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import type { FactureDetail } from '../types/client'
import { TOLERANCE_CENT } from '../lib/constantes'

interface SelectionFacture {
  facture: FactureDetail
  montant: number
}

export function useCompensationAvoir(onSuccess: () => void) {
  const { utilisateur } = useAuth()
  const [avoirSource, setAvoirSource] = useState<FactureDetail | null>(null)
  const [selection, setSelection] = useState<SelectionFacture[]>([])
  const [chargement, setChargement] = useState(false)

  const creditDisponible = avoirSource ? Math.abs(avoirSource.reste_du) : 0
  const montantAttribue  = Math.round(selection.reduce((s, i) => s + i.montant, 0) * 100) / 100
  const restant          = Math.round((creditDisponible - montantAttribue) * 100) / 100

  function selectionnerAvoir(f: FactureDetail) {
    setAvoirSource(f)
    setSelection([])
  }

  function annuler() {
    setAvoirSource(null)
    setSelection([])
  }

  function estSelectionne(numero: string) {
    return selection.some(s => s.facture.numero_piece === numero)
  }

  function toggleFacture(f: FactureDetail) {
    if (estSelectionne(f.numero_piece)) {
      setSelection(prev => prev.filter(s => s.facture.numero_piece !== f.numero_piece))
      return
    }
    // Propose le min entre reste_du facture et restant disponible de l'avoir
    const montantProp = Math.min(f.reste_du, restant)
    if (montantProp <= TOLERANCE_CENT) return
    setSelection(prev => [...prev, { facture: f, montant: Math.round(montantProp * 100) / 100 }])
  }

  function setMontant(numero: string, valeur: number) {
    setSelection(prev => prev.map(s =>
      s.facture.numero_piece === numero ? { ...s, montant: valeur } : s
    ))
  }

  function motifInvalide(): string | null {
    if (!avoirSource) return 'Aucun avoir sélectionné'
    if (selection.length === 0) return 'Sélectionnez au moins une facture'
    if (montantAttribue > creditDisponible + TOLERANCE_CENT)
      return `Montant alloué (${montantAttribue.toFixed(2)} €) dépasse l'avoir disponible (${creditDisponible.toFixed(2)} €)`
    for (const s of selection) {
      if (s.montant <= TOLERANCE_CENT) return `Montant invalide pour ${s.facture.numero_piece}`
      if (s.montant > s.facture.reste_du + TOLERANCE_CENT)
        return `Montant dépasse le reste dû de ${s.facture.numero_piece}`
    }
    return null
  }

  function peutValider(): boolean { return motifInvalide() === null }

  async function valider(): Promise<boolean> {
    if (!avoirSource || !peutValider()) return false
    setChargement(true)
    try {
      const compensationId = crypto.randomUUID()
      const operateur      = utilisateur?.email?.split('@')[0] ?? 'inconnu'
      const dateDuJour     = new Date().toISOString().split('T')[0]
      const refFactures    = selection.map(s => s.facture.numero_piece).join(' & ')

      const rows = [
        // Ligne avoir — montant total compensé (négatif, réduit le reste_du de l'avoir)
        {
          numero_facture:  avoirSource.numero_piece,
          code_client:     avoirSource.code_client,
          montant:         -montantAttribue,
          id_ligne_bancaire: null,
          mode:            'compensation',
          commentaire:     `Compensation ${refFactures}`,
          operateur,
          date_lettrage:   dateDuJour,
          compensation_id: compensationId,
        },
        // Lignes factures — une par facture sélectionnée (montant positif)
        ...selection.map(s => ({
          numero_facture:  s.facture.numero_piece,
          code_client:     s.facture.code_client,
          montant:         s.montant,
          id_ligne_bancaire: null,
          mode:            'compensation',
          commentaire:     `Compensé par ${avoirSource.numero_piece}`,
          operateur,
          date_lettrage:   dateDuJour,
          compensation_id: compensationId,
        })),
      ]

      const { error } = await supabase.from('lettrages').insert(rows as never)
      if (error) throw error

      const nb = selection.length
      toast.success(`Avoir bien comptabilisé, ${nb} facture${nb > 1 ? 's' : ''} concernée${nb > 1 ? 's' : ''}`)
      annuler()
      onSuccess()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la compensation')
      return false
    } finally {
      setChargement(false)
    }
  }

  async function annulerCompensation(compensationId: string, motif: string, onDone?: () => void): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('lettrages')
        .update({ annule: true, motif_annulation: motif.trim() || 'Annulation compensation' } as never)
        .eq('compensation_id', compensationId)
        .eq('annule', false)
      if (error) throw error
      toast.success('Compensation annulée — les soldes ont été restaurés')
      onDone?.()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'annulation')
      return false
    }
  }

  return {
    avoirSource, selection, chargement,
    creditDisponible, montantAttribue, restant,
    selectionnerAvoir, annuler, toggleFacture, setMontant,
    estSelectionne, peutValider, motifInvalide, valider, annulerCompensation,
  }
}
