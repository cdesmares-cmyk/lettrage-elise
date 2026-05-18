// Export Lettrage multi-onglets via SheetJS — 3 feuilles : Affectation + Lignes bancaires + Cadrage
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
  debit: number | null
  credit: number | null
  montant_lettre: number
  statut_lettrage: string
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function round2(n: number) { return Math.round(n * 100) / 100 }

export async function exporterLettrageXls(dateDebut: string, dateFin: string): Promise<void> {
  // ── 1. Toutes les lignes bancaires dans la plage de dates ────────
  // Inclut débits et crédits pour la feuille 2 (vue complète relevé)
  const { data: lignesData } = await supabase
    .from('v_lignes_bancaires_avec_statut')
    .select('id_operation, date_operation, libelle, debit, credit, montant_lettre, statut_lettrage')
    .gte('date_operation', dateDebut)
    .lte('date_operation', dateFin)
    .order('date_operation', { ascending: true })

  const lignes = (lignesData as unknown as RowLigneBancaire[]) ?? []

  // Map id_operation → infos ligne (utilisé pour feuille 1 et cadrage)
  const ligneInfoMap = new Map(
    lignes.map(l => [l.id_operation, { libelle: l.libelle, date_operation: l.date_operation }])
  )

  // IDs des lignes crédit uniquement (les seules pouvant avoir des lettrages)
  const ligneIdsCredit = lignes
    .filter(l => l.statut_lettrage !== 'debit')
    .map(l => l.id_operation)

  // ── 2. Lettrages associés aux lignes crédit ──────────────────────
  let lettrages: RowLettrage[] = []
  if (ligneIdsCredit.length) {
    const { data: lettrageData } = await supabase
      .from('lettrages')
      .select('id, id_ligne_bancaire, code_client, numero_facture, montant, commentaire, operateur')
      .in('id_ligne_bancaire', ligneIdsCredit)
    lettrages = (lettrageData as unknown as RowLettrage[]) ?? []
  }

  // Map lettrages par ligne bancaire
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
    { wch: 12 }, { wch: 42 }, { wch: 15 }, { wch: 20 }, { wch: 14 }, { wch: 32 }, { wch: 15 },
  ]
  styleHeaderRow(ws1, 7)

  // ── Feuille 2 : Lignes bancaires (débits + crédits) ──────────────
  const aoa2: (string | number)[][] = [
    ['Date', 'Libellé', 'Débit', 'Crédit', 'Type', 'Commentaire'],
  ]
  for (const lb of lignes) {
    const isDebit = lb.statut_lettrage === 'debit'
    const letts = lettragsByLigne.get(lb.id_operation) ?? []
    const hasFactures = letts.some(l => l.code_client !== 'AUTRES')
    const hasAutres = letts.some(l => l.code_client === 'AUTRES')
    const type = isDebit ? 'Débit'
      : !letts.length ? 'Non lettré'
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
      lb.debit ?? '',
      lb.credit ?? '',
      type,
      commentairesAutres,
    ])
  }

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  ws2['!cols'] = [
    { wch: 12 }, { wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 38 },
  ]
  styleHeaderRow(ws2, 6)

  // ── Feuille 3 : Cadrage ──────────────────────────────────────────
  // Par jour : Total Crédit reçu vs Total Lettré (hors Autres)
  // Permet à l'expert-comptable d'identifier les journées avec écart.
  // jourMap : totalCredit = somme des crédits reçus ; totalLettreRealise = somme des lettrages hors Autres
  const jourMap = new Map<string, { totalCredit: number; totalLettreRealise: number }>()

  for (const lb of lignes) {
    if (!lb.credit) continue
    const date = lb.date_operation
    if (!jourMap.has(date)) jourMap.set(date, { totalCredit: 0, totalLettreRealise: 0 })
    jourMap.get(date)!.totalCredit += lb.credit
  }

  for (const l of lettrages) {
    if (l.code_client === 'AUTRES') continue
    const date = ligneInfoMap.get(l.id_ligne_bancaire)?.date_operation
    if (!date) continue
    if (!jourMap.has(date)) jourMap.set(date, { totalCredit: 0, totalLettreRealise: 0 })
    jourMap.get(date)!.totalLettreRealise += l.montant
  }

  // Total Lettré = crédits − lettrages réalisés (hors Autres) = restant non lettré
  // Delta        = Total Crédit − Total Lettré = montant effectivement letté
  const aoa3: (string | number)[][] = [
    ['Date', 'Total Crédit', 'Total Lettré', 'Delta'],
  ]
  for (const [date, { totalCredit, totalLettreRealise }] of [...jourMap.entries()].sort()) {
    const totalLettre = round2(totalCredit - totalLettreRealise)
    const delta = round2(totalCredit - totalLettre)
    aoa3.push([fmtDate(date), round2(totalCredit), totalLettre, delta])
  }
  // Ligne de totaux
  const grandCredit = round2([...jourMap.values()].reduce((s, v) => s + v.totalCredit, 0))
  const grandLettreRealise = round2([...jourMap.values()].reduce((s, v) => s + v.totalLettreRealise, 0))
  const grandLettre = round2(grandCredit - grandLettreRealise)
  const grandDelta = round2(grandCredit - grandLettre)
  aoa3.push(['TOTAL', grandCredit, grandLettre, grandDelta])

  const ws3 = XLSX.utils.aoa_to_sheet(aoa3)
  ws3['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }]
  styleHeaderRow(ws3, 4)

  XLSX.utils.book_append_sheet(wb, ws1, 'Affectation')
  XLSX.utils.book_append_sheet(wb, ws2, 'Lignes bancaires')
  XLSX.utils.book_append_sheet(wb, ws3, 'Cadrage')

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
