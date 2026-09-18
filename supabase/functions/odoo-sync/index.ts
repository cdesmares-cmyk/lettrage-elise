import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!
const BATCH_SIZE    = 100
const CRON_BATCH    = 200

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

// ── Parser XML-RPC maison (pas de DOMParser disponible dans Edge Runtime) ─────

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function unescXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

// Extrait le contenu de la première occurrence de <tag>...</tag>
// en respectant la profondeur pour les tags imbriqués du même nom
function innerContent(xml: string, tag: string, from = 0): string {
  const open  = `<${tag}>`
  const close = `</${tag}>`
  const start = xml.indexOf(open, from)
  if (start === -1) return ''
  let depth = 0
  let i     = start
  while (i < xml.length) {
    if (xml.slice(i, i + open.length)  === open)  { depth++; i += open.length }
    else if (xml.slice(i, i + close.length) === close) {
      depth--
      if (depth === 0) return xml.slice(start + open.length, i)
      i += close.length
    } else i++
  }
  return ''
}

// Découpe les <value>…</value> successifs dans une chaîne <data>
function splitValues(data: string): string[] {
  const open = '<value>'; const close = '</value>'
  const out: string[] = []
  let i = 0
  while (i < data.length) {
    const s = data.indexOf(open, i)
    if (s === -1) break
    let depth = 0; let j = s
    while (j < data.length) {
      if (data.slice(j, j + open.length) === open)        { depth++; j += open.length }
      else if (data.slice(j, j + close.length) === close) {
        depth--
        if (depth === 0) { out.push(data.slice(s + open.length, j)); i = j + close.length; break }
        j += close.length
      } else j++
    }
    if (depth !== 0) break
  }
  return out
}

// Découpe les <member>…</member> dans un <struct>
function splitMembers(struct: string): string[] {
  const open = '<member>'; const close = '</member>'
  const out: string[] = []
  let i = 0
  while (i < struct.length) {
    const s = struct.indexOf(open, i)
    if (s === -1) break
    let depth = 0; let j = s
    while (j < struct.length) {
      if (struct.slice(j, j + open.length) === open)        { depth++; j += open.length }
      else if (struct.slice(j, j + close.length) === close) {
        depth--
        if (depth === 0) { out.push(struct.slice(s + open.length, j)); i = j + close.length; break }
        j += close.length
      } else j++
    }
    if (depth !== 0) break
  }
  return out
}

// Parse une valeur XML-RPC
function parseRpcValue(s: string): unknown {
  s = s.trim()
  if (!s) return null
  if (s.startsWith('<int>') || s.startsWith('<i4>') || s.startsWith('<i8>'))
    return parseInt(s.replace(/<[^>]+>/g, ''))
  if (s.startsWith('<double>'))
    return parseFloat(s.replace(/<[^>]+>/g, ''))
  if (s.startsWith('<boolean>'))
    return s.includes('>1<')
  if (s.startsWith('<string>')) {
    const inner = s.slice(8, s.lastIndexOf('</string>'))
    return unescXml(inner)
  }
  if (s === '<nil/>' || s === '<nil></nil>' || s === '') return null
  if (s.startsWith('<array>')) {
    const data = innerContent(s, 'data')
    return splitValues(data).map(parseRpcValue)
  }
  if (s.startsWith('<struct>')) {
    const result: Record<string, unknown> = {}
    splitMembers(innerContent(s, 'struct')).forEach(member => {
      const name  = innerContent(member, 'name')
      const value = innerContent(member, 'value')
      result[name] = parseRpcValue(value)
    })
    return result
  }
  // bare string (pas de type wrapper)
  return unescXml(s)
}

// Parse la réponse XML-RPC complète (fault ou résultat)
function parseXmlRpcResponse(xml: string): unknown {
  // Normalise : supprime les espaces entre balises
  xml = xml.replace(/>\s+</g, '><').trim()

  if (xml.includes('<fault>')) {
    const faultValue = innerContent(xml, 'fault')
    const parsed     = parseRpcValue(innerContent(faultValue, 'value')) as Record<string, unknown>
    throw new Error((parsed?.faultString as string) ?? 'XML-RPC fault')
  }

  // Extraction du premier <value> dans <params><param>
  const param = innerContent(xml, 'param')
  const value = innerContent(param, 'value')
  return parseRpcValue(value)
}

