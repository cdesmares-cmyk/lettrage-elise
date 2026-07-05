// Edge Function — Relances automatiques
// Tourne sur cron quotidien. Pour chaque org avec relance_auto_active=true,
// envoie un email groupé (scénario niveau 1) aux clients éligibles via Resend.
// Déduplication : pas de re-relance si une relance auto a été envoyée
// dans les delai_rerelance_jours derniers jours.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY    = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL    = Deno.env.get('RESEND_FROM_RELANCE') ?? 'OCKHAM Relances <relances@ockham.finance>'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Formatage ────────────────────────────────────────────────────────────────

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

// ── Résolution des balises ───────────────────────────────────────────────────

function resolveBalises(texte: string, ctx: {
  nomClient: string
  codeClient: string
  montantDu: number
  nomOrg: string
}): string {
  const dateJour = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  return texte
    .replace(/\[Nom client\]/gi, ctx.nomClient)
    .replace(/\[Code client\]/gi, ctx.codeClient)
    .replace(/\[Montant dû\]/gi, fmtEuros(ctx.montantDu))
    .replace(/\[Date du jour\]/gi, dateJour)
    .replace(/\[Nom organisation\]/gi, ctx.nomOrg)
}

// ── Construction HTML email ──────────────────────────────────────────────────

const SVG_PDF = `<svg width="10" height="11" viewBox="0 0 10 11" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:-1px;"><path d="M2 1.5h4.5L8.5 3.5v7H2v-9z" stroke="#0D9488" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 1.5v2h2" stroke="#0D9488" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 6.5h3M3.5 8h2" stroke="#4CC5BB" stroke-width="1.2" stroke-linecap="round"/></svg>`

interface FactureLigne {
  numero: string
  montantTtc: number
  restedu: number
  echeance: string | null
  pdfUrl: string | null
}

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

