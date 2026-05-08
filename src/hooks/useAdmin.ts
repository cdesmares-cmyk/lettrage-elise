import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export interface ImportRecord {
  id: string
  type: 'csv_bancaire' | 'xlsx_factures'
  nom_fichier: string | null
  nb_lignes_inserees: number | null
  nb_lignes_doublons: number | null
  cree_le: string
}

export function useAdmin() {
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [chargement, setChargement] = useState(false)

  const chargerImports = useCallback(async () => {
    const { data } = await supabase
      .from('imports')
      .select('id, type, nom_fichier, nb_lignes_inserees, nb_lignes_doublons, cree_le')
      .order('cree_le', { ascending: false })
      .limit(20)
    setImports((data as unknown as ImportRecord[]) ?? [])
  }, [])

  useEffect(() => { chargerImports() }, [chargerImports])

  async function annulerImport(imp: ImportRecord): Promise<boolean> {
    setChargement(true)
    try {
      if (imp.type === 'csv_bancaire') {
        // 1. Récupérer les IDs des lignes bancaires de cet import
        const { data: lignes } = await supabase
          .from('lignes_bancaires')
          .select('id_operation')
          .eq('import_id', imp.id)
        const ids = (lignes ?? []).map((l: { id_operation: string }) => l.id_operation)

        // 2. Supprimer les lettrages liés (trigger met à jour reste_du automatiquement)
        if (ids.length > 0) {
          const { error } = await supabase.from('lettrages').delete().in('id_ligne_bancaire', ids)
          if (error) throw error
        }
        // 3. Supprimer les lignes bancaires
        const { error: e2 } = await supabase.from('lignes_bancaires').delete().eq('import_id', imp.id)
        if (e2) throw e2
      } else {
        // xlsx_factures
        // 1. Récupérer les numéros de factures de cet import
        const { data: facs } = await supabase
          .from('factures')
          .select('numero_piece')
          .eq('import_id', imp.id)
        const nums = (facs ?? []).map((f: { numero_piece: string }) => f.numero_piece)

        // 2. Supprimer les lettrages liés
        if (nums.length > 0) {
          const { error } = await supabase.from('lettrages').delete().in('numero_facture', nums)
          if (error) throw error
        }
        // 3. Supprimer les factures
        const { error: e2 } = await supabase.from('factures').delete().eq('import_id', imp.id)
        if (e2) throw e2
      }

      // 4. Supprimer l'enregistrement import
      await supabase.from('imports').delete().eq('id', imp.id)
      toast.success('Import annulé.')
      await chargerImports()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'annulation.')
      return false
    } finally {
      setChargement(false)
    }
  }

  async function supprimerLettrages(debut: string, fin: string): Promise<number> {
    setChargement(true)
    try {
      const { data: avant } = await supabase
        .from('lettrages')
        .select('id', { count: 'exact', head: false })
        .gte('date_lettrage', debut)
        .lte('date_lettrage', fin)
      const nb = (avant ?? []).length

      const { error } = await supabase
        .from('lettrages')
        .delete()
        .gte('date_lettrage', debut)
        .lte('date_lettrage', fin)
      if (error) throw error
      toast.success(`${nb} lettrage${nb > 1 ? 's' : ''} supprimé${nb > 1 ? 's' : ''}.`)
      return nb
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.')
      return 0
    } finally {
      setChargement(false)
    }
  }

  async function resetComplet(): Promise<boolean> {
    setChargement(true)
    try {
      // Ordre strict : lettrages → factures → lignes_bancaires → imports
      for (const { table, col } of [
        { table: 'lettrages', col: 'created_at' },
        { table: 'factures', col: 'created_at' },
        { table: 'lignes_bancaires', col: 'created_at' },
        { table: 'imports', col: 'created_at' },
      ]) {
        const { error } = await supabase.from(table).delete().gte(col, '2000-01-01')
        if (error) throw error
      }
      toast.success('Réinitialisation complète effectuée.')
      await chargerImports()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du reset.')
      return false
    } finally {
      setChargement(false)
    }
  }

  return { imports, chargement, chargerImports, annulerImport, supprimerLettrages, resetComplet }
}