// Build XML-RPC request
function valueToXml(val: unknown): string {
  if (val === null || val === undefined) return '<value><boolean>0</boolean></value>'
  if (typeof val === 'boolean') return `<value><boolean>${val ? 1 : 0}</boolean></value>`
  if (typeof val === 'number') {
    return Number.isInteger(val)
      ? `<value><int>${val}</int></value>`
      : `<value><double>${val}</double></value>`
  }
  if (typeof val === 'string') return `<value><string>${escXml(val)}</string></value>`
  if (Array.isArray(val)) {
    return `<value><array><data>${val.map(valueToXml).join('')}</data></array></value>`
  }
  if (typeof val === 'object') {
    const members = Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `<member><name>${escXml(k)}</name>${valueToXml(v)}</member>`)
      .join('')
    return `<value><struct>${members}</struct></value>`
  }
  return `<value><string>${escXml(String(val))}</string></value>`
}

function buildXmlRpcCall(method: string, params: unknown[]): string {
  const ps = params.map(p => `<param>${valueToXml(p)}</param>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><methodCall><methodName>${method}</methodName><params>${ps}</params></methodCall>`
}

async function xmlRpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'text/xml', 'User-Agent': 'OCKHAM/1.0' },
    body:    buildXmlRpcCall(method, params),
  })
  if (!res.ok) throw new Error(`XML-RPC HTTP ${res.status} sur ${url}`)
  return parseXmlRpcResponse(await res.text())
}

// ── Odoo config + helpers ─────────────────────────────────────────────────────

interface OdooConfig { url: string; db: string; username: string; apiKey: string }

async function odooAuthenticate(cfg: OdooConfig): Promise<number> {
  const base = cfg.url.replace(/\/$/, '')
  const uid  = await xmlRpcCall(`${base}/xmlrpc/2/common`, 'authenticate',
    [cfg.db, cfg.username, cfg.apiKey, {}])
  if (typeof uid !== 'number' || uid === 0)
    throw new Error('Identifiants Odoo invalides — vérifiez URL, base, utilisateur et clef API')
  return uid
}

async function odooCall(
  cfg: OdooConfig, uid: number, model: string, method: string,
  args: unknown[], kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  const base = cfg.url.replace(/\/$/, '')
  return xmlRpcCall(`${base}/xmlrpc/2/object`, 'execute_kw',
    [cfg.db, uid, cfg.apiKey, model, method, args, { ...kwargs, context: { lang: 'fr_FR' } }])
}

const INVOICE_FIELDS = [
  'id', 'name', 'partner_id', 'invoice_date', 'invoice_date_due',
  'amount_untaxed', 'amount_total', 'amount_residual',
  'move_type', 'payment_state', 'state', 'write_date',
]

interface OdooInvoice {
  id: number; name: string; partner_id: [number, string] | false
  invoice_date: string | false; invoice_date_due: string | false
  amount_untaxed: number; amount_total: number; amount_residual: number
  move_type: string; payment_state: string; state: string; write_date: string
}

function mapStatut(ps: string): string {
  switch (ps) {
    case 'paid':       return 'payee'
    case 'partial':    return 'partiel'
    case 'in_payment': return 'en_cours'
    default:           return 'en_attente'
  }
}

