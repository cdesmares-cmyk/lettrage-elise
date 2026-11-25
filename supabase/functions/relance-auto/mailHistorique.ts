// Le mail de relance tel qu'il etait avant le 2026-11-25. FILET DE SECURITE.
//
// Mise en page en <div>, degrades, SVG en ligne, border-radius : il s'affichait
// bien chez Gmail et se disloquait ailleurs. C'est la raison de la refonte,
// decrite dans src/lib/relanceEmail.ts.
//
// Il reste joignable en basculant UTILISER_MODELE_HISTORIQUE a true dans
// index.ts, puis en redeployant la fonction. A SUPPRIMER une fois la refonte
// validee en production, avec son pendant src/lib/relanceEmailHistorique.ts.

function fmtEuros(n: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

interface FactureLigne {
  numero: string
  montantTtc: number
  restedu: number
  echeance: string | null
  pdfUrl: string | null
}

interface AvoirLigne {
  numero: string
  montant: number
  echeance: string | null
}

const SVG_PDF = `<svg width="10" height="11" viewBox="0 0 10 11" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:-1px;"><path d="M2 1.5h4.5L8.5 3.5v7H2v-9z" stroke="#0D9488" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 1.5v2h2" stroke="#0D9488" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 6.5h3M3.5 8h2" stroke="#4CC5BB" stroke-width="1.2" stroke-linecap="round"/></svg>`

function buildRow(f: FactureLigne): string {
  const retard = f.echeance ? joursDepuis(f.echeance) : null
  const estEchu = retard !== null && retard > 0
  const badgeDelai = retard === null ? '' : estEchu
    ? `<span style="display:inline-block;margin-left:6px;vertical-align:middle;background:#FEF2F2;border:1px solid #FECACA;color:#DC2626;font-size:10px;font-weight:700;padding:2px 6px;border-radius:20px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${retard}j</span>`
    : `<span style="display:inline-block;margin-left:6px;vertical-align:middle;background:#F0FDF4;border:1px solid #BBF7D0;color:#16A34A;font-size:10px;font-weight:700;padding:2px 6px;border-radius:20px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">−${Math.abs(retard)}j</span>`
  const numFacture = f.pdfUrl
    ? `<a href="${f.pdfUrl}" style="color:#0D9488;font-weight:600;font-size:14px;text-decoration:none;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${f.numero}</a>`
    : `<span style="color:#374151;font-weight:600;font-size:14px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${f.numero}</span>`
  const badgePdf = f.pdfUrl
    ? `<a href="${f.pdfUrl}" style="display:inline-block;vertical-align:middle;margin-left:7px;background:#E6F7F5;border:1px solid rgba(76,197,187,0.3);border-radius:20px;padding:1px 12px 2px;text-decoration:none;">${SVG_PDF}<span style="font-size:10px;font-weight:600;color:#0D9488;margin-left:3px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;vertical-align:middle;">PDF</span></a>`
    : ''
  const couleurMontant = estEchu ? '#DC2626' : '#0E1A2B'
  return `<tr style="background:#ffffff;">
    <td style="padding:14px 16px;border-bottom:1px solid #F1F5F9;vertical-align:middle;">
      ${numFacture}${badgePdf}${badgeDelai}
    </td>
    <td style="padding:14px 16px;border-bottom:1px solid #F1F5F9;text-align:right;white-space:nowrap;vertical-align:middle;">
      <span style="font-size:14px;font-weight:700;color:${couleurMontant};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${fmtEuros(f.restedu)}</span>
    </td>
    <td style="padding:14px 16px;border-bottom:1px solid #F1F5F9;text-align:right;white-space:nowrap;vertical-align:middle;">
      <span style="font-size:13px;color:#6B7280;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${fmtDate(f.echeance)}</span>
    </td>
  </tr>`
}

function textToHtmlBlocs(texte: string): string {
  return texte.split(/\n{2,}/).filter(p => p.trim()).map(p =>
    `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.75;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${p.trim().replace(/\n/g, '<br>')}</p>`
  ).join('')
}

function buildAvoirsBlock(avoirs: AvoirLigne[]): string {
  if (!avoirs.length) return ''
  const total = avoirs.reduce((s, a) => s + Math.abs(a.montant), 0)
  const rows = avoirs.map(a => `<tr>
    <td style="padding:10px 16px;border-bottom:1px solid #F0FDF4;font-size:13px;color:#374151;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${a.numero}</td>
    <td style="padding:10px 16px;border-bottom:1px solid #F0FDF4;text-align:right;white-space:nowrap;">
      <span style="font-size:13px;font-weight:700;color:#16A34A;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${fmtEuros(Math.abs(a.montant))}</span>
    </td>
    <td style="padding:10px 16px;border-bottom:1px solid #F0FDF4;text-align:right;white-space:nowrap;">
      <span style="font-size:12px;color:#6B7280;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${fmtDate(a.echeance)}</span>
    </td>
  </tr>`).join('')
  return `<div style="border-radius:12px;border:1px solid #BBF7D0;background:#F0FDF4;overflow:hidden;margin-top:16px;margin-bottom:8px;">
  <div style="padding:10px 16px 8px;border-bottom:1px solid #BBF7D0;">
    <span style="font-size:11px;font-weight:700;color:#15803D;text-transform:uppercase;letter-spacing:.07em;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Avoir${avoirs.length > 1 ? 's' : ''} disponible${avoirs.length > 1 ? 's' : ''} — ${fmtEuros(total)} à déduire</span>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    <tbody>${rows}</tbody>
  </table>
</div>`
}

export function buildHtmlHistorique(corps: string, factures: FactureLigne[], signature: string | null, avoirs: AvoirLigne[] = []): string {
  const totalReste = factures.reduce((s, f) => s + f.restedu, 0)
  const rows = factures.map(buildRow).join('')
  const avoirsBlock = buildAvoirsBlock(avoirs)
  const tableBlock = `
  <div style="border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;margin-bottom:8px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#E6F7F5;">
          <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;color:#0E1A2B;text-transform:uppercase;letter-spacing:.07em;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Facture</th>
          <th style="padding:11px 16px;text-align:right;font-size:11px;font-weight:700;color:#0E1A2B;text-transform:uppercase;letter-spacing:.07em;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Restant dû</th>
          <th style="padding:11px 16px;text-align:right;font-size:11px;font-weight:700;color:#0E1A2B;text-transform:uppercase;letter-spacing:.07em;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Échéance</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#F8FAFC;border-top:1px solid #E2E8F0;">
          <td style="padding:13px 16px;font-weight:700;color:#0E1A2B;font-size:13px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Total à régler</td>
          <td style="padding:13px 16px;text-align:right;white-space:nowrap;">
            <span style="font-size:17px;font-weight:800;color:#DC2626;letter-spacing:-.02em;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${fmtEuros(totalReste)}</span>
          </td>
          <td style="padding:13px 16px;"></td>
        </tr>
      </tfoot>
    </table>
  </div>${avoirsBlock}`
  const sig = signature
    ? `<div style="border-left:3px solid #4CC5BB;padding:4px 0 4px 14px;margin-bottom:32px;">${textToHtmlBlocs(signature)}</div>`
    : ''
  const segments = corps.split(/\[Tableau Factures\]/i)
  let bodyHtml = ''
  segments.forEach((seg, i) => {
    bodyHtml += textToHtmlBlocs(seg)
    if (i < segments.length - 1) bodyHtml += tableBlock
  })
  return `<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;color:#374151;max-width:600px;line-height:1.75;">
  <div style="height:4px;background:linear-gradient(90deg,#0E1A2B 0%,#4CC5BB 100%);border-radius:4px 4px 0 0;margin-bottom:28px;"></div>
  ${bodyHtml}${sig}
</div>`
}
