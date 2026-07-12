import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL     = Deno.env.get('SITE_URL') ?? 'https://app.ockham-finance.com'

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

function computeInitiales(prenom: string, nom: string): string {
  const p = prenom.trim()
  const n = nom.trim()
  if (p && n) return (p[0]! + n.slice(0, 2)).toUpperCase()
  if (n) return n.slice(0, 3).toUpperCase()
  if (p) return p.slice(0, 3).toUpperCase()
  return '?'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return json({ error: 'Non authentifié' }, 401)

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: caller } = await supabaseAdmin
      .from('utilisateurs')
      .select('role, organisation_id, prenom, nom')
      .eq('id', user.id)
      .single()
    if (!caller || caller.role !== 'admin') return json({ error: 'Accès réservé à l\'administrateur' }, 403)

    const body = await req.json()
    const { action } = body

    if (action === 'invite') {
      const { email, role = 'responsable_poste_client', prenom = '', nom = '' } = body
      if (!email) return json({ error: 'Email requis' }, 400)
      const nomDisplay = nom || email.split('@')[0]
      const inviterNom = [caller.prenom, caller.nom].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Votre administrateur'

      let authUserId: string
      const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: SITE_URL,
        data: { inviter_nom: inviterNom },
      })

      if (inviteError) {
        // GoTrue échoue (ex: utilisateur déjà confirmé dans auth.users).
        // On recherche l'utilisateur existant pour l'ajouter à l'organisation.
        const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
        if (listError) return json({ error: `Invitation impossible : ${inviteError.message}` }, 400)
        const found = (list?.users ?? []).find((u: { email?: string }) => u.email === email)
        if (!found) return json({ error: `Invitation impossible : ${inviteError.message}` }, 400)
        authUserId = found.id
      } else {
        authUserId = invited.user.id
      }

      await supabaseAdmin.from('utilisateurs').upsert({
        id: authUserId,
        email,
        prenom,
        nom: nomDisplay,
        initiales: computeInitiales(prenom, nomDisplay),
        role,
        organisation_id: caller.organisation_id,
      } as never, { onConflict: 'id' })
      return json({ ok: true })
    }

    if (action === 'update_user') {
      const { user_id, prenom, nom, role } = body
      if (!user_id) return json({ error: 'user_id requis' }, 400)
      if (user_id === user.id) return json({ error: 'Impossible de modifier son propre compte' }, 400)
      const ROLES_VALIDES = ['admin', 'responsable_poste_client', 'commercial']
      if (role && !ROLES_VALIDES.includes(role)) return json({ error: 'Rôle invalide' }, 400)
      const { data: target } = await supabaseAdmin
        .from('utilisateurs')
        .select('prenom, nom, role')
        .eq('id', user_id)
        .eq('organisation_id', caller.organisation_id)
        .single()
      if (!target) return json({ error: 'Utilisateur introuvable' }, 404)
      const newPrenom = prenom ?? target.prenom
      const newNom    = nom    ?? target.nom
      const newRole   = role   ?? target.role
      const { error } = await supabaseAdmin
        .from('utilisateurs')
        .update({
          prenom: newPrenom,
          nom: newNom,
          initiales: computeInitiales(newPrenom, newNom),
          role: newRole,
        } as never)
        .eq('id', user_id)
        .eq('organisation_id', caller.organisation_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'delete') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id requis' }, 400)
      if (user_id === user.id) return json({ error: 'Impossible de supprimer son propre compte' }, 400)
      const { data: target } = await supabaseAdmin
        .from('utilisateurs')
        .select('organisation_id')
        .eq('id', user_id)
        .single()
      if (!target || target.organisation_id !== caller.organisation_id)
        return json({ error: 'Utilisateur introuvable' }, 404)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message }, 400)
      await supabaseAdmin.from('utilisateurs').delete().eq('id', user_id)
      return json({ ok: true })
    }

    if (action === 'update_role') {
      const { user_id, role } = body
      if (!user_id || !role) return json({ error: 'user_id et role requis' }, 400)
      if (user_id === user.id) return json({ error: 'Impossible de modifier son propre rôle' }, 400)
      const ROLES_VALIDES = ['admin', 'responsable_poste_client', 'commercial']
      if (!ROLES_VALIDES.includes(role)) return json({ error: 'Rôle invalide' }, 400)
      const { error } = await supabaseAdmin
        .from('utilisateurs')
        .update({ role } as never)
        .eq('id', user_id)
        .eq('organisation_id', caller.organisation_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erreur interne' }, 500)
  }
})
