import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { exporterLettrageXls } from '../lib/exportLettrageXls'

export interface ExportComptable {
  id: string
  date_debut: string
  date_fin: string
  nb_lettrages: number
  montant_total: number
  created_at: string
  exporte_par: string | null
}

export function useExportComptable() {
  const [lignesExportees, setLignesExportees] = useState<Map<string, string>>(new Map())
  const [historique, setHistorique] = useState<ExportComptable[]>([])
  const [chargement, setChargement] = useState(false)

  const charger = useCallback(async () => {
    const [{ data: lockData }, { data: histData }] = await Promise.all([
      supabase
        .from('lettrages')
        .select('id_ligne_bancaire, export_id')
        .not('export_id', 'is', null)
        .eq('annule', false)
        .limit(10000),
      supabase
        .from('exports_comptables')
        .select('id, date_debut, date_fin, nb_lettrages, montant_total, created_at, exporte_par')
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    const rows = ((lockData as { id_ligne_bancaire: string | null; export_id: string | null }[]) ?? [])
    const hist = (histData as ExportComptable[]) ?? []
    const dateByExportId = Object.fromEntries(hist.map(e => [e.id, e.created_at]))

    const exportMap = new Map<string, string>()
    for (const r of rows) {
      if (r.id_ligne_bancaire && r.export_id && !exportMap.has(r.id_ligne_bancaire)) {
        exportMap.set(r.id_ligne_bancaire, dateByExportId[r.export_id] ?? '')
      }
    }
    setLignesExportees(exportMap)
    setHistorique(hist)
  }, [])

  async function apercu(dateDebut: string, dateFin: string) {
    const [{ data: lettreesData }, { data: nonLettreesData }, { data: compData }] = await Promise.all([
      supabase
        .from('v_lignes_bancaires_avec_statut')
        .select('id_operation, credit')
        .eq('statut_lettrage', 'lettre')
        .gte('date_operation', dateDebut)
        .lte('date_operation', dateFin),
      supabase
        .from('v_lignes_bancaires_avec_statut')
        .select('id_operation')
        .in('statut_lettrage', ['non_lettre', 'partiel'])
        .gte('date_operation', dateDebut)
        .lte('date_operation', dateFin),
      supabase
        .from('lettrages')
        .select('compensation_id')
        .not('compensation_id', 'is', null)
        .is('id_ligne_bancaire', null)
        .eq('annule', false)
        .is('export_id', null)
        .gte('date_lettrage', dateDebut)
        .lte('date_lettrage', dateFin),
    ])
    const lettrees = (lettreesData as { id_operation: string; credit: number | null }[]) ?? []
    const nonLettrees = (nonLettreesData as { id_operation: string }[]) ?? []
    const nbCompensations = new Set(((compData as { compensation_id: string }[]) ?? []).map(r => r.compensation_id)).size
    return {
      nbLignes: lettrees.length,
      montant: lettrees.reduce((s, l) => s + (l.credit ?? 0), 0),
      nbNonLettrees: nonLettrees.length,
      nbCompensations,
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
    await exporterLettrageXls(dateDebut, dateFin, nomFichier)
  }

  return { lignesExportees, historique, chargement, charger, apercu, exporter, retelecharger }
}
