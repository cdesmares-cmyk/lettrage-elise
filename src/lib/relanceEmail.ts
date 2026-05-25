export type FactureLigne = {
  numero: string
  montantTtc: number
  restedu: number
  echeance: string | null
  pdfUrl?: string | null
}

const _fmtEuros      = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const _fmtEurosEmail = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtEuros(n: number)      { return _fmtEuros.format(n) }
export function fmtEurosEmail(n: number) { return _fmtEurosEmail.format(n) }
export function fmtDate(iso: string)     { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) }
export function joursDepuis(iso: string) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) }

export function buildCorps(factures: FactureLigne[]) {
  const lignes = factures.map(f =>
    `  • Facture ${f.numero} — ${fmtEuros(f.montantTtc)} TTC — Restant dû : ${fmtEuros(f.restedu)}${f.echeance ? ` — éch. ${fmtDate(f.echeance)}` : ''}`
  ).join('\n')
  return `Bonjour,\n\nNous nous permettons de vous contacter au sujet des factures suivantes en attente de règlement :\n\n${lignes}\n\nNous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais, ou de nous contacter en cas de question ou de litige.\n\nCordialement`
}

export function buildHtml(factures: FactureLigne[], signature: string | null): string {
  const totalTtc   = factures.reduce((s, f) => s + f.montantTtc, 0)
  const totalReste = factures.reduce((s, f) => s + f.restedu, 0)

  const rows = factures.map(f => {
    const retard = f.echeance ? Math.floor((Date.now() - new Date(f.echeance).getTime()) / 86_400_000) : null
    const retardLabel = retard === null ? '—' : retard <= 0 ? '—' : `<span style="color:#dc2626;font-weight:600;">${retard}j</span>`
    return `
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid #edf1f5;border-left:1px solid #e2e8f0;">
        ${f.pdfUrl
          ? `<a href="${f.pdfUrl}" style="font-family:monospace;font-weight:600;color:#374151;text-decoration:underline;">${f.numero}</a>`
          : `<span style="font-family:monospace;font-weight:600;color:#374151;">${f.numero}</span>`}
      </td>
      <td style="padding:8px 14px;border-bottom:1px solid #edf1f5;text-align:right;color:#374151;white-space:nowrap;">${fmtEurosEmail(f.montantTtc)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #edf1f5;text-align:right;font-weight:600;color:#374151;white-space:nowrap;">${fmtEurosEmail(f.restedu)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #edf1f5;text-align:center;border-right:1px solid #e2e8f0;">${retardLabel}</td>
    </tr>`
  }).join('')

  const table = `
    <table style="width:100%;border-collapse:collapse;margin:20px 0;box-shadow:0 1px 4px rgba(14,26,43,0.06);">
      <thead>
        <tr style="background:linear-gradient(135deg,#0E1A2B 0%,#1a2d44 100%);">
          <th style="padding:9px 14px;text-align:left;font-size:11px;color:#4CC5BB;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Facture</th>
          <th style="padding:9px 14px;text-align:right;font-size:11px;color:#4CC5BB;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Total TTC</th>
          <th style="padding:9px 14px;text-align:right;font-size:11px;color:#4CC5BB;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Restant Dû TTC</th>
          <th style="padding:9px 14px;text-align:center;font-size:11px;color:#4CC5BB;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Retard</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr style="background:#f8fafc;border-top:1px solid #e2e8f0;">
          <td style="padding:9px 14px;font-weight:700;color:#0E1A2B;font-size:13px;border-left:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">Total</td>
          <td style="padding:9px 14px;text-align:right;font-weight:700;color:#0E1A2B;white-space:nowrap;font-size:13px;border-bottom:1px solid #e2e8f0;">${fmtEurosEmail(totalTtc)}</td>
          <td style="padding:9px 14px;text-align:right;font-weight:700;color:#dc2626;white-space:nowrap;font-size:13px;border-bottom:1px solid #e2e8f0;">${fmtEurosEmail(totalReste)}</td>
          <td style="border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;"></td>
        </tr>
      </tbody>
    </table>`

  const sig = signature ? `<br><div>${signature}</div>` : ''

  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;line-height:1.6;">
    <p>Bonjour,</p>
    <p>Nous nous permettons de vous contacter au sujet des factures suivantes en attente de règlement :</p>
    ${table}
    <p>Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais, ou de nous contacter en cas de question ou de litige.</p>
    <p>Cordialement</p>
    ${sig}
  </div>`
}
