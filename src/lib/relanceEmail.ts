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

// ─── SVG document inline (Gmail-safe : pas de flex, pas de shadow) ────────────
const SVG_PDF = `<svg width="10" height="11" viewBox="0 0 10 11" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:-1px;"><path d="M2 1.5h4.5L8.5 3.5v7H2v-9z" stroke="#0D9488" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 1.5v2h2" stroke="#0D9488" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 6.5h3M3.5 8h2" stroke="#4CC5BB" stroke-width="1.2" stroke-linecap="round"/></svg>`

function buildRow(f: FactureLigne): string {
  const retard = f.echeance ? joursDepuis(f.echeance) : null
  const estEchu = retard !== null && retard > 0

  // Badge retard / à venir
  const badgeDelai = retard === null ? '' : estEchu
    ? `<span style="display:inline-block;margin-left:6px;vertical-align:middle;background:#FEF2F2;border:1px solid #FECACA;color:#DC2626;font-size:10px;font-weight:700;padding:2px 6px;border-radius:20px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${retard}j</span>`
    : `<span style="display:inline-block;margin-left:6px;vertical-align:middle;background:#F0FDF4;border:1px solid #BBF7D0;color:#16A34A;font-size:10px;font-weight:700;padding:2px 6px;border-radius:20px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">−${Math.abs(retard)}j</span>`

  // N° facture : cliquable si PDF, sinon texte
  const numFacture = f.pdfUrl
    ? `<a href="${f.pdfUrl}" style="color:#0D9488;font-weight:600;font-size:14px;text-decoration:none;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${f.numero}</a>`
    : `<span style="color:#374151;font-weight:600;font-size:14px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${f.numero}</span>`

  // Badge PDF inline (uniquement si lien disponible)
  const badgePdf = f.pdfUrl
    ? `<a href="${f.pdfUrl}" style="display:inline-block;vertical-align:middle;margin-left:7px;background:#E6F7F5;border:1px solid rgba(76,197,187,0.3);border-radius:20px;padding:2px 7px;text-decoration:none;">${SVG_PDF}<span style="font-size:10px;font-weight:600;color:#0D9488;margin-left:3px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">PDF</span></a>`
    : ''

  // Montant restant : rouge si échu, navy sinon
  const couleurMontant = estEchu ? '#DC2626' : '#0E1A2B'

  return `
    <tr style="background:#ffffff;">
      <td style="padding:13px 16px;border-bottom:1px solid #F1F5F9;vertical-align:middle;">
        ${numFacture}${badgePdf}
      </td>
      <td style="padding:13px 16px;text-align:right;border-bottom:1px solid #F1F5F9;vertical-align:middle;white-space:nowrap;">
        <span style="font-size:15px;font-weight:700;color:${couleurMontant};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${_fmtEurosEmail.format(f.restedu)}</span>
      </td>
      <td style="padding:13px 16px;text-align:right;border-bottom:1px solid #F1F5F9;vertical-align:middle;white-space:nowrap;">
        <span style="font-size:13px;color:#6B7280;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${f.echeance ? fmtDate(f.echeance) : '—'}</span>${badgeDelai}
      </td>
    </tr>`
}

export function buildHtml(factures: FactureLigne[], signature: string | null): string {
  const totalReste = factures.reduce((s, f) => s + f.restedu, 0)
  const rows = factures.map(buildRow).join('')

  // Mention Ockham discrète sous le tableau
  const notePdf = `<p style="margin:0 0 24px;font-size:11px;color:#CBD5E1;text-align:right;letter-spacing:.03em;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Propulsé par <svg width="10" height="11" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:-2px;margin:0 2px;"><path d="M6 1L10.5 3.5v5L6 11 1.5 8.5v-5L6 1z" stroke="#CBD5E1" stroke-width="1.2" fill="none"/></svg> <a href="https://www.ockham-finance.com" style="color:#9CA3AF;font-weight:600;text-decoration:none;" target="_blank">Ockham Finance</a></p>`

  const sig = signature
    ? `<div style="border-left:3px solid #4CC5BB;padding:4px 0 4px 14px;margin-bottom:32px;">${signature}</div>`
    : ''

  return `
<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;max-width:600px;line-height:1.75;">

  <!-- Bandeau accent -->
  <div style="height:4px;background:linear-gradient(90deg,#0E1A2B 0%,#4CC5BB 100%);border-radius:4px 4px 0 0;margin-bottom:28px;"></div>

  <!-- Corps -->
  <p style="margin:0 0 10px;font-size:15px;color:#374151;line-height:1.75;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Bonjour,</p>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.75;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Nous nous permettons de vous adresser ce rappel concernant les factures suivantes qui restent à ce jour en attente de règlement.</p>

  <!-- Table factures -->
  <div style="border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;margin-bottom:8px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#E6F7F5;">
          <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;color:#0E1A2B;text-transform:uppercase;letter-spacing:.07em;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Facture</th>
          <th style="padding:11px 16px;text-align:right;font-size:11px;font-weight:700;color:#0E1A2B;text-transform:uppercase;letter-spacing:.07em;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Restant dû</th>
          <th style="padding:11px 16px;text-align:right;font-size:11px;font-weight:700;color:#0E1A2B;text-transform:uppercase;letter-spacing:.07em;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Échéance</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr style="background:#F8FAFC;border-top:1px solid #E2E8F0;">
          <td style="padding:13px 16px;font-weight:700;color:#0E1A2B;font-size:13px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Total à régler</td>
          <td style="padding:13px 16px;text-align:right;white-space:nowrap;">
            <span style="font-size:17px;font-weight:800;color:#DC2626;letter-spacing:-.02em;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${_fmtEurosEmail.format(totalReste)}</span>
          </td>
          <td style="padding:13px 16px;"></td>
        </tr>
      </tfoot>
    </table>
  </div>

  ${notePdf}

  <!-- Clôture -->
  <p style="margin:0 0 10px;font-size:15px;color:#374151;line-height:1.75;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais, ou de nous contacter directement en cas de question ou de litige.</p>
  <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.75;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Cordialement,</p>

  ${sig}


</div>`
}
