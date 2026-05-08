// Export XLS (HTML-as-Excel) sans dépendance externe
// Les montants sont écrits en valeur brute + mso-number-format pour que SUM() fonctionne dans Excel
import type { FactureDetail } from '../types/client'

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : '—'
}

const NUM_FMT = 'mso-number-format:"# ##0.00 [$\\€-40C]"'
const TH = 'background:#0F172A;color:#FFFFFF;padding:8px 12px;font-size:11px;font-weight:700;border:1px solid #CBD5E1;text-align:left'
const TD = 'padding:7px 12px;font-size:11px;border:1px solid #E5E7EB;color:#374151;vertical-align:middle'
const TD_R = `${TD};text-align:right;${NUM_FMT}`

function numCell(val: number | null, style: string, color?: string): string {
  if (val == null) return `<td style="${TD};text-align:right">—</td>`
  const colorStyle = color ? `;color:${color};font-weight:700` : ''
  return `<td style="${style}${colorStyle}">${val.toFixed(2)}</td>`
}

export interface LigneExtractionLettrage {
  id: string
  date_lettrage: string
  libelle_bancaire: string | null
  code_client: string
  numero_facture: string
  montant: number
  commentaire: string | null
}

export function exporterExtractionXls(lignes: LigneExtractionLettrage[], nomFichier = 'extraction_lettrages') {
  const thead = `<thead><tr>
    <th style="${TH}">Date</th>
    <th style="${TH}">Ligne bancaire</th>
    <th style="${TH}">Code client</th>
    <th style="${TH}">N° Facture</th>
    <th style="${TH};text-align:right;${NUM_FMT}">Montant attribué</th>
    <th style="${TH}">Commentaire</th>
  </tr></thead>`

  const tbody = `<tbody>${lignes.map((l, i) => {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    return `<tr style="background:${bg}">
      <td style="${TD}">${fmtDate(l.date_lettrage)}</td>
      <td style="${TD}">${l.libelle_bancaire ?? '—'}</td>
      <td style="${TD};font-family:monospace;font-weight:700;color:#1D4ED8">${l.code_client}</td>
      <td style="${TD};font-family:monospace">${l.numero_facture}</td>
      ${numCell(l.montant, TD_R)}
      <td style="${TD}">${l.commentaire ?? ''}</td>
    </tr>`
  }).join('')}</tbody>`

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"/>
    <style>table{border-collapse:collapse;width:100%} td,th{white-space:nowrap}</style>
    </head>
    <body><table>${thead}${tbody}</table></body></html>`

  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nomFichier}.xls`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exporterXls(factures: FactureDetail[], nomFichier = 'extraction_compte_client') {
  const thead = `<thead><tr>
    <th style="${TH}">Code client</th>
    <th style="${TH}">Type</th>
    <th style="${TH}">N° Facture</th>
    <th style="${TH};text-align:right;${NUM_FMT}">Montant HT</th>
    <th style="${TH};text-align:right;${NUM_FMT}">Montant TTC</th>
    <th style="${TH};text-align:right;${NUM_FMT}">Restant Dû</th>
    <th style="${TH};text-align:center">Date émission</th>
    <th style="${TH};text-align:center">Date échéance</th>
    <th style="${TH}">Statut paiement</th>
    <th style="${TH}">Statut facture</th>
  </tr></thead>`

  const tbody = `<tbody>${factures.map((f, i) => {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    const restantColor = f.reste_du <= 0.005 ? '#059669' : f.reste_du >= f.montant_ttc - 0.005 ? '#DC2626' : '#D97706'
    const isAvoir = f.est_avoir || f.montant_ttc < 0
    return `<tr style="background:${bg}">
      <td style="${TD};font-family:monospace;font-weight:700;color:#1D4ED8">${f.code_client}</td>
      <td style="${TD};text-align:center;font-weight:700;color:${isAvoir ? '#EA580C' : '#2563EB'}">${isAvoir ? 'A' : 'F'}</td>
      <td style="${TD};font-family:monospace">${f.numero_piece}</td>
      ${numCell(f.montant_ht, TD_R)}
      ${numCell(f.montant_ttc, TD_R)}
      ${numCell(f.reste_du, TD_R, restantColor)}
      <td style="${TD};text-align:center">${fmtDate(f.date_emission)}</td>
      <td style="${TD};text-align:center">${fmtDate(f.date_echeance)}</td>
      <td style="${TD}">${f.statut_paiement}</td>
      <td style="${TD}">${f.statut_facture ?? ''}</td>
    </tr>`
  }).join('')}</tbody>`

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"/>
    <style>table{border-collapse:collapse;width:100%} td,th{white-space:nowrap}</style>
    </head>
    <body><table>${thead}${tbody}</table></body></html>`

  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nomFichier}.xls`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
