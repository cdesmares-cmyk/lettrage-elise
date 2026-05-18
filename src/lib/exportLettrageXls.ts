// Export Lettrage multi-onglets via SheetJS — 2 feuilles : Affectation + Lignes bancaires
// La date de référence est toujours la date de la ligne bancaire (date_operation),
// pas la date de saisie du lettrage (date_lettrage).
import * as XLSX from 'xlsx'
import { supabase } from './supabase'

interface RowLettrage {
  id: string
  id_ligne_bancaire: string
  code_client: string
  numero_facture: string
  montant: number
  commentaire: string | null
  operateur: string | null
}

interface RowLigneBancaire {
  id_operation: string
  date_operation: string
  libelle: string
  credit: number | null
  montant_lettre: number
  statut_lettrage: string
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export async function exporterLettrageXls(dateDebut: string, dateFin: string): Promise<void> {
  // ── 1. Lignes bancaires (crédits) dans la plage de dates ────────
  // Référentiel de date : on exporte les lignes reçues sur la période,
  // quel que soit le moment où le lettrage a été saisi.
  const { data: lignesData } = await supabase
    .from('v_lignes_bancaires_avec_statut')
    .select('id_operation, date_operation, libelle, credit, montant_lettre, statut_lettrage')
    .gte('date_operation', dateDebut)
    .lte('date_operation', dateFin)
    .neq('statut_lettrage', 'debit')
    .order('date_operation', { ascending: true })

  const lignes = (lignesData as unknown as RowLigneBancaire[]) ?? []
  const ligneIds = lignes.map(l => l.id_operation)

  // Map id_operation → infos ligne bancaire
  const ligneInfoMap = new Map(
    lignes.map(l => [l.id_operation, { libelle: l.libelle, date_operation: l.date_operation }])
  )

  // ── 2. Lettrages associés à ces lignes bancaires ─────────────────
  let lettrages: RowLettrage[] = []
  if (ligneIds.length) {
    const { data: lettrageData } = await supabase
      .from('lettrages')
      .select('id, id_ligne_bancaire, code_client, numero_facture, montant, commentaire, operateur')
      .in('id_ligne_bancaire', ligneIds)
    lettrages = (lettrageData as unknown as RowLettrage[]) ?? []
  }

  // Map lettrages par ligne bancaire (pour feuille 2)
  const lettragsByLigne = new Map<string, RowLettrage[]>()
  for (const l of lettrages) {
    if (!lettragsByLigne.has(l.id_ligne_bancaire)) lettragsByLigne.set(l.id_ligne_bancaire, [])
    lettragsByLigne.get(l.id_ligne_bancaire)!.push(l)
  }

  // Tri feuille 1 : par date_operation de la ligne bancaire parente
  const lettragesTries = [...lettrages].sort((a, b) => {
    const da = ligneInfoMap.get(a.id_ligne_bancaire)?.date_operation ?? ''
    const db = ligneInfoMap.get(b.id_ligne_bancaire)?.date_operation ?? ''
    return da.localeCompare(db)
  })

  const wb = XLSX.utils.book_new()

  // ── Feuille 1 : Affectation ──────────────────────────────────────
  const aoa1: (string | number)[][] = [
    ['Date', 'Ligne bancaire', 'Code client', 'N° Facture', 'Montant', 'Commentaire', 'Opérateur'],
  ]
  for (const l of lettragesTries) {
    const info = ligneInfoMap.get(l.id_ligne_bancaire)
    aoa1.push([
      fmtDate(info?.date_operation ?? ''),
      info?.libelle ?? '',
      l.code_client,
      l.numero_facture,
      l.montant,
      l.commentaire ?? '',
      l.operateur ?? '',
    ])
  }

  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
  ws1['!cols'] = [
    { wch: 12 }, // Date
    { wch: 42 }, // Ligne bancaire
    { wch: 15 }, // Code client
    { wch: 20 }, // N° Facture
    { wch: 14 }, // Montant
    { wch: 32 }, // Commentaire
    { wch: 15 }, // Opérateur
  ]
  styleHeaderRow(ws1, 7)

  // ── Feuille 2 : Lignes bancaires ─────────────────────────────────
  const aoa2: (string | number)[][] = [
    ['Date', 'Libellé', 'Crédit', 'Type', 'Commentaire'],
  ]
  for (const lb of lignes) {
    const letts = lettragsByLigne.get(lb.id_operation) ?? []
    const hasFactures = letts.some(l => l.code_client !== 'AUTRES')
    const hasAutres = letts.some(l => l.code_client === 'AUTRES')
    const type = !letts.length ? 'Non lettré'
      : hasFactures && hasAutres ? 'Mixte'
      : hasAutres ? 'Autres'
      : 'Facture'
    const commentairesAutres = letts
      .filter(l => l.code_client === 'AUTRES')
      .map(l => l.numero_facture.trim() || (l.commentaire ?? ''))
      .filter(Boolean)
      .join(' / ')
    aoa2.push([
      fmtDate(lb.date_operation),
      lb.libelle,
      lb.credit ?? 0,
      type,
      commentairesAutres,
    ])
  }

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  ws2['!cols'] = [
    { wch: 12 }, // Date
    { wch: 48 }, // Libellé
    { wch: 14 }, // Crédit
    { wch: 14 }, // Type
    { wch: 38 }, // Commentaire
  ]
  styleHeaderRow(ws2, 5)

  XLSX.utils.book_append_sheet(wb, ws1, 'Affectation')
  XLSX.utils.book_append_sheet(wb, ws2, 'Lignes bancaires')

  XLSX.writeFile(wb, `export_lettrage_${dateDebut}_${dateFin}.xlsx`)
}

function styleHeaderRow(ws: XLSX.WorkSheet, nbCols: number) {
  for (let c = 0; c < nbCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) continue
    ws[addr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0F172A' } },
      alignment: { horizontal: 'left' },
    }
  }
}
