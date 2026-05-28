// Export XLSX via SheetJS — Calibri 12, format nombre pour les montants, brut mais traitable
import * as XLSX from 'xlsx'
import type { FactureDetail, GroupeNebuleuse } from '../types/client'

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function dlXlsx(wb: XLSX.WorkBook, nomFichier: string) {
  XLSX.writeFile(wb, `${nomFichier}.xlsx`)
}

// Applique Calibri 12 sur toutes les cellules + format nombre sur les colonnes monétaires
function styleSheet(ws: XLSX.WorkSheet, monetaryCols: number[]) {
  const ref = ws['!ref']
  if (!ref) return
  const range = XLSX.utils.decode_range(ref)
  const monSet = new Set(monetaryCols)

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (!ws[addr]) continue
      const isHeader = r === 0
      ws[addr].s = isHeader
        ? { font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F172A' } } }
        : { font: { name: 'Calibri', sz: 12 } }
      if (!isHeader && monSet.has(c) && typeof ws[addr].v === 'number') {
        ws[addr].z = '#,##0.00'
      }
    }
  }
}

// ── Factures compte client ────────────────────────────────────────────────────
export function exporterXls(factures: FactureDetail[], nomFichier = 'extraction_compte_client') {
  const aoa: (string | number | null)[][] = [
    ['Code client', 'Type', 'N° Facture', 'Montant HT', 'Montant TTC', 'Restant Dû', 'Date émission', 'Date échéance', 'Statut paiement', 'Statut facture'],
  ]
  for (const f of factures) {
    aoa.push([
      f.code_client,
      (f.est_avoir || f.montant_ttc < 0) ? 'Avoir' : 'Facture',
      f.numero_piece,
      f.montant_ht ?? '',
      f.montant_ttc ?? '',
      f.reste_du,
      fmtDate(f.date_emission),
      fmtDate(f.date_echeance),
      f.statut_paiement ?? '',
      f.statut_facture ?? '',
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
  ]
  styleSheet(ws, [3, 4, 5]) // Montant HT, TTC, Restant Dû

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Factures')
  dlXlsx(wb, nomFichier)
}

// ── Nébuleuse (groupements) ───────────────────────────────────────────────────
function buildGroupeMap(groupes: GroupeNebuleuse[]): Map<string, { cle: string; nom: string }> {
  const map = new Map<string, { cle: string; nom: string }>()
  for (const g of groupes)
    for (const code of g.codes_clients)
      map.set(code, { cle: g.groupe_key, nom: g.nom_groupe })
  return map
}

export function exporterNebuleuseXls(
  factures: FactureDetail[],
  groupes: GroupeNebuleuse[],
  nomFichier = 'extraction_nebuleuse'
) {
  const groupeMap = buildGroupeMap(groupes)

  const aoa: (string | number | null)[][] = [
    ['Groupe', 'Nom groupe', 'Code client', 'Type', 'N° Facture', 'Montant HT', 'Montant TTC', 'Restant Dû', 'Date émission', 'Date échéance', 'Statut paiement', 'Statut facture'],
  ]
  for (const f of factures) {
    const grp = groupeMap.get(f.code_client)
    aoa.push([
      grp?.cle ?? '',
      grp?.nom ?? '',
      f.code_client,
      (f.est_avoir || f.montant_ttc < 0) ? 'Avoir' : 'Facture',
      f.numero_piece,
      f.montant_ht ?? '',
      f.montant_ttc ?? '',
      f.reste_du,
      fmtDate(f.date_emission),
      fmtDate(f.date_echeance),
      f.statut_paiement ?? '',
      f.statut_facture ?? '',
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 20 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
  ]
  styleSheet(ws, [5, 6, 7]) // Montant HT, TTC, Restant Dû

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Nébuleuse')
  dlXlsx(wb, nomFichier)
}

// ── Extraction lettrages (modal lettrage) ─────────────────────────────────────
export interface LigneExtractionLettrage {
  id: string
  date_lettrage: string
  libelle_bancaire: string | null
  code_client: string
  numero_facture: string | null
  montant: number
  commentaire: string | null
}

export function exporterExtractionXls(lignes: LigneExtractionLettrage[], nomFichier = 'extraction_lettrages') {
  const aoa: (string | number | null)[][] = [
    ['Date', 'Ligne bancaire', 'Code client', 'N° Facture', 'Montant attribué', 'Commentaire'],
  ]
  for (const l of lignes) {
    aoa.push([
      fmtDate(l.date_lettrage),
      l.libelle_bancaire ?? '',
      l.code_client,
      l.code_client === 'AUTRES' ? `Autres${l.commentaire ? ' · ' + l.commentaire : ''}` : (l.numero_facture ?? ''),
      l.montant,
      l.commentaire ?? '',
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 12 }, { wch: 42 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 32 }]
  styleSheet(ws, [4]) // Montant attribué

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lettrages')
  dlXlsx(wb, nomFichier)
}

// ── Grand Livre client ────────────────────────────────────────────────────────
export interface LigneGrandLivre {
  date: string          // DD/MM/YYYY
  type: string          // Facture | Avoir | Règlement | Correction
  ref_paiement: string  // id_ligne_bancaire (avec -C si correction)
  libelle: string       // libellé bancaire ou label correction
  numero_piece: string
  ref: string           // lettre A/B/C... regroupant les lignes d'un même virement
  debit: number | null  // valeur positive (affiché en négatif dans l'export)
  credit: number | null
  solde: number
}

export function exporterGrandLivreXls(
  nomClient: string,
  codeClient: string,
  dateDebut: string,
  dateFin: string,
  soldeOuverture: number,
  lignes: LigneGrandLivre[],
  nomFichier = 'grand_livre'
) {
  // 8 colonnes : Date | Type | Réf. | Réf paiement | Libellé | N° Pièce | Mouvement | Solde
  // Mouvement : + = facture émise (dette augmente) / - = règlement reçu (dette diminue)
  const aoa: (string | number | null)[][] = [
    [`Grand Livre — ${nomClient} (${codeClient}) — Période : ${dateDebut} → ${dateFin}`, null, null, null, null, null, null, null],
    ['Date', 'Type', 'Réf.', 'Réf paiement', 'Libellé bancaire', 'N° Pièce', 'Mouvement', 'Solde'],
    [dateDebut, 'Solde d\'ouverture', '', '', '', '', null, soldeOuverture],
  ]

  for (const l of lignes) {
    const mouvement = (l.debit ?? 0) - (l.credit ?? 0)
    aoa.push([
      l.date,
      l.type,
      l.ref,
      l.ref_paiement,
      l.libelle,
      l.numero_piece,
      mouvement !== 0 ? mouvement : null,
      l.solde,
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 6 }, { wch: 18 }, { wch: 38 }, { wch: 18 },
    { wch: 14 }, { wch: 14 },
  ]

  const wsRef = ws['!ref']
  if (wsRef) {
    const range = XLSX.utils.decode_range(wsRef)
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        if (!ws[addr]) continue
        if (r === 0) {
          ws[addr].s = { font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F172A' } } }
        } else if (r === 1) {
          ws[addr].s = { font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F172A' } } }
        } else {
          ws[addr].s = { font: { name: 'Calibri', sz: 12 } }
          if ([6, 7].includes(c) && typeof ws[addr].v === 'number') {
            ws[addr].z = '#,##0.00'
          }
        }
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Grand Livre')
  dlXlsx(wb, nomFichier)
}
