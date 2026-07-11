// Export Lettrage multi-onglets via SheetJS — 3 feuilles : Affectation + Lignes bancaires + Cadrage
// La date de référence est toujours la date de la ligne bancaire (date_operation),
// pas la date de saisie du lettrage (date_lettrage).
import * as XLSX from 'xlsx'
import { supabase } from './supabase'

interface RowLettrage {
  id: string
  id_ligne_bancaire: string
  code_client: string
  numero_facture: string | null
  montant: number
  commentaire: string | null
  operateur: string | null
}

interface RowCompensation {
  date_lettrage: string
  numero_facture: string | null
  montant: number
  commentaire: string | null
  compensation_id: string
}

interface RowImportLettrage {
  date_lettrage: string
  code_client: string
  numero_facture: string | null
  montant: number
  commentaire: string | null
  operateur: string | null
}

interface RowLigneBancaire {
  id_operation: string
  date_operation: string
  libelle: string
  detail: string | null
  infos_complementaires: string | null
  debit: number | null
  credit: number | null
  montant_lettre: number
  statut_lettrage: string
}

interface AffectationRow {
  date: string
  ligne: string
  detail: string
  infos_complementaires: string
  debit_credit: string
  code_client: string
  numero_facture: string
  montant: number
  commentaire: string
  operateur: string
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function round2(n: number) { return Math.round(n * 100) / 100 }

// Pagine par tranches de 1000 pour contourner le plafond PostgREST db-max-rows
async function fetchAll<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any }>
): Promise<T[]> {
  const PAGE = 1000
  const acc: T[] = []
  let offset = 0
  while (true) {
    const { data } = await buildQuery(offset, offset + PAGE - 1)
    const rows: T[] = data ?? []
    acc.push(...rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return acc
}

export async function exporterLettrageXls(dateDebut: string, dateFin: string, nomFichier?: string): Promise<void> {
  // ── 1. Toutes les lignes bancaires dans la plage de dates ────────
  const lignes = await fetchAll<RowLigneBancaire>((from, to) =>
    supabase
      .from('v_lignes_bancaires_avec_statut')
      .select('id_operation, date_operation, libelle, detail, infos_complementaires, debit, credit, montant_lettre, statut_lettrage')
      .gte('date_operation', dateDebut)
      .lte('date_operation', dateFin)
      .order('date_operation', { ascending: true })
      .range(from, to)
  )

  // Map id_operation → infos ligne (feuille 1 et cadrage)
  const ligneInfoMap = new Map(
    lignes.map(l => [l.id_operation, {
      date_operation: l.date_operation,
      libelle: l.libelle,
      detail: l.detail ?? '',
      infos_complementaires: l.infos_complementaires ?? '',
      debit_credit: l.credit != null ? `Crédit : ${l.credit}` : l.debit != null ? `Débit : ${l.debit}` : '',
    }])
  )

  // IDs des lignes crédit uniquement (les seules pouvant avoir des lettrages)
  const ligneIdsCredit = lignes
    .filter(l => l.statut_lettrage !== 'debit')
    .map(l => l.id_operation)

  // ── 2. Lettrages associés aux lignes crédit ──────────────────────
  let lettrages: RowLettrage[] = []
  if (ligneIdsCredit.length) {
    lettrages = await fetchAll<RowLettrage>((from, to) =>
      supabase
        .from('lettrages')
        .select('id, id_ligne_bancaire, code_client, numero_facture, montant, commentaire, operateur')
        .in('id_ligne_bancaire', ligneIdsCredit)
        .eq('annule', false)
        .range(from, to)
    )
  }

  // ── 2b. Compensations internes ───────────────────────────────────
  const compensations = await fetchAll<RowCompensation>((from, to) =>
    supabase
      .from('lettrages')
      .select('date_lettrage, numero_facture, montant, commentaire, compensation_id')
      .is('id_ligne_bancaire', null)
      .not('compensation_id', 'is', null)
      .eq('annule', false)
      .gte('date_lettrage', dateDebut)
      .lte('date_lettrage', dateFin)
      .order('compensation_id')
      .order('date_lettrage')
      .range(from, to)
  )

  // ── 2c. Lettrages importés manuellement ─────────────────────────
  const importsHistoriques = await fetchAll<RowImportLettrage>((from, to) =>
    supabase
      .from('lettrages')
      .select('date_lettrage, code_client, numero_facture, montant, commentaire, operateur')
      .is('id_ligne_bancaire', null)
      .eq('mode', 'import')
      .eq('annule', false)
      .gte('date_lettrage', dateDebut)
      .lte('date_lettrage', dateFin)
      .order('date_lettrage')
      .range(from, to)
  )

  // Map lettrages par ligne bancaire (feuille 2)
  const lettragsByLigne = new Map<string, RowLettrage[]>()
  for (const l of lettrages) {
    if (!lettragsByLigne.has(l.id_ligne_bancaire)) lettragsByLigne.set(l.id_ligne_bancaire, [])
    lettragsByLigne.get(l.id_ligne_bancaire)!.push(l)
  }

  const wb = XLSX.utils.book_new()

  // ── Feuille 1 : Affectation — toutes sources fusionnées, triées par date croissante ──
  const affectations: AffectationRow[] = []

  for (const l of lettrages) {
    const info = ligneInfoMap.get(l.id_ligne_bancaire)
    affectations.push({
      date: info?.date_operation ?? '',
      ligne: info?.libelle ?? '',
      detail: info?.detail ?? '',
      infos_complementaires: info?.infos_complementaires ?? '',
      debit_credit: info?.debit_credit ?? '',
      code_client: l.code_client,
      numero_facture: l.code_client === 'AUTRES' ? 'Autres' : (l.numero_facture ?? ''),
      montant: l.montant,
      commentaire: l.commentaire ?? '',
      operateur: l.operateur ?? '',
    })
  }

  for (const c of compensations) {
    affectations.push({
      date: c.date_lettrage,
      ligne: 'Compensation interne',
      detail: '',
      infos_complementaires: '',
      debit_credit: '',
      code_client: '',
      numero_facture: c.numero_facture ?? '',
      montant: c.montant,
      commentaire: c.commentaire ?? '',
      operateur: '',
    })
  }

  for (const imp of importsHistoriques) {
    affectations.push({
      date: imp.date_lettrage,
      ligne: 'Import historique',
      detail: '',
      infos_complementaires: '',
      debit_credit: '',
      code_client: imp.code_client,
      numero_facture: imp.code_client === 'AUTRES' ? 'Autres' : (imp.numero_facture ?? ''),
      montant: imp.montant,
      commentaire: imp.commentaire ?? '',
      operateur: imp.operateur ?? '',
    })
  }

  affectations.sort((a, b) => a.date.localeCompare(b.date))

  const aoa1: (string | number)[][] = [
    ['Date', 'Ligne bancaire', 'Détail', 'Infos complémentaires', 'Débit / Crédit', 'Code client', 'N° Facture', 'Montant', 'Commentaire', 'Opérateur'],
  ]
  for (const r of affectations) {
    aoa1.push([fmtDate(r.date), r.ligne, r.detail, r.infos_complementaires, r.debit_credit, r.code_client, r.numero_facture, r.montant, r.commentaire, r.operateur])
  }

  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
  ws1['!cols'] = [
    { wch: 12 }, { wch: 42 }, { wch: 28 }, { wch: 32 }, { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 14 }, { wch: 32 }, { wch: 15 },
  ]
  styleHeaderRow(ws1, 10)

  // ── Feuille 2 : Lignes bancaires (débits + crédits) ──────────────
  const aoa2: (string | number)[][] = [
    ['Date', 'Libellé', 'Détail', 'Infos complémentaires', 'Débit', 'Crédit', 'Type', 'Commentaire'],
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
      .map(l => (l.commentaire ?? '').trim() || (l.numero_facture ?? '').trim())
      .filter(Boolean)
      .join(' / ')
    aoa2.push([
      fmtDate(lb.date_operation),
      lb.libelle,
      lb.detail ?? '',
      lb.infos_complementaires ?? '',
      lb.debit ?? '',
      lb.credit ?? '',
      type,
      commentairesAutres,
    ])
  }

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  ws2['!cols'] = [
    { wch: 12 }, { wch: 42 }, { wch: 28 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 38 },
  ]
  styleHeaderRow(ws2, 8)

  // ── Feuille 3 : Cadrage ──────────────────────────────────────────
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

  const aoa3: (string | number)[][] = [
    ['Date', 'Total Crédit', 'Total Lettré', 'Delta'],
  ]
  for (const [date, { totalCredit, totalLettreRealise }] of [...jourMap.entries()].sort()) {
    const totalLettre = round2(totalCredit - totalLettreRealise)
    const delta = round2(totalCredit - totalLettre)
    aoa3.push([fmtDate(date), round2(totalCredit), totalLettre, delta])
  }
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

  XLSX.writeFile(wb, `${nomFichier ?? `export_lettrage_${dateDebut}_${dateFin}`}.xlsx`)
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
