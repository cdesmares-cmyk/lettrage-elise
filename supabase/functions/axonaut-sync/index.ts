import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AXONAUT_BASE      = 'https://axonaut.com/api/v2'
const PER_PAGE          = 500

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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Non autorisé', { status: 401, headers: CORS })

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

    const body = await req.json()
    const action: string = body.action

    const { data: integration, error: intErr } = await supabaseUser
      .from('integrations')
      .select('api_key, organisation_id')
      .eq('provider', 'axonaut')
      .eq('actif', true)
      .single()

    if (intErr || !integration?.api_key) {
      console.error('integrations read error:', intErr)
      return json({ error: `Clef API introuvable : ${intErr?.message ?? 'null'}` }, 400)
    }

    const { api_key: apiKey, organisation_id: orgId } = integration as { api_key: string; organisation_id: string }
    const axonautHeaders = { userApiKey: apiKey }

    // ── test ────────────────────────────────────────────────────────────────
    if (action === 'test') {
      const res = await fetch(`${AXONAUT_BASE}/invoices?page=1`, { headers: { ...axonautHeaders, page: '1' } })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return json({ ok: false, message: `Axonaut HTTP ${res.status} — ${txt}` })
      }
      await supabaseAdmin
        .from('integrations')
        .update({ verifie_le: new Date().toISOString(), actif: true })
        .eq('provider', 'axonaut')
        .eq('organisation_id', orgId)
      return json({ ok: true, message: 'Connexion validée' })
    }

    // ── sync ────────────────────────────────────────────────────────────────
    if (action === 'sync') {
      const tDébut = Date.now()
      const pageDebut: number = body.page_debut ?? 1
      const nbPages:   number = body.nb_pages   ?? 10
      let nbMaj      = 0
      let nbVues     = 0
      let nbSansPdf  = 0
      let termine    = false

      for (let page = pageDebut; page < pageDebut + nbPages; page++) {
        const res = await fetch(`${AXONAUT_BASE}/invoices?page=${page}`, { headers: { ...axonautHeaders, page: String(page) } })

        // 404 = plus de pages disponibles → fin normale de la synchro
        if (res.status === 404) { termine = true; break }

        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          console.error(`Axonaut HTTP ${res.status} page ${page}:`, txt)
          return json({ error: `Axonaut HTTP ${res.status}` }, 502)
        }

        const invoices = await res.json() as Array<Record<string, unknown>>
        if (!Array.isArray(invoices) || invoices.length === 0) { termine = true; break }

        // Log diagnostic sur la première facture de la première page
        if (page === pageDebut && pageDebut === 1) {
          console.log('Axonaut invoice sample (page 1, item 0):', JSON.stringify(invoices[0]))
        }

        nbVues += invoices.length

        const payload = invoices
          .filter(inv => inv['number'] && inv['public_path'])
          .map(inv => ({ numero_piece: String(inv['number']), pdf_url: String(inv['public_path']) }))

        nbSansPdf += invoices.length - payload.length

        if (payload.length > 0) {
          const { data: nb, error: rpcErr } = await supabaseAdmin.rpc('bulk_update_axonaut_pdf', {
            updates: payload,
            org_id: orgId,
          })
          if (rpcErr) console.error('bulk_update_axonaut_pdf error:', rpcErr)
          nbMaj += (nb as number) ?? 0
        }

        if (invoices.length < PER_PAGE) { termine = true; break }
      }

      if (termine) {
        await supabaseAdmin
          .from('integrations')
          .update({ verifie_le: new Date().toISOString() })
          .eq('provider', 'axonaut')
          .eq('organisation_id', orgId)
        await supabaseAdmin.from('cron_runs').insert({
          fonction: 'axonaut-sync', organisation_id: orgId, statut: 'ok',
          nb_traite: nbMaj,
          message: `${nbVues} factures Axonaut · ${nbMaj} URLs mises à jour · ${nbSansPdf} sans PDF`,
          duree_ms: Date.now() - tDébut,
        })
      } else {
        // Batch terminé sans fin de synchro — log intermédiaire pour traçabilité
        console.log(`Batch pages ${pageDebut}-${pageDebut + nbPages - 1} : ${nbVues} vues, ${nbMaj} maj, ${nbSansPdf} sans PDF`)
      }

      return json({ ok: true, nb_mises_a_jour: nbMaj, nb_vues: nbVues, nb_sans_pdf: nbSansPdf, termine, prochaine_page: pageDebut + nbPages })
    }

    return json({ error: 'Action inconnue' }, 400)

  } catch (err) {
    console.error('Unhandled error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
