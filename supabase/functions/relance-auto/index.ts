// Edge Function — Relances automatiques
// Tourne sur cron quotidien. Pour chaque org avec relance_auto_active=true,
// envoie un email groupé (scénario niveau 1) aux clients éligibles via Resend.
// Déduplication : pas de re-relance si une relance auto a été envoyée
// dans les delai_rerelance_jours derniers jours.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY    = Deno.env.get('RESEND_API_KEY')!
const CRON_SECRET   = Deno.env.get('CRON_SECRET') ?? ''
const FROM_EMAIL    = Deno.env.get('RESEND_FROM_RELANCE') ?? 'OCKHAM Relances <relances@ockham.finance>'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
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

interface AvoirLigne {
  numero: string
  montant: number
  echeance: string | null
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

function buildHtml(corps: string, factures: FactureLigne[], signature: string | null, avoirs: AvoirLigne[] = []): string {
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

// ── Envoi Resend Batch (jusqu'à 100 emails par appel) ───────────────────────

interface EmailPayload { from: string; to: string[]; subject: string; html: string }
interface PendingEmail {
  to: string[]; objet: string; html: string
  codeDso: string; nomClient: string; montantDu: number
  facturesEligibles: { numero_piece: string; montant_ttc: number; reste_du: number; date_echeance: string | null; axonaut_pdf_url: string | null }[]
  scenarioId: string
}

async function envoyerResendBatch(emails: EmailPayload[]): Promise<(string | null)[]> {
  try {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emails),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      console.error('[relance-auto] Resend batch error:', res.status, await res.text().catch(() => ''))
      return emails.map(() => null)
    }
    const data = await res.json() as { data?: { id: string }[] }
    return (data.data ?? []).map(d => d.id ?? null)
  } catch (err) {
    console.error('[relance-auto] Resend batch timeout:', err)
    return emails.map(() => null)
  }
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET)
    return json({ error: 'unauthorized' }, 401)

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
      let nbEnvoyesOrg = 0
      let nbSkipOrg    = 0
      let nbErreursOrg = 0

      // 2. Scénario niveau 1 de l'org
      const { data: scenarios } = await supabase
        .from('scenarios_relance')
        .select('id, objet, corps_texte')
        .eq('organisation_id', orgId)
        .order('niveau', { ascending: true })
        .limit(1)
      const scenario = scenarios?.[0]
      if (!scenario) { console.log(`[relance-auto] org ${orgId} : aucun scénario — skip`); continue }

      // 3. Clients éligibles
      const { data: clients } = await supabase
        .from('clients')
        .select('code_dso, nom, delai_echeance_jours')
        .eq('organisation_id', orgId)
        .eq('relance_auto_active', true)
        .eq('relance_auto_alerte', false)
        .is('statut_juridique', null)
      if (!clients?.length) {
        await supabase.from('organisations').update({
          relance_auto_derniere_exec:   new Date().toISOString(),
          relance_auto_dernier_statut:  'ok',
          relance_auto_dernier_message: '0 envoyé · 0 ignoré · 0 erreur',
        } as never).eq('id', orgId)
        continue
      }

      // 4. Chargement batch : dédup + contacts + factures + avoirs + crédits 411 en 5 requêtes
      const seuilDedup = new Date(Date.now() - delaiRerelance * 86_400_000).toISOString()
      const [dedupRes, contactsRes, facturesRes, avoirsRes, credits411Res] = await Promise.all([
        supabase.from('relances_auto_log').select('code_client')
          .eq('organisation_id', orgId).gte('envoye_le', seuilDedup),
        supabase.from('contacts_client').select('code_client, email, role_contact')
          .eq('organisation_id', orgId).eq('actif', true).in('role_contact', ['relance', 'comptabilite']),
        // P1 : exclure les pseudo-factures 411 des relances automatiques
        supabase.from('factures').select('code_client, numero_piece, montant_ttc, reste_du, date_echeance, date_emission, axonaut_pdf_url')
          .eq('organisation_id', orgId).eq('est_avoir', false).gt('reste_du', 0.005)
          .not('numero_piece', 'like', '411_%'),
        supabase.from('factures').select('code_client, numero_piece, montant_ttc, reste_du, date_echeance, date_emission')
          .eq('organisation_id', orgId).eq('est_avoir', true).neq('reste_du', 0),
        // P3 : crédits 411 non dispatchés pour bloquer la relance si dette couverte
        supabase.from('factures').select('code_client, reste_du')
          .eq('organisation_id', orgId).like('numero_piece', '411_%').lt('reste_du', -0.005),
      ])

      const dedupSet = new Set((dedupRes.data ?? []).map((r: { code_client: string }) => r.code_client))

      // P3 : somme des crédits 411 par client (valeurs négatives)
      const credits411Map = new Map<string, number>()
      for (const c of (credits411Res.data ?? [])) {
        const k = c.code_client as string
        credits411Map.set(k, (credits411Map.get(k) ?? 0) + (c.reste_du as number))
      }

      const contactsMap = new Map<string, { email: string; role_contact: string }[]>()
      for (const c of (contactsRes.data ?? [])) {
        const k = c.code_client as string
        if (!contactsMap.has(k)) contactsMap.set(k, [])
        contactsMap.get(k)!.push({ email: c.email as string, role_contact: c.role_contact as string })
      }

      const facturesMap = new Map<string, { numero_piece: string; montant_ttc: number; reste_du: number; date_echeance: string | null; date_emission: string; axonaut_pdf_url: string | null }[]>()
      for (const f of (facturesRes.data ?? [])) {
        const k = f.code_client as string
        if (!facturesMap.has(k)) facturesMap.set(k, [])
        facturesMap.get(k)!.push({
          numero_piece:    f.numero_piece as string,
          montant_ttc:     f.montant_ttc as number,
          reste_du:        f.reste_du as number,
          date_echeance:   f.date_echeance as string | null,
          date_emission:   f.date_emission as string,
          axonaut_pdf_url: f.axonaut_pdf_url as string | null,
        })
      }

      const avoirsMap = new Map<string, { numero_piece: string; montant_ttc: number; reste_du: number; date_echeance: string | null; date_emission: string }[]>()
      for (const a of (avoirsRes.data ?? [])) {
        const k = a.code_client as string
        if (!avoirsMap.has(k)) avoirsMap.set(k, [])
        avoirsMap.get(k)!.push({
          numero_piece:  a.numero_piece as string,
          montant_ttc:   a.montant_ttc as number,
          reste_du:      a.reste_du as number,
          date_echeance: a.date_echeance as string | null,
          date_emission: a.date_emission as string,
        })
      }

      // 5. Préparer les emails en mémoire
      const pending: PendingEmail[] = []

      for (const client of clients) {
        const codeDso             = client.code_dso as string
        const nomClient           = client.nom as string
        const delaiEcheanceClient = (client.delai_echeance_jours as number | null) ?? delaiEcheanceOrg

        if (dedupSet.has(codeDso)) { nbSkip++; nbSkipOrg++; continue }

        const contacts       = contactsMap.get(codeDso) ?? []
        const relanceC       = contacts.filter(c => c.role_contact === 'relance')
        const compteC        = contacts.filter(c => c.role_contact === 'comptabilite')
        const destinataires  = (relanceC.length ? relanceC : compteC).map(c => c.email).filter(Boolean)
        if (!destinataires.length) { nbSkip++; nbSkipOrg++; continue }

        const facturesEligibles = (facturesMap.get(codeDso) ?? []).filter(f => {
          const echeance     = f.date_echeance
            ? new Date(f.date_echeance)
            : new Date(new Date(f.date_emission).getTime() + delaiEcheanceClient * 86_400_000)
          const declenchement = new Date(echeance.getTime() + delaiDeclenche * 86_400_000)
          return declenchement.toISOString().split('T')[0] <= today
        })
        if (!facturesEligibles.length) { nbSkip++; nbSkipOrg++; continue }

        const montantDu   = facturesEligibles.reduce((s, f) => s + f.reste_du, 0)
        // P3 : si les crédits 411 non dispatchés couvrent totalement la dette, pas de relance
        const credit411   = credits411Map.get(codeDso) ?? 0  // valeur négative
        const montantNet  = montantDu + credit411
        if (montantNet <= 0.005) { nbSkip++; nbSkipOrg++; continue }

        const ctx         = { nomClient, codeClient: codeDso, montantDu, nomOrg: orgNom }
        const objet     = resolveBalises(scenario.objet as string, ctx)
        const corps     = resolveBalises(scenario.corps_texte as string, ctx)
        const lignes: FactureLigne[] = facturesEligibles.map(f => ({
          numero: f.numero_piece, montantTtc: f.montant_ttc, restedu: f.reste_du,
          echeance: f.date_echeance, pdfUrl: f.axonaut_pdf_url,
        }))
        const avoirsEligibles = (avoirsMap.get(codeDso) ?? []).filter(a => {
          const echeance      = a.date_echeance
            ? new Date(a.date_echeance)
            : new Date(new Date(a.date_emission).getTime() + delaiEcheanceClient * 86_400_000)
          const declenchement = new Date(echeance.getTime() + delaiDeclenche * 86_400_000)
          return declenchement.toISOString().split('T')[0] <= today
        })
        const lignesAvoirs: AvoirLigne[] = avoirsEligibles.map(a => ({
          numero: a.numero_piece, montant: a.reste_du, echeance: a.date_echeance,
        }))
        const html = buildHtml(corps, lignes, signatureAuto, lignesAvoirs)

        pending.push({ to: destinataires, objet, html, codeDso, nomClient, montantDu, facturesEligibles, scenarioId: scenario.id as string })
      }

      // 6. Envoi par batch de 100 + logs en batch
      const BATCH_SIZE = 100
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch   = pending.slice(i, i + BATCH_SIZE)
        const payload = batch.map(p => ({ from: FROM_EMAIL, to: p.to, subject: p.objet, html: p.html }))
        const ids     = await envoyerResendBatch(payload)

        const logsAInserer: object[] = []
        for (let j = 0; j < batch.length; j++) {
          const resendId = ids[j] ?? null
          if (!resendId) { nbErreurs++; nbErreursOrg++; continue }
          const p = batch[j]
          for (const f of p.facturesEligibles) {
            logsAInserer.push({
              organisation_id: orgId, code_client: p.codeDso, numero_facture: f.numero_piece,
              scenario_id: p.scenarioId, statut: 'envoye', resend_id: resendId,
              contact_email: p.to[0] ?? null, montant_total: p.montantDu, corps_html: p.html,
            })
          }
          nbEnvoyes++; nbEnvoyesOrg++
          console.log(`[relance-auto] ${p.codeDso} → ${p.to.join(', ')} (${p.facturesEligibles.length} factures)`)
        }
        if (logsAInserer.length) await supabase.from('relances_auto_log').insert(logsAInserer)
      }

      await supabase.from('organisations').update({
        relance_auto_derniere_exec:   new Date().toISOString(),
        relance_auto_dernier_statut:  nbErreursOrg > 0 ? 'partiel' : 'ok',
        relance_auto_dernier_message: `${nbEnvoyesOrg} envoyé${nbEnvoyesOrg !== 1 ? 's' : ''} · ${nbSkipOrg} ignoré${nbSkipOrg !== 1 ? 's' : ''} · ${nbErreursOrg} erreur${nbErreursOrg !== 1 ? 's' : ''}`,
      } as never).eq('id', orgId)
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