async function upsertFactures(
  admin: ReturnType<typeof createClient>, orgId: string, invoices: OdooInvoice[]
): Promise<number> {
  const payload = invoices.map(inv => {
    const partnerId  = Array.isArray(inv.partner_id) ? inv.partner_id[0] : 0
    const partnerNom = Array.isArray(inv.partner_id) ? inv.partner_id[1] : ''
    const estAvoir   = inv.move_type === 'out_refund'
    const resteDu    = estAvoir ? -Math.abs(inv.amount_residual) : inv.amount_residual
    return {
      organisation_id: orgId, numero_piece: inv.name,
      code_client: `ODO_${partnerId}`, nom_client: partnerNom,
      date_emission: inv.invoice_date  || null, date_echeance: inv.invoice_date_due || null,
      montant_ht: inv.amount_untaxed, montant_ttc: inv.amount_total, reste_du: resteDu,
      est_avoir: estAvoir, statut_paiement: mapStatut(inv.payment_state),
      statut_facture: 'actif', odoo_move_id: inv.id, source: 'odoo',
    }
  })
  const { error } = await admin
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

    const admin        = createClient(SUPABASE_URL, SERVICE_KEY)
    const body         = await req.json()
    const action: string = body.action

    // ── test ──────────────────────────────────────────────────────────────────
    if (action === 'test') {
      const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
      const { data: row, error: rowErr } = await user
        .from('integrations').select('api_key, config, organisation_id')
        .eq('provider', 'odoo').eq('actif', true).single()
      if (rowErr || !row?.api_key || !row?.config)
        return json({ error: 'Configuration Odoo introuvable' }, 400)

      const cfg: OdooConfig = {
        url:      (row.config as Record<string, string>).url,
        db:       (row.config as Record<string, string>).db,
        username: (row.config as Record<string, string>).username,
        apiKey:   row.api_key as string,
      }
      const uid   = await odooAuthenticate(cfg)
      const count = await odooCall(cfg, uid, 'account.move', 'search_count',
        [[['move_type', 'in', ['out_invoice', 'out_refund']], ['state', '=', 'posted']]])
      await admin.from('integrations')
        .update({ verifie_le: new Date().toISOString() })
        .eq('provider', 'odoo').eq('organisation_id', row.organisation_id as string)
      return json({ ok: true, message: `Connexion validée — ${count} factures disponibles` })
    }

    // ── sync (manuel) ────────────────────────────────────────────────────────
    if (action === 'sync') {
      const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
      const { data: row, error: rowErr } = await user
        .from('integrations').select('api_key, config, organisation_id')
        .eq('provider', 'odoo').eq('actif', true).single()
      if (rowErr || !row?.api_key || !row?.config)
        return json({ error: 'Configuration Odoo introuvable' }, 400)

      const { api_key, config, organisation_id } = row as {
        api_key: string; config: Record<string, string>; organisation_id: string
      }
      const cfg: OdooConfig = { url: config.url, db: config.db, username: config.username, apiKey: api_key }
      const offset:  number = body.offset  ?? 0
      const nbBatch: number = body.nb_batch ?? 3
      const uid = await odooAuthenticate(cfg)

      let nbMaj = 0; let termine = false
      for (let i = 0; i < nbBatch; i++) {
        const invoices = await odooCall(cfg, uid, 'account.move', 'search_read',
          [[['move_type', 'in', ['out_invoice', 'out_refund']], ['state', '=', 'posted']]],
          { fields: INVOICE_FIELDS, offset: offset + i * BATCH_SIZE, limit: BATCH_SIZE, order: 'id asc' }
        ) as OdooInvoice[]
        if (!Array.isArray(invoices) || invoices.length === 0) { termine = true; break }
        nbMaj += await upsertFactures(admin, organisation_id, invoices)
        if (invoices.length < BATCH_SIZE) { termine = true; break }
      }

      if (termine) {
        await admin.from('integrations')
          .update({ verifie_le: new Date().toISOString(), sync_actif: false })
          .eq('provider', 'odoo').eq('organisation_id', organisation_id)
        await admin.from('cron_runs').insert({
          fonction: 'odoo-sync', organisation_id, statut: 'ok', nb_traite: nbMaj,
          message: `Import historique terminé — ${nbMaj} factures upsertées`,
        })
      }
      return json({ ok: true, nb_mises_a_jour: nbMaj, termine, prochain_offset: offset + nbBatch * BATCH_SIZE })
    }

    // ── sync_step (pg_cron) ──────────────────────────────────────────────────
    if (action === 'sync_step') {
      const orgId: string = body.org_id
      if (!orgId) return json({ error: 'org_id requis' }, 400)

      const { data: row } = await admin.from('integrations')
        .select('api_key, config, verifie_le')
        .eq('provider', 'odoo').eq('organisation_id', orgId).single()
      if (!row?.api_key || !row?.config) return json({ ok: false, message: 'Intégration non configurée' })

      const cfg: OdooConfig = {
        url:      (row.config as Record<string, string>).url,
        db:       (row.config as Record<string, string>).db,
        username: (row.config as Record<string, string>).username,
        apiKey:   row.api_key as string,
      }
      const lastSync = row.verifie_le
        ? new Date(row.verifie_le as string).toISOString().replace('T', ' ').slice(0, 19)
        : '2000-01-01 00:00:00'

      const uid      = await odooAuthenticate(cfg)
      const invoices = await odooCall(cfg, uid, 'account.move', 'search_read',
        [[['move_type', 'in', ['out_invoice', 'out_refund']], ['state', '=', 'posted'], ['write_date', '>', lastSync]]],
        { fields: INVOICE_FIELDS, limit: CRON_BATCH, order: 'write_date asc' }
      ) as OdooInvoice[]

      let nbMaj = 0
      if (Array.isArray(invoices) && invoices.length > 0)
        nbMaj = await upsertFactures(admin, orgId, invoices)

      await admin.from('integrations')
        .update({ verifie_le: new Date().toISOString() })
        .eq('provider', 'odoo').eq('organisation_id', orgId)

      if (nbMaj > 0) await admin.from('cron_runs').insert({
        fonction: 'odoo-sync', organisation_id: orgId, statut: 'ok', nb_traite: nbMaj,
        message: `Sync incrémentale — ${nbMaj} factures mises à jour (write_date > ${lastSync})`,
      })

      return json({ ok: true, nb_mises_a_jour: nbMaj })
    }

    return json({ error: 'Action inconnue' }, 400)

  } catch (err) {
    console.error('odoo-sync error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
