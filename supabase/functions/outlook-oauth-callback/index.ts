import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID     = Deno.env.get('OUTLOOK_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('OUTLOOK_CLIENT_SECRET')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const REDIRECT_URI  = `${SUPABASE_URL}/functions/v1/outlook-oauth-callback`

Deno.serve(async (req: Request) => {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')
  const erreur = url.searchParams.get('error')

  let userId    = ''
  let returnUrl = SUPABASE_URL

  if (state) {
    try {
      const s   = JSON.parse(atob(state))
      userId    = s.uid  ?? ''
      returnUrl = s.url  ?? returnUrl
    } catch { /* état invalide */ }
  }

  if (erreur || !code || !userId) {
    return Response.redirect(`${returnUrl}?outlook=error`, 302)
  }

  // Vérifie que le userId correspond à un compte OCKHAM réel
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: userCheck } = await supabase
    .from('utilisateurs')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (!userCheck) {
    console.error('outlook-oauth-callback: userId introuvable —', userId)
    return Response.redirect(`${returnUrl}?outlook=error`, 302)
  }

  // Échange du code contre les tokens Microsoft
  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text()
    console.error('outlook token exchange failed:', errBody)
    return Response.redirect(`${returnUrl}?outlook=error`, 302)
  }

  const tokens = await tokenRes.json()
  const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

  // Récupération de l'adresse email Microsoft Graph
  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile     = profileRes.ok ? await profileRes.json() : {}
  const outlookEmail = profile.mail ?? profile.userPrincipalName ?? null

  // Upsert du token en base
  const { error: upsertError } = await supabase.from('outlook_tokens').upsert({
    user_id:       userId,
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    token_expiry:  expiry,
    outlook_email: outlookEmail,
    mis_a_jour_le: new Date().toISOString(),
  })

  if (upsertError) {
    console.error('outlook upsert error:', upsertError.message)
    return Response.redirect(`${returnUrl}?outlook=error`, 302)
  }

  console.log('outlook_tokens upsert OK pour', outlookEmail)
  return Response.redirect(`${returnUrl}?outlook=connected`, 302)
})
