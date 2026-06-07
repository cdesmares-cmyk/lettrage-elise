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
    const [{ data: lettreesData }, { data: nonLettreesData }] = await Promise.all([
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
    ])
    const lettrees = (lettreesData as { id_operation: string; credit: number | null }[]) ?? []
    const nonLettrees = (nonLettreesData as { id_operation: string }[]) ?? []
    return {
      nbLignes: lettrees.length,
      montant: lettrees.reduce((s, l) => s + (l.credit ?? 0), 0),
      nbNonLettrees: nonLettrees.length,
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

    // Inclure les remboursements effectués sur la période (basé sur la date de la ligne Débit)
    const rembLignes = await chargerRembEffectues(dateDebut, dateFin)

    exporterExtractionXls([...lignes, ...rembLignes], nomFichier)
  }

  async function chargerRembEffectues(dateDebut: string, dateFin: string): Promise<LigneExtractionLettrage[]> {
    // Lignes débit dans la période
    const { data: debitData } = await supabase
      .from('lignes_bancaires')
      .select('id_operation, libelle, date_operation')
      .gte('date_operation', dateDebut)
      .lte('date_operation', dateFin)
      .not('debit', 'is', null)
      .gt('debit', 0)

    const debitRows = ((debitData as unknown as { id_operation: string; libelle: string; date_operation: string }[]) ?? [])
    if (!debitRows.length) return []

    const debitMap = Object.fromEntries(debitRows.map(d => [d.id_operation, d]))
    const debitIds = Object.keys(debitMap)

    const { data: rembData } = await supabase
      .from('remboursements')
      .select('id, id_ligne_bancaire')
      .eq('statut', 'effectue')
      .in('id_ligne_bancaire', debitIds)

    const rembs = (rembData as { id: string; id_ligne_bancaire: string }[]) ?? []
    if (!rembs.length) return []

    const rembIds = rembs.map(r => r.id)
    const rembByLigne = Object.fromEntries(rembs.map(r => [r.id, r.id_ligne_bancaire]))

    const { data: lignesData } = await supabase
      .from('remboursement_lignes')
      .select('id, remboursement_id, numero_facture, code_client, montant')
      .in('remboursement_id', rembIds)

    return ((lignesData as { id: string; remboursement_id: string; numero_facture: string; code_client: string; montant: number }[]) ?? []).map(l => {
      const idLigne = rembByLigne[l.remboursement_id]
      const debitInfo = idLigne ? debitMap[idLigne] : null
      return {
        id: l.id,
        date_lettrage: debitInfo?.date_operation ?? dateDebut,
        libelle_bancaire: debitInfo?.libelle ?? null,
        code_client: l.code_client,
        numero_facture: l.numero_facture,
        montant: -l.montant,
        commentaire: 'Remboursement client',
      }
    })
  }

  return { lignesExportees, historique, chargement, charger, apercu, exporter, retelecharger }
}
