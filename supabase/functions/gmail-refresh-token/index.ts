import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID     = Deno.env.get('GMAIL_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// En-têtes CORS nécessaires pour les appels depuis le frontend
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  // Vérification du JWT de l'opérateur
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response('Non autorisé', { status: 401, headers: CORS })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) {
    return new Response('Non autorisé', { status: 401, headers: CORS })
  }

  // Lecture du refresh_token stocké pour cet opérateur
  const { data: tokenData } = await supabase
    .from('gmail_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .single()

  if (!tokenData?.refresh_token) {
    return new Response(
      JSON.stringify({ error: 'pas_de_refresh_token' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  // Renouvellement auprès de Google
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokenData.refresh_token,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  })

  if (!tokenRes.ok) {
    return new Response(
      JSON.stringify({ error: 'renouvellement_echoue' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const tokens = await tokenRes.json()
  const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

  // Mise à jour en BDD
  const { error: updateError } = await supabase.from('gmail_tokens').update({
    access_token:  tokens.access_token,
    token_expiry:  expiry,
    mis_a_jour_le: new Date().toISOString(),
  }).eq('user_id', user.id)

  if (updateError) {
    console.error('[gmail-refresh-token] erreur sauvegarde token:', updateError.message)
    return new Response(
      JSON.stringify({ error: 'erreur_sauvegarde_token' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ access_token: tokens.access_token, token_expiry: expiry }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } }
  )
})
