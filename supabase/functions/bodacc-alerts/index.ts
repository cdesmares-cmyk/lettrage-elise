// Edge Function — Alertes email BODACC v2 — digest par organisation
// Pour chaque org avec au moins un utilisateur notif_bodacc = true :
//   - alertes en attente (notifie_le IS NULL) → un email digest récapitulatif
//   - aucune alerte pour cette org → un email "Aucune alerte"
// Service email : Resend — requiert RESEND_API_KEY dans les secrets Supabase.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY')!
const CRON_SECRET  = Deno.env.get('CRON_SECRET') ?? ''
const APP_URL      = Deno.env.get('APP_URL') ?? 'https://app.ockham-finance.com'
const FROM_EMAIL   = Deno.env.get('RESEND_FROM') ?? 'OCKHAM Veille <alerte@ockham.finance>'

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

function formatEuros(n: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'
}

function formatSiret(s: string): string {
  const d = s.replace(/\s/g, '')
  return d.length === 14 ? `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,9)} ${d.slice(9)}` : s
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR')
}

function labelType(type: string): string {
  const m: Record<string, string> = {
    liquidation:  'Liquidation judiciaire',
    redressement: 'Redressement judiciaire',
    sauvegarde:   'Sauvegarde',
    cloture:      'Clôture de procédure',
  }
  return m[type] ?? type
}

function colorType(type: string): string {
  const m: Record<string, string> = {
    liquidation:  '#dc2626',
    redressement: '#d97706',
    sauvegarde:   '#2563eb',
    cloture:      '#6b7280',
  }
  return m[type] ?? '#111827'
}

interface AlerteRaw {
  id: string
  organisation_id: string
  code_client: string
  siret: string
  type_procedure: string
  tribunal: string | null
  date_jugement: string | null
  date_parution: string | null
}

interface AlerteEnrichie extends AlerteRaw {
  nom_client: string | null
  encours_ht: number
  encours_ttc: number
}

