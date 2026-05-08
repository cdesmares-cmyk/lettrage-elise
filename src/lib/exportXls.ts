// Export XLS (HTML-as-Excel) sans dépendance externe
import type { FactureDetail } from '../types/client'

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : '—'
}

const TH = 'background:#0F172A;color:#FFFFFF;padding:8px 12px;font-size:11px;font-weight:700;border:1px solid #CBD5E1;text-align:left'
const TD = 'padding:7px 12px;font-size:11px;border:1px solid #E5E7EB;color:#374151;vertical-align:middle'
const TD_R = TD + ';text-align:right'

export function exporterXls(factures: FactureDetail[], nomFichier = 'extraction_compte_client') {
  const thead = `<thead><tr>
    <th style="${TH}">Code client</th>
    <th style="${TH}">N° Facture</th>
    <th style="${TH};text-align:right">Montant HT</th>
    <th style="${TH};text-align:right">Montant TTC</th>
    <th style="${TH};text-align:right">Restant Dû</th>
    <th style="${TH};text-align:center">Date émission</th>
    <th style="${TH};text-align:center">Date échéance</th>
    <th style="${TH}">Statut paiement</th>
    <th style="${TH}">Statut facture</th>
  </tr></thead>`

  const tbody = `<tbody>${factures.map((f, i) => {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    const restantColor = f.reste_du > 0.005 ? '#D97706' : '#059669'
    return `<tr style="background:${bg}">
      <td style="${TD};font-family:monospace;font-weight:700;color:#1D4ED8">${f.code_client}</td>
      <td style="${TD};font-family:monospace">${f.numero_piece}</td>
      <td style="${TD_R}">${f.montant_ht != null ? fmt(f.montant_ht) : '—'}</td>
      <td style="${TD_R}">${fmt(f.montant_ttc)}</td>
      <td style="${TD_R};font-weight:700;color:${restantColor}">${fmt(f.reste_du)}</td>
      <td style="${TD};text-align:center">${fmtDate(f.date_emission)}</td>
      <td style="${TD};text-align:center">${fmtDate(f.date_echeance)}</td>
      <td style="${TD}">${f.statut_paiement}</td>
      <td style="${TD}">${f.statut_facture ?? ''}</td>
    </tr>`
  }).join('')}</tbody>`

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"/><style>table{border-collapse:collapse;width:100%}</style></head>
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
