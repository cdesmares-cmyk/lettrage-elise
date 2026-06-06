import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { exporterExtractionXls } from '../lib/exportXls'
import type { LigneExtractionLettrage } from '../lib/exportXls'

export interface ExportComptable {
  id: string
  date_debut: string
  date_fin: string
  nb_lettrages: number
  montant_total: number
  created_at: string
  exporte_par: string | null
}

interface RowLettrage {
  id: string
  date_lettrage: string
  code_client: string
  numero_facture: string | null
  montant: number
  commentaire: string | null
  id_ligne_bancaire: string | null
}

export function useExportComptable() {
  const [lignesExportees, setLignesExportees] = useState<Set<string>>(new Set())
  const [historique, setHistorique] = useState<ExportComptable[]>([])
  const [chargement, setChargement] = useState(false)

  const charger = useCallback(async () => {
    const [{ data: lockData }, { data: histData }] = await Promise.all([
      supabase
        .from('lettrages')
        .select('id_ligne_bancaire')
        .not('export_id', 'is', null)
        .eq('annule', false),
      supabase
        .from('exports_comptables')
        .select('id, date_debut, date_fin, nb_lettrages, montant_total, created_at, exporte_par')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const ids = [...new Set(
      ((lockData as { id_ligne_bancaire: string | null }[]) ?? [])
        .map(r => r.id_ligne_bancaire)
        .filter((id): id is string => !!id)
    )]
    setLignesExportees(new Set(ids))
    setHistorique((histData as ExportComptable[]) ?? [])
  }, [])

  async function apercu(dateDebut: string, dateFin: string) {
    const { data } = await supabase
      .from('v_lignes_bancaires_avec_statut')
      .select('id_operation, credit')
      .eq('statut_lettrage', 'lettre')
      .gte('date_operation', dateDebut)
      .lte('date_operation', dateFin)
    const lignes = (data as { id_operation: string; credit: number | null }[]) ?? []
    return {
      nbLignes: lignes.length,
      montant: lignes.reduce((s, l) => s + (l.credit ?? 0), 0),
    }
  }

  async function exporter(dateDebut: string, dateFin: string) {
    setChargement(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('creer_export_comptable', {
        p_date_debut: dateDebut,
        p_date_fin:   dateFin,
      })
      if (error) throw error
      await genererFichier(dateDebut, dateFin, `export_comptable_${dateDebut}_${dateFin}`)
      await charger()
    } finally {
      setChargement(false)
    }
  }

  async function retelecharger(exp: ExportComptable) {
    await genererFichier(
      exp.date_debut,
      exp.date_fin,
      `export_comptable_${exp.date_debut}_${exp.date_fin}`
    )
  }

  async function genererFichier(dateDebut: string, dateFin: string, nomFichier: string) {
    const { data: lbData } = await supabase
      .from('v_lignes_bancaires_avec_statut')
      .select('id_operation')
      .eq('statut_lettrage', 'lettre')
      .gte('date_operation', dateDebut)
      .lte('date_operation', dateFin)

    const idOps = ((lbData as { id_operation: string }[]) ?? []).map(l => l.id_operation)
    if (!idOps.length) return

    const { data: lettrageData } = await supabase
      .from('lettrages')
      .select('id, date_lettrage, code_client, numero_facture, montant, commentaire, id_ligne_bancaire')
      .in('id_ligne_bancaire', idOps)
      .eq('annule', false)
      .order('date_lettrage', { ascending: false })
      .order('code_client', { ascending: true })

    const rows = (lettrageData as RowLettrage[]) ?? []
    const libelleIds = [...new Set(rows.map(r => r.id_ligne_bancaire).filter(Boolean))] as string[]
    let libelleMap: Record<string, string> = {}
    if (libelleIds.length) {
      const { data: bancaireData } = await supabase
        .from('lignes_bancaires')
        .select('id_operation, libelle')
        .in('id_operation', libelleIds)
      libelleMap = Object.fromEntries(
        ((bancaireData as { id_operation: string; libelle: string }[]) ?? []).map(b => [b.id_operation, b.libelle])
      )
    }

    const lignes: LigneExtractionLettrage[] = rows.map(r => ({
      ...r,
      libelle_bancaire: r.id_ligne_bancaire ? (libelleMap[r.id_ligne_bancaire] ?? null) : null,
    }))
    exporterExtractionXls(lignes, nomFichier)
  }

  return { lignesExportees, historique, chargement, charger, apercu, exporter, retelecharger }
}
