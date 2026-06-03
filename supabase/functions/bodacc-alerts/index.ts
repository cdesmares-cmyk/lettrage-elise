// Edge Function — Alertes email BODACC
// Envoie un email par alerte non notifiée (notifie_le IS NULL) à l'admin de l'org.
// Service email : Resend (api.resend.com) — requiert RESEND_API_KEY dans les secrets Supabase.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY')!
const APP_URL      = Deno.env.get('APP_URL') ?? 'https://app.ockham.fr'
const FROM_EMAIL   = Deno.env.get('RESEND_FROM') ?? 'OCKHAM Veille <alerte@ockham.finance>'

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
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'
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
    liquidation:  'LIQUIDATION JUDICIAIRE',
    redressement: 'REDRESSEMENT JUDICIAIRE',
    sauvegarde:   'SAUVEGARDE',
    cloture:      'CLÔTURE DE PROCÉDURE',
  }
  return m[type] ?? type.toUpperCase()
}

function ligne(label: string, valeur: string): string {
  return `<tr>
    <td style="padding:5px 0;font-size:13px;color:#6b7280;width:130px;vertical-align:top;">${label}</td>
    <td style="padding:5px 0;font-size:13px;font-weight:600;color:#111827;">${valeur}</td>
  </tr>`
}

interface Alerte {
  id: string
  organisation_id: string
  code_client: string
  siret: string
  type_procedure: string
  tribunal: string | null
  date_jugement: string | null
  date_parution: string | null
  nom_client: string | null
  encours_ht: number
  encours_ttc: number
}

function buildEmail(a: Alerte): string {
  const lienClient = `${APP_URL}/compte-client?client=${encodeURIComponent(a.code_client)}`
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Alerte BODACC — OCKHAM</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <!-- En-tête -->
        <tr>
          <td style="background:#0E1A2B;padding:24px 40px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:12px;">
                  <div style="width:40px;height:40px;border-radius:10px;background:rgba(76,197,187,0.1);border:1.5px solid rgba(76,197,187,0.25);display:flex;align-items:center;justify-content:center;text-align:center;line-height:40px;">
                    <span style="color:#4CC5BB;font-size:22px;font-weight:900;line-height:1;">O</span>
                  </div>
                </td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">OCKHAM</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Titre -->
        <tr>
          <td style="padding:36px 40px 0;">
            <h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;">Alerte BODACC</h1>
            <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Publication du ${formatDate(a.date_parution)}</p>
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td style="padding:20px 40px 0;">
            <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
              Le scan BODACC a identifié une procédure collective sur un client de votre portefeuille.
            </p>
          </td>
        </tr>

        <!-- Carte client -->
        <tr>
          <td style="padding:24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="background:#f9fafb;padding:14px 24px;border-bottom:1px solid #e5e7eb;">
                  <span style="font-size:11px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:0.1em;">${labelType(a.type_procedure)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${ligne('Raison sociale', a.nom_client ?? '—')}
                    ${ligne('Code client', a.code_client)}
                    ${ligne('SIRET', formatSiret(a.siret))}
                    ${ligne('Date jugement', formatDate(a.date_jugement))}
                    ${ligne('Tribunal', a.tribunal ?? '—')}
                    ${ligne('Encours HT', a.encours_ht > 0 ? formatEuros(a.encours_ht) : '0,00 €')}
                    ${ligne('Encours TTC', a.encours_ttc > 0 ? formatEuros(a.encours_ttc) : '0,00 €')}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 40px 40px;text-align:center;">
            <a href="${lienClient}" style="display:inline-block;background:#0E1A2B;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500;">
              Voir la fiche client dans OCKHAM
            </a>
          </td>
        </tr>

        <!-- Pied -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.8;">
              Cet email est envoyé automatiquement par OCKHAM.<br>
              Données issues du BODACC — Journal officiel des annonces civiles et commerciales.<br>
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
    if (!res.ok) console.warn('[bodacc-alerts] Resend error:', await res.text())
    return res.ok
  } catch (err) {
    console.warn('[bodacc-alerts] envoyerEmail failed:', err)
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // 1. Alertes non notifiées (paginées)
    const brutes: Array<{
      id: string; organisation_id: string; code_client: string; siret: string
      type_procedure: string; tribunal: string | null; date_jugement: string | null; date_parution: string | null
    }> = []
    let offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('alertes_risque')
        .select('id, organisation_id, code_client, siret, type_procedure, tribunal, date_jugement, date_parution')
        .is('notifie_le', null)
        .range(offset, offset + 999)
      if (error || !data?.length) break
      brutes.push(...(data as typeof brutes))
      if (data.length < 1000) break
      offset += 1000
    }

    if (!brutes.length) return json({ envoyés: 0, message: 'Aucune alerte à notifier' })
    console.log(`[bodacc-alerts] ${brutes.length} alerte(s) à traiter`)

    // 2. Enrichir + envoyer séquentiellement
    let nbEnvoyés = 0
    const notifiés: string[] = []

    for (const a of brutes) {
      // Nom client
      const { data: client } = await supabase
        .from('clients')
        .select('nom')
        .eq('code_dso', a.code_client)
        .eq('organisation_id', a.organisation_id)
        .maybeSingle()

      // Encours HT + TTC via RPC
      const { data: enc } = await supabase
        .rpc('encours_client', { p_code_client: a.code_client, p_organisation_id: a.organisation_id })
        .single()

      // Destinataires : admin ou credit_manager, compte activé, notif_bodacc activée
      const { data: admins } = await supabase
        .from('utilisateurs')
        .select('email')
        .eq('organisation_id', a.organisation_id)
        .in('role', ['admin', 'responsable_poste_client'])
        .eq('invitation_en_attente', false)
        .eq('notif_bodacc', true)

      const emails = (admins as { email: string }[] | null)?.map(u => u.email) ?? []
      if (!emails.length) {
        console.warn(`[bodacc-alerts] Aucun admin pour org ${a.organisation_id}`)
        continue
      }

      const alerte: Alerte = {
        ...a,
        nom_client:   (client as { nom: string } | null)?.nom ?? null,
        encours_ht:   (enc as { encours_ht: number } | null)?.encours_ht ?? 0,
        encours_ttc:  (enc as { encours_ttc: number } | null)?.encours_ttc ?? 0,
      }

      const sujet = `Alerte BODACC — ${alerte.nom_client ?? alerte.code_client} — ${labelType(alerte.type_procedure)}`
      const html  = buildEmail(alerte)

      for (const email of emails) {
        const ok = await envoyerEmail(email, sujet, html)
        if (ok) nbEnvoyés++
      }

      notifiés.push(a.id)
    }

    // 3. Marquer comme notifiées
    for (let i = 0; i < notifiés.length; i += 500) {
      await supabase
        .from('alertes_risque')
        .update({ notifie_le: new Date().toISOString() } as never)
        .in('id', notifiés.slice(i, i + 500))
    }

    console.log(`[bodacc-alerts] terminé — ${nbEnvoyés} email(s) envoyé(s)`)
    return json({ envoyés: nbEnvoyés, alertes_traitées: notifiés.length })

  } catch (err) {
    console.error('[bodacc-alerts] erreur critique:', err)
    return json({ error: String(err) }, 500)
  }
})
