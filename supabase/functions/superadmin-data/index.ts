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

function genTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const arr = new Uint8Array(10)
  crypto.getRandomValues(arr)
  const raw = Array.from(arr).map(b => chars[b % chars.length]).join('')
  return `${raw.slice(0, 4)}-${raw.slice(4, 7)}-${raw.slice(7)}`
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

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: caller } = await supabase
      .from('utilisateurs').select('role').eq('id', user.id).single()
    if (!caller || caller.role !== 'superadmin')
      return json({ error: 'Accès réservé au superadmin' }, 403)

    const body = await req.json()
    const { action } = body

    // ── GET_DASHBOARD ─────────────────────────────────────────────────────────
    if (action === 'get_dashboard') {
      const [
        { data: orgs },
        { data: users },
        { data: statsClients },
        { data: integs },
      ] = await Promise.all([
        supabase.from('organisations').select('id, nom, slug, actif, cree_le').order('cree_le'),
        supabase.from('utilisateurs').select('id, organisation_id, role, email, nom_affiche, cree_le'),
        supabase.rpc('superadmin_stats_clients'),
        supabase.from('integrations').select('organisation_id, provider, actif, verifie_le').eq('provider', 'axonaut'),
      ])

      const usersByOrg    = new Map<string, typeof users>()
      const clientsByOrg  = new Map<string, { count: number; encours: number }>()
      const axonautByOrg  = new Map<string, { actif: boolean; verifie_le: string | null }>()

      for (const u of users ?? []) {
        if (!u.organisation_id) continue
        if (!usersByOrg.has(u.organisation_id)) usersByOrg.set(u.organisation_id, [])
        usersByOrg.get(u.organisation_id)!.push(u)
      }
      for (const c of (statsClients ?? []) as { organisation_id: string; nb_clients: number; encours_total: number }[]) {
        clientsByOrg.set(c.organisation_id, { count: c.nb_clients, encours: c.encours_total ?? 0 })
      }
      for (const i of (integs ?? []) as { organisation_id: string; actif: boolean; verifie_le: string | null }[]) {
        axonautByOrg.set(i.organisation_id, { actif: i.actif, verifie_le: i.verifie_le })
      }

      const organisations = (orgs ?? []).map(org => {
        const ax = axonautByOrg.get(org.id)
        return {
          ...org,
          nb_utilisateurs: usersByOrg.get(org.id)?.length ?? 0,
          nb_clients:      clientsByOrg.get(org.id)?.count ?? 0,
          encours_total:   clientsByOrg.get(org.id)?.encours ?? 0,
          utilisateurs:    usersByOrg.get(org.id) ?? [],
          axonaut_actif:   ax?.actif ?? false,
          axonaut_verifie_le: ax?.verifie_le ?? null,
        }
      })

      return json({ organisations })
    }

    // ── GET_ORG_DETAIL ────────────────────────────────────────────────────────
    if (action === 'get_org_detail') {
      const { organisation_id } = body
      if (!organisation_id) return json({ error: 'organisation_id requis' }, 400)

      const [{ data: users }, { data: integs }, { data: runs }] = await Promise.all([
        supabase.from('utilisateurs').select('id, email, nom_affiche, role, cree_le').eq('organisation_id', organisation_id),
        supabase.from('integrations').select('provider, actif, verifie_le').eq('organisation_id', organisation_id),
        supabase.rpc('superadmin_get_monitoring', { nb: 5 }),
      ])

      const utilisateurs = await Promise.all(
        (users ?? []).map(async u => {
          const { data: { user: au } } = await supabase.auth.admin.getUserById(u.id)
          return {
            ...u,
            derniere_connexion:    au?.last_sign_in_at ?? null,
            invitation_en_attente: !au?.email_confirmed_at,
            suspendu:              au?.banned_until ? new Date(au.banned_until) > new Date() : false,
          }
        })
      )

      const orgRuns = (runs ?? []).filter((r: { organisation_id: string | null }) =>
        r.organisation_id === organisation_id || r.organisation_id === null
      )

      return json({ utilisateurs, integrations: integs ?? [], runs: orgRuns })
    }

    // ── CREATE_ORG ────────────────────────────────────────────────────────────
    if (action === 'create_org') {
      const { nom, slug, email_admin, nom_admin } = body
      if (!nom || !slug || !email_admin)
        return json({ error: 'nom, slug et email_admin sont requis' }, 400)

      const { data: existing } = await supabase.from('organisations').select('id').eq('slug', slug).maybeSingle()
      if (existing) return json({ error: `Le slug "${slug}" est déjà utilisé` }, 400)

      const { data: newOrg, error: errOrg } = await supabase
        .from('organisations').insert({ nom, slug }).select('id').single()
      if (errOrg) return json({ error: errOrg.message }, 400)

      const { data: invited, error: errInvite } = await supabase.auth.admin.inviteUserByEmail(
        email_admin, { redirectTo: SITE_URL, data: { inviter_nom: 'OCKHAM Finance' } }
      )
      if (errInvite) {
        await supabase.from('organisations').delete().eq('id', newOrg.id)
        return json({ error: errInvite.message }, 400)
      }

      await supabase.from('utilisateurs').upsert({
        id: invited.user.id, email: email_admin,
        nom_affiche: nom_admin || email_admin.split('@')[0],
        role: 'admin', organisation_id: newOrg.id,
      } as never, { onConflict: 'id' })

      return json({ ok: true, organisation_id: newOrg.id })
    }

    // ── INVITE_USER ───────────────────────────────────────────────────────────
    if (action === 'invite_user') {
      const { organisation_id, email, nom_affiche, role } = body
      if (!organisation_id || !email || !role)
        return json({ error: 'organisation_id, email et role sont requis' }, 400)

      const { data: invited, error: errInvite } = await supabase.auth.admin.inviteUserByEmail(
        email, { redirectTo: SITE_URL, data: { inviter_nom: 'OCKHAM Finance' } }
      )
      if (errInvite) return json({ error: errInvite.message }, 400)

      await supabase.from('utilisateurs').upsert({
        id: invited.user.id, email,
        nom_affiche: nom_affiche || email.split('@')[0],
        role, organisation_id,
      } as never, { onConflict: 'id' })

      return json({ ok: true })
    }

    // ── TOGGLE_ORG ────────────────────────────────────────────────────────────
    if (action === 'toggle_org') {
      const { organisation_id, actif } = body
      if (!organisation_id || typeof actif !== 'boolean')
        return json({ error: 'organisation_id et actif requis' }, 400)
      const { error } = await supabase.from('organisations').update({ actif }).eq('id', organisation_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    // ── UPDATE_USER_ROLE ──────────────────────────────────────────────────────
    if (action === 'update_user_role') {
      const { user_id, role } = body
      const roles = ['admin', 'commercial', 'lecteur', 'responsable_poste_client']
      if (!user_id || !roles.includes(role))
        return json({ error: 'user_id et role valide requis' }, 400)
      const { error } = await supabase.from('utilisateurs').update({ role }).eq('id', user_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    // ── RESET_USER_PASSWORD ───────────────────────────────────────────────────
    if (action === 'reset_user_password') {
      const { email } = body
      if (!email) return json({ error: 'email requis' }, 400)
      const { error } = await supabase.auth.admin.generateLink({
        type: 'recovery', email, options: { redirectTo: SITE_URL }
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    // ── RESEND_INVITATION ─────────────────────────────────────────────────────
    if (action === 'resend_invitation') {
      const { email } = body
      if (!email) return json({ error: 'email requis' }, 400)
      const { error } = await supabase.auth.admin.inviteUserByEmail(
        email, { redirectTo: SITE_URL }
      )
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    // ── SET_TEMP_PASSWORD ─────────────────────────────────────────────────────
    if (action === 'set_temp_password') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id requis' }, 400)
      const tempPwd = genTempPassword()
      const { error } = await supabase.auth.admin.updateUserById(user_id, { password: tempPwd })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true, temp_password: tempPwd })
    }

    // ── SUSPEND_USER ──────────────────────────────────────────────────────────
    if (action === 'suspend_user') {
      const { user_id, suspendu } = body
      if (!user_id || typeof suspendu !== 'boolean')
        return json({ error: 'user_id et suspendu requis' }, 400)
      const { error } = await supabase.auth.admin.updateUserById(user_id, {
        ban_duration: suspendu ? '876000h' : 'none',
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    // ── GET_MONITORING ────────────────────────────────────────────────────────
    if (action === 'get_monitoring') {
      const { data, error } = await supabase.rpc('superadmin_get_monitoring', { nb: 5 })
      if (error) return json({ error: error.message }, 400)
      return json({ runs: data ?? [] })
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erreur interne' }, 500)
  }
})
