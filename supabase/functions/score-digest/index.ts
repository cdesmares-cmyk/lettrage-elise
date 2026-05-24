// Edge Function — Digest email quotidien des alertes score client
// Appelée par cron à 7h30 — envoie un mail par organisation aux admins + responsables
// Format : top 10 clients à risque du jour, lien fiche client OCKHAM

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY    = Deno.env.get('RESEND_API_KEY')!
const APP_URL       = Deno.env.get('APP_URL') ?? 'https://app.ockham-finance.com'
const FROM_EMAIL    = Deno.env.get('RESEND_FROM') ?? 'OCKHAM Veille <alerte@ockham-finance.com>'

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

function formatEuros(n: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'
}

function badgeScore(score: number): string {
  const [bg, txt] =
    score >= 70 ? ['#FEE2E2', '#B91C1C'] :
    score >= 40 ? ['#FEF3C7', '#92400E'] :
                  ['#D1FAE5', '#065F46']
  return `<span style="display:inline-block;background:${bg};color:${txt};font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">${score}</span>`
}

interface AlereteRow {
  code_client: string
  nom_client: string | null
  encours_ttc: number
  retard_max_jours: number
  score_risque: number
}

function buildDigest(alertes: AlereteRow[], date: string): string {
  const lignes = alertes.slice(0, 10).map((a, i) => {
    const lien = `${APP_URL}/compte-client?client=${encodeURIComponent(a.code_client)}`
    return `<tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 8px;font-size:13px;color:#6b7280;text-align:center;">${i + 1}</td>
      <td style="padding:10px 8px;">
        <div style="font-size:13px;font-weight:600;color:#111827;">${a.nom_client ?? a.code_client}</div>
        <div style="font-size:11px;color:#9ca3af;font-family:monospace;">${a.code_client}</div>
      </td>
      <td style="padding:10px 8px;font-size:13px;font-weight:600;color:#111827;text-align:right;">${formatEuros(a.encours_ttc)}</td>
      <td style="padding:10px 8px;font-size:13px;color:#374151;text-align:center;">${a.retard_max_jours}j</td>
      <td style="padding:10px 8px;text-align:center;">${badgeScore(a.score_risque)}</td>
      <td style="padding:10px 8px;text-align:center;">
        <a href="${lien}" style="font-size:12px;color:#4CC5BB;font-weight:600;text-decoration:none;">Voir →</a>
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <!-- En-tête -->
        <tr>
          <td style="background:#0E1A2B;padding:24px 40px;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle;padding-right:12px;">
                <div style="width:40px;height:40px;border-radius:10px;background:rgba(76,197,187,0.1);border:1.5px solid rgba(76,197,187,0.25);text-align:center;line-height:40px;">
                  <span style="color:#4CC5BB;font-size:22px;font-weight:900;">O</span>
                </div>
              </td>
              <td style="vertical-align:middle;">
                <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">OCKHAM</span>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Titre -->
        <tr>
          <td style="padding:32px 40px 0;">
            <h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;">Alertes Score Client</h1>
            <p style="margin:6px 0 0;font-size:14px;color:#6b7280;">Digest du ${date} — top ${Math.min(alertes.length, 10)} client(s) identifiés à risque</p>
          </td>
        </tr>

        <!-- Tableau -->
        <tr>
          <td style="padding:24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <thead>
                <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb;">
                  <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:center;">#</th>
                  <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:left;">Client</th>
                  <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:right;">Encours TTC</th>
                  <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:center;">Retard max</th>
                  <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:center;">Score</th>
                  <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:center;">Fiche</th>
                </tr>
              </thead>
              <tbody>${lignes}</tbody>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 40px 40px;text-align:center;">
            <a href="${APP_URL}/relances" style="display:inline-block;background:#0E1A2B;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500;">
              Voir toutes les alertes dans OCKHAM
            </a>
          </td>
        </tr>

        <!-- Pied -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.8;">
              Digest automatique OCKHAM — Score calculé chaque jour à 6h00.<br>
              &copy; 2025 OCKHAM Finance.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function envoyerEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.warn('[score-digest] Resend error:', await res.text())
    return res.ok
  } catch (err) {
    console.warn('[score-digest] envoyerEmail failed:', err)
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const today = new Date().toISOString().split('T')[0]
    const dateAffichee = new Date().toLocaleDateString('fr-FR')

    // 1. Alertes du jour par organisation
    const { data: alertes, error: alertesErr } = await supabase
      .from('alertes_score')
      .select('organisation_id, code_client, nom_client, encours_ttc, retard_max_jours, score_risque')
      .eq('date_calcul', today)
      .order('score_risque', { ascending: false })
    if (alertesErr) throw alertesErr
    if (!alertes?.length) return json({ envoyés: 0, message: 'Aucune alerte aujourd\'hui' })

    // Grouper par organisation
    const parOrg = new Map<string, AlereteRow[]>()
    for (const a of alertes) {
      const orgId = (a as AlereteRow & { organisation_id: string }).organisation_id
      if (!parOrg.has(orgId)) parOrg.set(orgId, [])
      parOrg.get(orgId)!.push(a as AlereteRow)
    }

    let nbEnvoyés = 0

    for (const [orgId, rows] of parOrg) {
      // Destinataires : admin + responsable_poste_client toujours + commercial opt-in
      const { data: users } = await supabase
        .from('utilisateurs')
        .select('email, role, recoit_digest_alertes')
        .eq('organisation_id', orgId)

      const emails = ((users ?? []) as { email: string; role: string; recoit_digest_alertes: boolean }[])
        .filter(u =>
          u.role === 'admin' ||
          u.role === 'responsable_poste_client' ||
          (u.role === 'commercial' && u.recoit_digest_alertes)
        )
        .map(u => u.email)

      if (!emails.length) continue

      const html = buildDigest(rows, dateAffichee)
      const sujet = `Alertes Score Client OCKHAM — ${rows.length} client(s) à surveiller`

      for (const email of emails) {
        const ok = await envoyerEmail(email, sujet, html)
        if (ok) nbEnvoyés++
      }
    }

    console.log(`[score-digest] terminé — ${nbEnvoyés} email(s) envoyé(s)`)
    return json({ envoyés: nbEnvoyés, orgs: parOrg.size })

  } catch (err) {
    console.error('[score-digest] erreur critique:', err)
    return json({ error: String(err) }, 500)
  }
})
