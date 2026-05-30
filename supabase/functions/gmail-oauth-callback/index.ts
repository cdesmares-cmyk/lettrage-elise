import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Variables injectées automatiquement par Supabase + secrets configurés dans le dashboard
const CLIENT_ID     = Deno.env.get('GMAIL_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const REDIRECT_URI  = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`

Deno.serve(async (req: Request) => {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')
  const erreur = url.searchParams.get('error')

  // Décodage du state : { uid, url } encodé en base64 par le frontend
  let userId    = ''
  let returnUrl = SUPABASE_URL

  if (state) {
    try {
      const s  = JSON.parse(atob(state))
      userId   = s.uid   ?? ''
      returnUrl = s.url  ?? returnUrl
    } catch { /* état invalide, on utilisera les valeurs par défaut */ }
  }

  if (erreur || !code || !userId) {
    return Response.redirect(`${returnUrl}?gmail=error`, 302)
  }

  console.log('oauth-callback: userId=', userId, 'returnUrl=', returnUrl)

  // Vérifie que le userId du state correspond à un compte OCKHAM réel
  // Empêche de lier un compte Google à un userId arbitraire forgé dans le state
  const supabaseCheck = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: userCheck } = await supabaseCheck
    .from('utilisateurs')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (!userCheck) {
    console.error('oauth-callback: userId introuvable dans utilisateurs —', userId)
    return Response.redirect(`${returnUrl}?gmail=error`, 302)
  }

  // Échange du code contre les tokens Google
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
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

  console.log('token exchange status:', tokenRes.status)

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text()
    console.error('token exchange failed:', errBody)
    return Response.redirect(`${returnUrl}?gmail=error`, 302)
  }

  const tokens = await tokenRes.json()
  const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

  // Récupération de l'adresse Gmail de l'opérateur
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile = profileRes.ok ? await profileRes.json() : {}

  // Sauvegarde des tokens (upsert — un seul enregistrement par opérateur)
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { error: upsertError } = await supabase.from('gmail_tokens').upsert({
    user_id:       userId,
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    token_expiry:  expiry,
    gmail_email:   profile.email ?? null,
    mis_a_jour_le: new Date().toISOString(),
  })

  if (upsertError) {
    console.error('upsert error:', upsertError.message)
    return Response.redirect(`${returnUrl}?gmail=error`, 302)
  }

  console.log('gmail_tokens upsert OK pour', profile.email)
  return Response.redirect(`${returnUrl}?gmail=connected`, 302)
})
