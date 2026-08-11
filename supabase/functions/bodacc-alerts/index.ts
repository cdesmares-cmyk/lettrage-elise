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

function iconType(type: string): string {
  const m: Record<string, string> = {
    liquidation:  '&#10005;',
    redressement: '&#9650;',
    sauvegarde:   '&#11044;',
    cloture:      '&#9711;',
  }
  return m[type] ?? '&middot;'
}

const PRIORITE_TYPE: Record<string, number> = { liquidation: 1, redressement: 2, sauvegarde: 3, cloture: 4 }

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

interface LigneDigest {
  code_client: string
  nom_client: string | null
  type_prioritaire: string
  nb_alertes: number
  encours_ttc: number
}

// ── TEMPLATE DIGEST — tableau groupé par client ───────────────────────────────
function buildDigestEmail(lignes: LigneDigest[], dateStr: string, nomOrg?: string): string {
  const nbClients = lignes.length

  const lignesHtml = lignes.map((l, i) => {
    const lienClient = `${APP_URL}/compte-client?client=${encodeURIComponent(l.code_client)}`
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb'
    const badgeColor  = colorType(l.type_prioritaire)
    const badgeBg     = l.type_prioritaire === 'liquidation' ? '#fef2f2'
                      : l.type_prioritaire === 'redressement' ? '#fffbeb'
                      : l.type_prioritaire === 'sauvegarde'   ? '#eff6ff'
                      : '#f3f4f6'
    const labelAlerte = `${labelType(l.type_prioritaire)}${l.nb_alertes > 1 ? ` (×${l.nb_alertes})` : ''}`
    return `
      <tr style="background:${bg};">
        <td style="padding:12px 16px;font-size:12px;font-family:monospace;color:#4CC5BB;font-weight:700;white-space:nowrap;border-bottom:1px solid #f3f4f6;">${l.code_client}</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#0E1A2B;border-bottom:1px solid #f3f4f6;">${l.nom_client ?? '—'}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #f3f4f6;">
          <span style="display:inline-block;padding:3px 8px 3px 6px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.04em;color:${badgeColor};background:${badgeBg};border-left:3px solid ${badgeColor};">
            ${iconType(l.type_prioritaire)}&nbsp;${labelAlerte}
          </span>
        </td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#dc2626;text-align:right;white-space:nowrap;border-bottom:1px solid #f3f4f6;">${l.encours_ttc > 0 ? formatEuros(l.encours_ttc) : '—'}</td>
        <td style="padding:12px 16px;text-align:center;border-bottom:1px solid #f3f4f6;">
          <a href="${lienClient}" style="display:inline-block;padding:5px 12px;background:#0E1A2B;color:#4CC5BB;text-decoration:none;font-size:11px;font-weight:700;border-radius:5px;white-space:nowrap;">
            Voir →
          </a>
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

        <tr>
          <td style="background:#0E1A2B;padding:24px 32px;">
            <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.12em;">OCKHAM</span>
            <span style="color:#4CC5BB;font-size:16px;font-weight:700;letter-spacing:0.12em;"> · Veille BODACC</span>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 20px;">
            <h1 style="margin:0 0 4px;font-size:17px;font-weight:700;color:#0E1A2B;">
              ${nbClients} client${nbClients > 1 ? 's' : ''} en procédure collective
            </h1>
            <p style="margin:0;font-size:12px;color:#6b7280;">Publications BODACC détectées - ${dateStr}${nomOrg ? ` &middot; ${nomOrg}` : ''}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <thead>
                <tr style="background:#0E1A2B;">
                  <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#4CC5BB;letter-spacing:0.08em;text-transform:uppercase;">Code</th>
                  <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#4CC5BB;letter-spacing:0.08em;text-transform:uppercase;">Nom</th>
                  <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#4CC5BB;letter-spacing:0.08em;text-transform:uppercase;">Alerte</th>
                  <th style="padding:10px 16px;text-align:right;font-size:10px;font-weight:700;color:#4CC5BB;letter-spacing:0.08em;text-transform:uppercase;">Encours TTC</th>
                  <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;color:#4CC5BB;letter-spacing:0.08em;text-transform:uppercase;"></th>
                </tr>
              </thead>
              <tbody>
                ${lignesHtml}
              </tbody>
            </table>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center;">
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
            <div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #bbf7d0;margin:0 auto 20px;font-size:26px;line-height:56px;text-align:center;">&#10003;</div>
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

      const { data: orgRow } = await supabase
        .from('organisations')
        .select('nom')
        .eq('id', orgId)
        .maybeSingle()
      const nomOrg = (orgRow as { nom: string } | null)?.nom ?? ''

      if (alertesOrg.length > 0) {
        // — Groupement par client + enrichissement (1 appel RPC par client)
        const parClient: Record<string, AlerteRaw[]> = {}
        for (const a of alertesOrg) {
          if (!parClient[a.code_client]) parClient[a.code_client] = []
          parClient[a.code_client].push(a)
          notifiés.push(a.id)
        }

        const lignes: LigneDigest[] = []
        for (const [codeClient, alertesClient] of Object.entries(parClient)) {
          const { data: clientRow } = await supabase
            .from('clients')
            .select('nom')
            .eq('code_dso', codeClient)
            .eq('organisation_id', orgId)
            .maybeSingle()

          const { data: enc } = await supabase
            .rpc('encours_client', { p_code_client: codeClient, p_organisation_id: orgId })
            .single()

          const typePrioritaire = alertesClient.reduce((best, a) =>
            (PRIORITE_TYPE[a.type_procedure] ?? 99) < (PRIORITE_TYPE[best] ?? 99) ? a.type_procedure : best
          , alertesClient[0].type_procedure)

          lignes.push({
            code_client:      codeClient,
            nom_client:       (clientRow as { nom: string } | null)?.nom ?? null,
            type_prioritaire: typePrioritaire,
            nb_alertes:       alertesClient.length,
            encours_ttc:      (enc as { encours_ttc: number } | null)?.encours_ttc ?? 0,
          })
        }

        // Tri : type le plus grave en premier
        lignes.sort((a, b) => (PRIORITE_TYPE[a.type_prioritaire] ?? 99) - (PRIORITE_TYPE[b.type_prioritaire] ?? 99))

        // — Envoi digest
        const sujet = `[Ockham] ${nomOrg ? nomOrg + ' - ' : ''}${lignes.length} client${lignes.length > 1 ? 's' : ''} en procédure identifiés- ${dateStr}`
        const html  = buildDigestEmail(lignes, dateStr, nomOrg)
        for (const email of emails) {
          const ok = await envoyerEmail(email, sujet, html)
          if (ok) nbEmailsEnvoyés++
        }
        nbOrgsAvecAlertes++

      } else {
        // — Envoi RAS
        const sujet = `[Ockham] Aucune alerte BODACC - ${dateStr}`
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
