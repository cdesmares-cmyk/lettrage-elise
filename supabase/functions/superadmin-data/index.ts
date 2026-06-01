import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Vérification du token appelant
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return json({ error: 'Non authentifié' }, 401)

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // Guard : seul un superadmin peut appeler cette fonction
    const { data: caller } = await supabase
      .from('utilisateurs')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!caller || caller.role !== 'superadmin')
      return json({ error: 'Accès réservé au superadmin' }, 403)

    const body = await req.json()
    const { action } = body

    // ── GET_DASHBOARD : métriques consolidées de toutes les organisations ─────
    if (action === 'get_dashboard') {
      const [{ data: orgs }, { data: users }, { data: clients }, { data: relances }] = await Promise.all([
        supabase.from('organisations').select('id, nom, slug, actif, cree_le').order('cree_le'),
        supabase.from('utilisateurs').select('id, organisation_id, role, email, nom_affiche, cree_le'),
        supabase.from('v_comptes_clients').select('organisation_id, encours_total').throwOnError(),
        supabase.from('relances').select('organisation_id, statut, archivee').eq('archivee', false),
      ])

      // Agréger par organisation
      const usersByOrg   = new Map<string, typeof users>()
      const clientsByOrg = new Map<string, { count: number; encours: number }>()
      const relancesByOrg= new Map<string, number>()

      for (const u of users ?? []) {
        if (!u.organisation_id) continue
        if (!usersByOrg.has(u.organisation_id)) usersByOrg.set(u.organisation_id, [])
        usersByOrg.get(u.organisation_id)!.push(u)
      }
      for (const c of clients ?? []) {
        const prev = clientsByOrg.get(c.organisation_id) ?? { count: 0, encours: 0 }
        clientsByOrg.set(c.organisation_id, {
          count: prev.count + 1,
          encours: prev.encours + (c.encours_total ?? 0),
        })
      }
      for (const r of relances ?? []) {
        if (r.statut !== 'brouillon') {
          relancesByOrg.set(r.organisation_id, (relancesByOrg.get(r.organisation_id) ?? 0) + 1)
        }
      }

      const organisations = (orgs ?? []).map(org => ({
        ...org,
        nb_utilisateurs:  usersByOrg.get(org.id)?.length ?? 0,
        nb_clients:       clientsByOrg.get(org.id)?.count ?? 0,
        encours_total:    clientsByOrg.get(org.id)?.encours ?? 0,
        nb_relances:      relancesByOrg.get(org.id) ?? 0,
        utilisateurs:     usersByOrg.get(org.id) ?? [],
      }))

      return json({ organisations })
    }

    // ── CREATE_ORG : crée une organisation et invite son premier admin ─────────
    if (action === 'create_org') {
      const { nom, slug, email_admin, nom_admin } = body
      if (!nom || !slug || !email_admin)
        return json({ error: 'nom, slug et email_admin sont requis' }, 400)

      // Vérifie que le slug n'existe pas déjà
      const { data: existing } = await supabase
        .from('organisations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (existing) return json({ error: `Le slug "${slug}" est déjà utilisé` }, 400)

      // Crée l'organisation
      const { data: newOrg, error: errOrg } = await supabase
        .from('organisations')
        .insert({ nom, slug })
        .select('id')
        .single()
      if (errOrg) return json({ error: errOrg.message }, 400)

      // Invite le premier admin
      const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://app.ockham-finance.com'
      const { data: invited, error: errInvite } = await supabase.auth.admin.inviteUserByEmail(
        email_admin,
        { redirectTo: SITE_URL, data: { inviter_nom: 'OCKHAM Finance' } }
      )
      if (errInvite) {
        // Rollback : supprimer l'org si l'invitation échoue
        await supabase.from('organisations').delete().eq('id', newOrg.id)
        return json({ error: errInvite.message }, 400)
      }

      // Rattache l'utilisateur à l'organisation avec le rôle admin
      await supabase.from('utilisateurs').upsert({
        id: invited.user.id,
        email: email_admin,
        nom_affiche: nom_admin || email_admin.split('@')[0],
        role: 'admin',
        organisation_id: newOrg.id,
      } as never, { onConflict: 'id' })

      return json({ ok: true, organisation_id: newOrg.id })
    }

    // ── TOGGLE_ORG : activer / désactiver une organisation ────────────────────
    if (action === 'toggle_org') {
      const { organisation_id, actif } = body
      if (!organisation_id || typeof actif !== 'boolean')
        return json({ error: 'organisation_id et actif requis' }, 400)
      const { error } = await supabase
        .from('organisations')
        .update({ actif })
        .eq('id', organisation_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erreur interne' }, 500)
  }
})