function buildHtml(corps: string, factures: FactureLigne[], signature: string | null): string {
  const totalReste = factures.reduce((s, f) => s + f.restedu, 0)
  const rows = factures.map(buildRow).join('')
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
  </div>`
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

// ── Envoi Resend ─────────────────────────────────────────────────────────────

async function envoyerResend(to: string[], objet: string, html: string): Promise<string | null> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject: objet, html }),
  })
  if (!res.ok) {
    console.error('Resend error:', res.status, await res.text().catch(() => ''))
    return null
  }
  const data = await res.json() as { id?: string }
  return data.id ?? null
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const today = new Date().toISOString().split('T')[0]
    let nbEnvoyes = 0
    let nbSkip = 0
    let nbErreurs = 0

    // 1. Orgs avec mode auto actif
    const { data: orgs, error: errOrgs } = await supabase
      .from('organisations')
      .select('id, nom, delai_echeance_jours, delai_declenchement_relance_jours, delai_rerelance_jours, signature_auto')
      .eq('relance_auto_active', true)
    if (errOrgs) return json({ error: errOrgs.message }, 500)

    for (const org of (orgs ?? [])) {
      const orgId            = org.id as string
      const orgNom           = org.nom as string
      const delaiEcheanceOrg = (org.delai_echeance_jours as number) ?? 30
      const delaiDeclenche   = (org.delai_declenchement_relance_jours as number) ?? 7
      const delaiRerelance   = (org.delai_rerelance_jours as number) ?? 30
      const signatureAuto    = org.signature_auto as string | null

      // 2. Scénario niveau 1 de l'org
      const { data: scenarios } = await supabase
        .from('scenarios_relance')
        .select('id, objet, corps_texte')
        .eq('organisation_id', orgId)
        .order('niveau', { ascending: true })
        .limit(1)
      const scenario = scenarios?.[0]
      if (!scenario) {
        console.log(`[relance-auto] org ${orgId} : aucun scénario — skip`)
        continue
      }

      // 3. Clients éligibles — skip ceux en alerte bounce
      const { data: clients } = await supabase
        .from('clients')
        .select('code_dso, nom, delai_echeance_jours')
        .eq('organisation_id', orgId)
        .eq('relance_auto_active', true)
        .eq('relance_auto_alerte', false)
        .is('statut_juridique', null)
      if (!clients?.length) continue

      for (const client of clients) {
        const codeDso            = client.code_dso as string
        const nomClient          = client.nom as string
        const delaiEcheanceClient = (client.delai_echeance_jours as number | null) ?? delaiEcheanceOrg

        // 4. Déduplication : relance déjà envoyée dans la fenêtre ?
        const seuilDedup = new Date(Date.now() - delaiRerelance * 86_400_000).toISOString()
        const { data: dedup } = await supabase
          .from('relances_auto_log')
          .select('id')
          .eq('organisation_id', orgId)
          .eq('code_client', codeDso)
          .gte('envoye_le', seuilDedup)
          .limit(1)
        if (dedup?.length) { nbSkip++; continue }

        // 5. Contacts destinataires (relance > comptabilite)
        const { data: contacts } = await supabase
          .from('contacts_client')
          .select('email, role_contact')
          .eq('code_client', codeDso)
          .eq('actif', true)
          .in('role_contact', ['relance', 'comptabilite'])
        const relanceContacts  = (contacts ?? []).filter(c => c.role_contact === 'relance')
        const compteContacts   = (contacts ?? []).filter(c => c.role_contact === 'comptabilite')
        const destinataires    = (relanceContacts.length ? relanceContacts : compteContacts)
          .map(c => c.email as string).filter(Boolean)
        if (!destinataires.length) {
          console.log(`[relance-auto] ${codeDso} : aucun contact relance/compta — skip`)
          nbSkip++; continue
        }

        // 6. Factures éligibles
        // date_echeance présente → utiliser directement
        // date_echeance nulle   → date_emission + delaiEcheanceClient jours
        // Dans les deux cas : date_echeance_effective + delaiDeclenche <= today
        const { data: factures } = await supabase
          .from('factures')
          .select('numero_piece, montant_ttc, reste_du, date_echeance, date_emission, axonaut_pdf_url')
          .eq('code_client', codeDso)
          .eq('organisation_id', orgId)
          .eq('est_avoir', false)
          .gt('reste_du', 0.005)
        const facturesEligibles = (factures ?? []).filter(f => {
          const echeance = f.date_echeance
            ? new Date(f.date_echeance as string)
            : new Date(new Date(f.date_emission as string).getTime() + delaiEcheanceClient * 86_400_000)
          const declenchement = new Date(echeance.getTime() + delaiDeclenche * 86_400_000)
          return declenchement.toISOString().split('T')[0] <= today
        })
        if (!facturesEligibles.length) { nbSkip++; continue }

        // 7. Construction email
        const montantDu = facturesEligibles.reduce((s, f) => s + (f.reste_du as number), 0)
        const ctx = { nomClient, codeClient: codeDso, montantDu, nomOrg: orgNom }
        const objet = resolveBalises(scenario.objet as string, ctx)
        const corps = resolveBalises(scenario.corps_texte as string, ctx)
        const lignes: FactureLigne[] = facturesEligibles.map(f => ({
          numero: f.numero_piece as string,
          montantTtc: f.montant_ttc as number,
          restedu: f.reste_du as number,
          echeance: f.date_echeance as string | null,
          pdfUrl: f.axonaut_pdf_url as string | null,
        }))
        const html = buildHtml(corps, lignes, signatureAuto)

        // 8. Envoi Resend
        const resendId = await envoyerResend(destinataires, objet, html)
        if (!resendId) { nbErreurs++; continue }

        // 9. Log des envois (une entrée par facture pour traçabilité fine)
        const logs = facturesEligibles.map(f => ({
          organisation_id: orgId,
          code_client:     codeDso,
          numero_facture:  f.numero_piece as string,
          scenario_id:     scenario.id as string,
          statut:          'envoye',
          resend_id:       resendId,
          contact_email:   destinataires[0] ?? null,
          montant_total:   montantDu,
          corps_html:      html,
        }))
        await supabase.from('relances_auto_log').insert(logs)
        nbEnvoyes++
        console.log(`[relance-auto] ${codeDso} → ${destinataires.join(', ')} (${facturesEligibles.length} factures)`)
      }
    }

    await supabase.from('cron_runs').insert({
      fonction: 'relance-auto',
      statut: nbErreurs > 0 ? 'partiel' : 'ok',
      nb_traite: nbEnvoyes,
      message: `${nbEnvoyes} envoyés · ${nbSkip} skippés · ${nbErreurs} erreurs`,
    })

    return json({ ok: true, nbEnvoyes, nbSkip, nbErreurs })

  } catch (err) {
    console.error('[relance-auto] erreur non gérée:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
