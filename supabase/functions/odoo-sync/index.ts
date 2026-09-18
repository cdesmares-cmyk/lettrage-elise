import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!
const BATCH_SIZE    = 100   // factures par appel Odoo
const CRON_BATCH    = 200   // factures par step cron

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

// ── Odoo JSON-RPC — compatible toutes versions ────────────────────────────────

interface OdooConfig {
  url:      string
  db:       string
  username: string
  apiKey:   string   // clé API (v14+) ou mot de passe
}

async function odooCall(
  cfg: OdooConfig,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  const res = await fetch(`${cfg.url}/web/dataset/call_kw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Basic auth : username:apiKey en base64
      'Authorization': `Basic ${btoa(`${cfg.username}:${cfg.apiKey}`)}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method:  'call',
      id:      1,
      params:  { model, method, args, kwargs: { ...kwargs, context: { lang: 'fr_FR' } } },
    }),
  })
  const data = await res.json() as { result?: unknown; error?: { data?: { message?: string }; message?: string } }
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message ?? 'Erreur Odoo JSON-RPC')
  return data.result
}

// Authentification — retourne l'uid Odoo
async function odooAuthenticate(cfg: OdooConfig): Promise<number> {
  const res = await fetch(`${cfg.url}/web/dataset/call_kw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method:  'call',
      id:      1,
      params: {
        model:  'res.users',
        method: 'authenticate',
        args:   [cfg.db, cfg.username, cfg.apiKey, {}],
        kwargs: {},
      },
    }),
  })
  const data = await res.json() as { result?: number; error?: { data?: { message?: string } } }
  if (data.error) throw new Error(data.error.data?.message ?? 'Authentification Odoo échouée')
  if (!data.result || data.result === false) throw new Error('Identifiants Odoo invalides')
  return data.result as number
}

// Champs factures à récupérer depuis Odoo
const INVOICE_FIELDS = [
  'id', 'name', 'partner_id', 'invoice_date', 'invoice_date_due',
  'amount_untaxed', 'amount_total', 'amount_residual',
  'move_type', 'payment_state', 'state', 'write_date',
]

interface OdooInvoice {
  id:                 number
  name:               string
  partner_id:         [number, string]   // [id, nom]
  invoice_date:       string | false
  invoice_date_due:   string | false
  amount_untaxed:     number
  amount_total:       number
  amount_residual:    number
  move_type:          'out_invoice' | 'out_refund'
  payment_state:      string
  state:              string
  write_date:         string
}

// Convertit le payment_state Odoo vers le statut Ockham
function mapStatutPaiement(ps: string): string {
  switch (ps) {
    case 'paid':        return 'payee'
    case 'partial':     return 'partiel'
    case 'in_payment':  return 'en_cours'
    case 'not_paid':
    default:            return 'en_attente'
  }
}

// Upsert batch de factures dans Supabase
async function upsertFactures(
  supabaseAdmin: ReturnType<typeof createClient>,
  orgId: string,
  invoices: OdooInvoice[]
): Promise<number> {
  const payload = invoices.map(inv => {
    const partnerId  = Array.isArray(inv.partner_id) ? inv.partner_id[0] : 0
    const partnerNom = Array.isArray(inv.partner_id) ? inv.partner_id[1] : ''
    // code_client : on utilise ODO_{partner_id} comme identifiant stable
    // Le matching vers un code métier se fera dans une phase ultérieure
    const codeClient = `ODO_${partnerId}`
    const estAvoir   = inv.move_type === 'out_refund'
    const resteDu    = estAvoir ? -Math.abs(inv.amount_residual) : inv.amount_residual

    return {
      organisation_id:   orgId,
      numero_piece:      inv.name,
      code_client:       codeClient,
      nom_client:        partnerNom,
      date_emission:     inv.invoice_date   || null,
      date_echeance:     inv.invoice_date_due || null,
      montant_ht:        inv.amount_untaxed,
      montant_ttc:       inv.amount_total,
      reste_du:          resteDu,
      est_avoir:         estAvoir,
      statut_paiement:   mapStatutPaiement(inv.payment_state),
      statut_facture:    'actif',
      odoo_move_id:      inv.id,
      source:            'odoo',
    }
  })

  const { error } = await supabaseAdmin
    .from('factures')
    .upsert(payload as never, { onConflict: 'organisation_id,numero_piece', ignoreDuplicates: false })
  if (error) throw new Error(`upsert factures: ${error.message}`)
  return payload.length
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Non autorisé', { status: 401, headers: CORS })

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)
    const body   = await req.json()
    const action: string = body.action

    // ── test ──────────────────────────────────────────────────────────────────
    if (action === 'test') {
      const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: row, error: rowErr } = await supabaseUser
        .from('integrations')
        .select('api_key, config, organisation_id')
        .eq('provider', 'odoo')
        .eq('actif', true)
        .single()
      if (rowErr || !row?.api_key || !row?.config) {
        return json({ error: 'Configuration Odoo introuvable' }, 400)
      }
      const cfg: OdooConfig = {
        url:      (row.config as Record<string, string>).url,
        db:       (row.config as Record<string, string>).db,
        username: (row.config as Record<string, string>).username,
        apiKey:   row.api_key as string,
      }
      const uid = await odooAuthenticate(cfg)
      // Vérifie qu'on peut lire les factures
      const count = await odooCall(cfg, uid, 'account.move', 'search_count',
        [[['move_type', 'in', ['out_invoice', 'out_refund']], ['state', '=', 'posted']]])
      await supabaseAdmin
        .from('integrations')
        .update({ verifie_le: new Date().toISOString() })
        .eq('provider', 'odoo')
        .eq('organisation_id', row.organisation_id as string)
      return json({ ok: true, message: `Connexion validée — ${count} factures disponibles` })
    }

    // ── sync (manuel, piloté depuis le navigateur) ────────────────────────────
    if (action === 'sync') {
      const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: row, error: rowErr } = await supabaseUser
        .from('integrations')
        .select('api_key, config, organisation_id')
        .eq('provider', 'odoo')
        .eq('actif', true)
        .single()
      if (rowErr || !row?.api_key || !row?.config) {
        return json({ error: 'Configuration Odoo introuvable' }, 400)
      }
      const { api_key, config, organisation_id } = row as {
        api_key: string; config: Record<string, string>; organisation_id: string
      }
      const cfg: OdooConfig = {
        url: config.url, db: config.db, username: config.username, apiKey: api_key,
      }

      const offset:  number = body.offset  ?? 0
      const nbBatch: number = body.nb_batch ?? 3   // batches de BATCH_SIZE par appel
      const uid = await odooAuthenticate(cfg)

      let nbMaj   = 0
      let termine = false

      for (let i = 0; i < nbBatch; i++) {
        const currentOffset = offset + i * BATCH_SIZE
        const invoices = await odooCall(cfg, uid, 'account.move', 'search_read',
          [[['move_type', 'in', ['out_invoice', 'out_refund']], ['state', '=', 'posted']]],
          { fields: INVOICE_FIELDS, offset: currentOffset, limit: BATCH_SIZE, order: 'id asc' }
        ) as OdooInvoice[]

        if (!Array.isArray(invoices) || invoices.length === 0) { termine = true; break }
        nbMaj += await upsertFactures(supabaseAdmin, organisation_id, invoices)
        if (invoices.length < BATCH_SIZE) { termine = true; break }
      }

      if (termine) {
        await supabaseAdmin
          .from('integrations')
          .update({ verifie_le: new Date().toISOString(), sync_actif: false })
          .eq('provider', 'odoo').eq('organisation_id', organisation_id)
        await supabaseAdmin.from('cron_runs').insert({
          fonction: 'odoo-sync', organisation_id, statut: 'ok', nb_traite: nbMaj,
          message: `Import historique terminé — ${nbMaj} factures upsertées`,
        })
      }

      return json({ ok: true, nb_mises_a_jour: nbMaj, termine, prochain_offset: offset + nbBatch * BATCH_SIZE })
    }

    // ── sync_step (pg_cron toutes les 15 min — incrémental) ──────────────────
    if (action === 'sync_step') {
      const orgId: string = body.org_id
      if (!orgId) return json({ error: 'org_id requis' }, 400)

      const { data: row } = await supabaseAdmin
        .from('integrations')
        .select('api_key, config, verifie_le, sync_actif')
        .eq('provider', 'odoo')
        .eq('organisation_id', orgId)
        .single()
      if (!row?.api_key || !row?.config) return json({ ok: false, message: 'Intégration non configurée' })

      const cfg: OdooConfig = {
        url:      (row.config as Record<string, string>).url,
        db:       (row.config as Record<string, string>).db,
        username: (row.config as Record<string, string>).username,
        apiKey:   row.api_key as string,
      }

      // Dernière sync réussie (verifie_le) comme borne inférieure
      const lastSync = row.verifie_le
        ? new Date(row.verifie_le as string).toISOString().replace('T', ' ').slice(0, 19)
        : '2000-01-01 00:00:00'

      const uid = await odooAuthenticate(cfg)
      const invoices = await odooCall(cfg, uid, 'account.move', 'search_read',
        [[
          ['move_type', 'in', ['out_invoice', 'out_refund']],
          ['state', '=', 'posted'],
          ['write_date', '>', lastSync],
        ]],
        { fields: INVOICE_FIELDS, limit: CRON_BATCH, order: 'write_date asc' }
      ) as OdooInvoice[]

      let nbMaj = 0
      if (Array.isArray(invoices) && invoices.length > 0) {
        nbMaj = await upsertFactures(supabaseAdmin, orgId, invoices)
      }

      await supabaseAdmin
        .from('integrations')
        .update({ verifie_le: new Date().toISOString() })
        .eq('provider', 'odoo').eq('organisation_id', orgId)

      if (nbMaj > 0) {
        await supabaseAdmin.from('cron_runs').insert({
          fonction: 'odoo-sync', organisation_id: orgId, statut: 'ok', nb_traite: nbMaj,
          message: `Sync incrémentale — ${nbMaj} factures mises à jour (write_date > ${lastSync})`,
        })
      }

      return json({ ok: true, nb_mises_a_jour: nbMaj })
    }

    return json({ error: 'Action inconnue' }, 400)

  } catch (err) {
    console.error('odoo-sync error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
