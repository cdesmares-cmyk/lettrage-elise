// Export Lettrage multi-onglets via SheetJS — 2 feuilles : Affectation + Lignes bancaires
import * as XLSX from 'xlsx'
import { supabase } from './supabase'

interface RowLettrage {
  id: string
  date_lettrage: string
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
  // ── 1. Lettrages de la période ──────────────────────────────────
  const { data: lettrageData } = await supabase
    .from('lettrages')
    .select('id, date_lettrage, id_ligne_bancaire, code_client, numero_facture, montant, commentaire, operateur')
    .gte('date_lettrage', dateDebut)
    .lte('date_lettrage', dateFin)
    .order('date_lettrage', { ascending: true })
    .order('id_ligne_bancaire', { ascending: true })

  const lettrages = (lettrageData as unknown as RowLettrage[]) ?? []

  // ── 2. Libellés des lignes bancaires impliquées ─────────────────
  const ids = [...new Set(lettrages.map(l => l.id_ligne_bancaire).filter(Boolean))]
  let libelleMap: Record<string, string> = {}
  if (ids.length) {
    const { data: bancaireData } = await supabase
      .from('lignes_bancaires')
      .select('id_operation, libelle')
      .in('id_operation', ids)
    const bancaires = (bancaireData as unknown as { id_operation: string; libelle: string }[]) ?? []
    libelleMap = Object.fromEntries(bancaires.map(b => [b.id_operation, b.libelle]))
  }

  // ── 3. Lignes bancaires du mois (crédits uniquement) ───────────
  const { data: lignesData } = await supabase
    .from('v_lignes_bancaires_avec_statut')
    .select('id_operation, date_operation, libelle, credit, montant_lettre, statut_lettrage')
    .gte('date_operation', dateDebut)
    .lte('date_operation', dateFin)
    .neq('statut_lettrage', 'debit')
    .order('date_operation', { ascending: true })

  const lignes = (lignesData as unknown as RowLigneBancaire[]) ?? []

  // Map lettrages par ligne bancaire (pour feuille 2)
  const lettragsByLigne = new Map<string, RowLettrage[]>()
  for (const l of lettrages) {
    if (!lettragsByLigne.has(l.id_ligne_bancaire)) lettragsByLigne.set(l.id_ligne_bancaire, [])
    lettragsByLigne.get(l.id_ligne_bancaire)!.push(l)
  }

  const wb = XLSX.utils.book_new()

  // ── Feuille 1 : Affectation ──────────────────────────────────────
  const aoa1: (string | number)[][] = [
    ['Date', 'Ligne bancaire', 'Code client', 'N° Facture', 'Montant', 'Commentaire', 'Opérateur'],
  ]
  for (const l of lettrages) {
    aoa1.push([
      fmtDate(l.date_lettrage),
      libelleMap[l.id_ligne_bancaire] ?? '',
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

  const mois = dateDebut.slice(0, 7).replace('-', '-')
  XLSX.writeFile(wb, `export_lettrage_${dateDebut}_${dateFin}.xlsx`)
}

// Met en gras + fond foncé sur la première ligne d'une feuille
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
