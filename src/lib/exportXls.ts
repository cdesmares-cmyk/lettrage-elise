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

// ── Historique relances (auto + manuelles) ────────────────────────────────────

export interface LigneRelanceAuto {
  date: string
  type: 'Auto' | 'Manuelle'
  code_client: string
  nom_client: string
  montant_total: number | null
  emails: string
  statut: string
  commentaire: string
  nb_factures: number
}

export function exporterRelancesAutoXls(lignes: LigneRelanceAuto[], nomFichier = 'extraction_relances') {
  const aoa: (string | number | null)[][] = [
    ['Date', 'Type', 'Code client', 'Nom client', 'Montant relancé', 'Email(s) contact', 'Statut', 'Commentaire', 'Nb factures'],
  ]
  for (const l of lignes) {
    aoa.push([
      fmtDate(l.date),
      l.type,
      l.code_client,
      l.nom_client,
      l.montant_total ?? '',
      l.emails,
      l.statut,
      l.commentaire,
      l.nb_factures,
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 36 }, { wch: 10 }, { wch: 30 }, { wch: 12 }]
  styleSheet(ws, [4])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Relances')
  dlXlsx(wb, nomFichier)
}

// ── Grand Livre client ────────────────────────────────────────────────────────
export interface LigneGrandLivre {
  date: string          // DD/MM/YYYY
  type: string          // Facture | Avoir | Règlement | Import | Correction
  ref_paiement: string  // id_ligne_bancaire (avec -C si correction)
  libelle: string       // libellé bancaire, description import, ou label correction
  commentaire: string   // commentaire opérateur (lettrages.commentaire)
  numero_piece: string
  ref: string           // lettre A/B/C... regroupant les lignes d'un même virement
  debit: number | null
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
  // 10 colonnes : Date | Type | Réf. | Réf paiement | Libellé | Commentaire | N° Pièce | Débit | Crédit | Solde
  // Débit : facture émise (dette augmente) — valeur positive
  // Crédit : règlement / avoir / correction / import (dette diminue) — valeur positive
  const totalDebit  = lignes.reduce((s, l) => s + (l.debit  ?? 0), 0)
  const totalCredit = lignes.reduce((s, l) => s + (l.credit ?? 0), 0)
  const soldeFinal  = lignes.length > 0 ? lignes[lignes.length - 1].solde : soldeOuverture

  const aoa: (string | number | null)[][] = [
    [`Grand Livre — ${nomClient} (${codeClient}) — Période : ${dateDebut} → ${dateFin}`, null, null, null, null, null, null, null, null, null],
    ['Date', 'Type', 'Réf.', 'Réf paiement', 'Libellé bancaire', 'Commentaire', 'N° Pièce', 'Débit', 'Crédit', 'Solde'],
    [dateDebut, 'Solde d\'ouverture', '', '', '', '', '', null, null, soldeOuverture],
  ]

  for (const l of lignes) {
    aoa.push([
      l.date,
      l.type,
      l.ref,
      l.ref_paiement,
      l.libelle,
      l.commentaire,
      l.numero_piece,
      l.debit,
      l.credit,
      l.solde,
    ])
  }

  aoa.push(['', 'TOTAL', '', '', '', '', '', totalDebit, totalCredit, soldeFinal])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 6 }, { wch: 18 }, { wch: 36 },
    { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ]

  const wsRef = ws['!ref']
  if (wsRef) {
    const range = XLSX.utils.decode_range(wsRef)
    const lastRow = range.e.r
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        if (!ws[addr]) continue
        if (r === 0) {
          ws[addr].s = { font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F172A' } } }
        } else if (r === 1) {
          ws[addr].s = { font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F172A' } } }
        } else if (r === lastRow) {
          ws[addr].s = { font: { name: 'Calibri', sz: 12, bold: true }, fill: { fgColor: { rgb: 'F1F5F9' } } }
          if ([7, 8, 9].includes(c) && typeof ws[addr].v === 'number') ws[addr].z = '#,##0.00'
        } else {
          ws[addr].s = { font: { name: 'Calibri', sz: 12 } }
          if ([7, 8, 9].includes(c) && typeof ws[addr].v === 'number') ws[addr].z = '#,##0.00'
        }
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Grand Livre')
  dlXlsx(wb, nomFichier)
}
