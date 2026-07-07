// Edge Function — Webhook Resend
// Reçoit les événements bounce/complaint de Resend.
// Sur bounce ou complaint : met relances_auto_log.statut = 'bounce'
// et clients.relance_auto_alerte = true pour stopper le cron.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? ''

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

// ── Vérification signature svix ──────────────────────────────────────────────

async function verifierSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false
  const svixId        = req.headers.get('svix-id') ?? ''
  const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
  const svixSignature = req.headers.get('svix-signature') ?? ''
  if (!svixId || !svixTimestamp || !svixSignature) return false

  // Rejeter si le message date de plus de 5 minutes
  const ts = parseInt(svixTimestamp, 10)
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false

  // Clé : base64 decode du secret après "whsec_"
  const secretB64 = WEBHOOK_SECRET.startsWith('whsec_')
    ? WEBHOOK_SECRET.slice(6)
    : WEBHOOK_SECRET
  const keyBytes = Uint8Array.from(atob(secretB64), c => c.charCodeAt(0))

  const signingInput = `${svixId}.${svixTimestamp}.${rawBody}`
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signingInput))
  const computedB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))

  // svix-signature peut contenir plusieurs signatures "v1,xxx v1,yyy"
  return svixSignature.split(' ').some(s => {
    const [, b64] = s.split(',')
    return b64 === computedB64
  })
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const rawBody = await req.text()

  const valide = await verifierSignature(req, rawBody)
  if (!valide) {
    console.error('[resend-webhook] signature invalide')
    return json({ error: 'unauthorized' }, 401)
  }

  let payload: { type?: string; data?: { email_id?: string } }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  const type    = payload?.type ?? ''
  const emailId = payload?.data?.email_id ?? ''

  // Seuls bounce et complaint déclenchent une alerte
  if (!['email.bounced', 'email.complained'].includes(type)) {
    return json({ ok: true, ignored: true })
  }

  if (!emailId) return json({ error: 'email_id manquant' }, 400)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Retrouver la ligne de log via resend_id
  const { data: logs, error: errLog } = await supabase
    .from('relances_auto_log')
    .select('id, code_client, organisation_id')
    .eq('resend_id', emailId)
    .limit(1)

  if (errLog) return json({ error: errLog.message }, 500)
  if (!logs?.length) {
    console.warn(`[resend-webhook] resend_id ${emailId} introuvable dans relances_auto_log`)
    return json({ ok: true, found: false })
  }

  const log = logs[0]

  // Mettre à jour toutes les lignes de ce resend_id en 'bounce'
  const { error: errUpdateLog } = await supabase
    .from('relances_auto_log')
    .update({ statut: 'bounce' })
    .eq('resend_id', emailId)

  if (errUpdateLog) {
    console.error('[resend-webhook] erreur update log:', errUpdateLog.message)
    return json({ error: 'erreur_update_log' }, 500)
  }

  // Lever l'alerte sur le client — le cron ne le relancera plus
  const { error: errUpdateClient } = await supabase
    .from('clients')
    .update({ relance_auto_alerte: true } as never)
    .eq('code_dso', log.code_client)
    .eq('organisation_id', log.organisation_id)

  if (errUpdateClient) {
    console.error('[resend-webhook] erreur update client:', errUpdateClient.message)
    return json({ error: 'erreur_update_client' }, 500)
  }

  console.log(`[resend-webhook] ${type} → client ${log.code_client} mis en alerte`)
  return json({ ok: true, type, code_client: log.code_client })
})