// ── TEMPLATE DIGEST (alertes détectées) ──────────────────────────────────────
function buildDigestEmail(alertes: AlerteEnrichie[], dateStr: string): string {
  const nb = alertes.length
  const cartes = alertes.map(a => {
    const lienClient = `${APP_URL}/compte-client?client=${encodeURIComponent(a.code_client)}`
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:16px;overflow:hidden;">
      <tr>
        <td style="background:#fef2f2;padding:10px 20px;border-bottom:1px solid #fecaca;">
          <span style="font-size:11px;font-weight:700;color:${colorType(a.type_procedure)};text-transform:uppercase;letter-spacing:0.08em;">
            ⚠ ${labelType(a.type_procedure)}
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111827;">${a.nom_client ?? a.code_client}</p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:12px;color:#6b7280;padding:2px 16px 2px 0;white-space:nowrap;">Code client</td>
              <td style="font-size:12px;font-weight:600;color:#374151;padding:2px 0;">${a.code_client}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#6b7280;padding:2px 16px 2px 0;white-space:nowrap;">SIRET</td>
              <td style="font-size:12px;font-weight:600;color:#374151;font-family:monospace;padding:2px 0;">${formatSiret(a.siret)}</td>
            </tr>
            ${a.tribunal ? `<tr>
              <td style="font-size:12px;color:#6b7280;padding:2px 16px 2px 0;white-space:nowrap;">Tribunal</td>
              <td style="font-size:12px;font-weight:600;color:#374151;padding:2px 0;">${a.tribunal}</td>
            </tr>` : ''}
            <tr>
              <td style="font-size:12px;color:#6b7280;padding:2px 16px 2px 0;white-space:nowrap;">Date jugement</td>
              <td style="font-size:12px;font-weight:600;color:#374151;padding:2px 0;">${formatDate(a.date_jugement)}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#6b7280;padding:2px 16px 2px 0;white-space:nowrap;">Encours TTC</td>
              <td style="font-size:12px;font-weight:700;color:#dc2626;padding:2px 0;">${a.encours_ttc > 0 ? formatEuros(a.encours_ttc) : '—'}</td>
            </tr>
          </table>
          <div style="margin-top:14px;">
            <a href="${lienClient}" style="display:inline-block;background:#0E1A2B;color:#ffffff;text-decoration:none;padding:8px 18px;border-radius:6px;font-size:12px;font-weight:500;">
              Voir la fiche client →
            </a>
          </div>
        </td>
      </tr>
    </table>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <tr>
          <td style="background:#0E1A2B;padding:24px 40px;">
            <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.12em;">OCKHAM</span>
            <span style="color:#4CC5BB;font-size:16px;font-weight:700;letter-spacing:0.12em;"> · Veille BODACC</span>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 40px 20px;">
            <h1 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#111827;">
              ${nb} procédure${nb > 1 ? 's' : ''} détectée${nb > 1 ? 's' : ''}
            </h1>
            <p style="margin:0;font-size:13px;color:#6b7280;">Publications BODACC du ${dateStr}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 40px 32px;">
            ${cartes}
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.8;">
              Données issues du BODACC — Journal officiel des annonces civiles et commerciales.<br>
              Cet email est envoyé automatiquement par OCKHAM Finance.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── TEMPLATE RAS (aucune alerte pour cette org) ───────────────────────────────
function buildEmailRAS(dateStr: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <tr>
          <td style="background:#0E1A2B;padding:24px 40px;">
            <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.12em;">OCKHAM</span>
            <span style="color:#4CC5BB;font-size:16px;font-weight:700;letter-spacing:0.12em;"> · Veille BODACC</span>
          </td>
        </tr>

        <tr>
          <td style="padding:48px 40px;text-align:center;">
            <div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #bbf7d0;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:26px;line-height:56px;">
              ✓
            </div>
            <h1 style="margin:0 0 10px;font-size:18px;font-weight:700;color:#111827;">Aucune alerte ce jour</h1>
            <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
              Le scan BODACC du ${dateStr} n'a détecté aucune procédure collective<br>sur les clients de votre portefeuille.
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.8;">
              Données issues du BODACC — Journal officiel des annonces civiles et commerciales.<br>
              Cet email est envoyé automatiquement par OCKHAM Finance.
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
    if (!res.ok) console.warn('[bodacc-alerts] Resend error:', await res.text())
    return res.ok
  } catch (err) {
    console.warn('[bodacc-alerts] envoyerEmail failed:', err)
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET)
    return json({ error: 'unauthorized' }, 401)

  const tDébut  = Date.now()
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    const dateStr = new Date().toLocaleDateString('fr-FR')

    // 1. Toutes les alertes non notifiées
    const brutes: AlerteRaw[] = []
    let offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('alertes_risque')
        .select('id, organisation_id, code_client, siret, type_procedure, tribunal, date_jugement, date_parution')
        .is('notifie_le', null)
        .range(offset, offset + 999)
      if (error || !data?.length) break
      brutes.push(...(data as AlerteRaw[]))
      if (data.length < 1000) break
      offset += 1000
    }

    // Groupement par org
    const alertesParOrg: Record<string, AlerteRaw[]> = {}
    for (const a of brutes) {
      if (!alertesParOrg[a.organisation_id]) alertesParOrg[a.organisation_id] = []
      alertesParOrg[a.organisation_id].push(a)
    }

    // 2. Toutes les orgs avec au moins un destinataire notif_bodacc
    const { data: destRows } = await supabase
      .from('utilisateurs')
      .select('organisation_id, email')
      .in('role', ['admin', 'responsable_poste_client'])
      .eq('invitation_en_attente', false)
      .eq('notif_bodacc', true)

    const orgsAvecDest: Record<string, string[]> = {}
    for (const u of (destRows as { organisation_id: string; email: string }[] | null) ?? []) {
      if (!orgsAvecDest[u.organisation_id]) orgsAvecDest[u.organisation_id] = []
      orgsAvecDest[u.organisation_id].push(u.email)
    }

    const nbOrgs = Object.keys(orgsAvecDest).length
    console.log(`[bodacc-alerts] ${nbOrgs} org(s) avec destinataires · ${brutes.length} alerte(s) en attente`)

    if (!nbOrgs) {
      await supabase.from('cron_runs').insert({
        fonction: 'bodacc-alerts', statut: 'ok', nb_traite: 0,
        message: 'Aucun destinataire notif_bodacc configuré', duree_ms: Date.now() - tDébut,
      })
      return json({ envoyés: 0, message: 'Aucun destinataire configuré' })
    }

    // 3. Traitement par org
    let nbEmailsEnvoyés = 0
    let nbOrgsAvecAlertes = 0
    let nbOrgsRAS = 0
    const notifiés: string[] = []

    for (const [orgId, emails] of Object.entries(orgsAvecDest)) {
      const alertesOrg = alertesParOrg[orgId] ?? []

      if (alertesOrg.length > 0) {
        // — Enrichissement des alertes
        const alertesEnrichies: AlerteEnrichie[] = []
        for (const a of alertesOrg) {
          const { data: client } = await supabase
            .from('clients')
            .select('nom')
            .eq('code_dso', a.code_client)
            .eq('organisation_id', orgId)
            .maybeSingle()

          const { data: enc } = await supabase
            .rpc('encours_client', { p_code_client: a.code_client, p_organisation_id: orgId })
            .single()

          alertesEnrichies.push({
            ...a,
            nom_client:  (client as { nom: string } | null)?.nom ?? null,
            encours_ht:  (enc as { encours_ht: number } | null)?.encours_ht ?? 0,
            encours_ttc: (enc as { encours_ttc: number } | null)?.encours_ttc ?? 0,
          })
          notifiés.push(a.id)
        }

        // — Envoi digest
        const sujet = `[BODACC] ${alertesEnrichies.length} procédure${alertesEnrichies.length > 1 ? 's' : ''} détectée${alertesEnrichies.length > 1 ? 's' : ''} — ${dateStr}`
        const html  = buildDigestEmail(alertesEnrichies, dateStr)
        for (const email of emails) {
          const ok = await envoyerEmail(email, sujet, html)
          if (ok) nbEmailsEnvoyés++
        }
        nbOrgsAvecAlertes++

      } else {
        // — Envoi RAS
        const sujet = `[BODACC] Aucune alerte — ${dateStr}`
        const html  = buildEmailRAS(dateStr)
        for (const email of emails) {
          const ok = await envoyerEmail(email, sujet, html)
          if (ok) nbEmailsEnvoyés++
        }
        nbOrgsRAS++
      }
    }

    // 4. Marquer alertes comme notifiées
    for (let i = 0; i < notifiés.length; i += 500) {
      await supabase
        .from('alertes_risque')
        .update({ notifie_le: new Date().toISOString() } as never)
        .in('id', notifiés.slice(i, i + 500))
    }

    // 5. Log cron_runs
    const message = `${nbOrgs} org(s) traitée(s) · ${nbOrgsAvecAlertes} avec alertes · ${nbOrgsRAS} RAS · ${nbEmailsEnvoyés} email(s) envoyé(s)`
    await supabase.from('cron_runs').insert({
      fonction: 'bodacc-alerts', statut: 'ok', nb_traite: nbEmailsEnvoyés,
      message, duree_ms: Date.now() - tDébut,
    })

    console.log(`[bodacc-alerts] terminé — ${message}`)
    return json({ envoyés: nbEmailsEnvoyés, orgs_avec_alertes: nbOrgsAvecAlertes, orgs_ras: nbOrgsRAS, alertes_notifiées: notifiés.length })

  } catch (err) {
    console.error('[bodacc-alerts] erreur critique:', err)
    await supabase.from('cron_runs').insert({
      fonction: 'bodacc-alerts', statut: 'erreur', nb_traite: 0,
      message: String(err), duree_ms: Date.now() - tDébut,
    }).catch(() => {})
    return json({ error: String(err) }, 500)
  }
})
