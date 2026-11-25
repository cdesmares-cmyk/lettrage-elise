// Edge Function — Relances automatiques
// Tourne sur cron quotidien. Pour chaque org avec relance_auto_active=true,
// envoie un email groupé (scénario niveau 1) aux clients éligibles via Resend.
// Déduplication : pas de re-relance si une relance auto a été envoyée
// dans les delai_rerelance_jours derniers jours.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildHtmlHistorique } from './mailHistorique.ts'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY    = Deno.env.get('RESEND_API_KEY')!
const CRON_SECRET   = Deno.env.get('CRON_SECRET') ?? ''
const FROM_EMAIL    = Deno.env.get('RESEND_FROM_RELANCE') ?? 'OCKHAM Relances <relances@ockham.finance>'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Formatage ────────────────────────────────────────────────────────────────

/**
 * Montant pour l'email, avec une normalisation que l'affichage n'exige pas.
 *
 * Intl separe les milliers par U+202F, l'espace fine insecable. Ce caractere
 * n'existe pas en Latin-1 : toute passerelle qui retranscode le message le rend
 * en carre ou en point d'interrogation, en plein milieu d'un montant. On lui
 * substitue U+00A0, l'insecable ordinaire, qui s'affiche identiquement partout
 * et survit au transcodage.
 */
function fmtEuros(n: number): string {
  const brut = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  return brut.replace(/\u202f/g, '\u00a0') + ' €'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// ── Résolution des balises ───────────────────────────────────────────────────

function resolveBalises(texte: string, ctx: {
  nomClient: string
  codeClient: string
  montantDu: number
  nomOrg: string
}): string {
  const dateJour = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  return texte
    .replace(/\[Nom client\]/gi, ctx.nomClient)
    .replace(/\[Code client\]/gi, ctx.codeClient)
    .replace(/\[Montant dû\]/gi, fmtEuros(ctx.montantDu))
    .replace(/\[Date du jour\]/gi, dateJour)
    .replace(/\[Nom organisation\]/gi, ctx.nomOrg)
}

// ── Construction HTML email ──────────────────────────────────────────────────
//
// COPIE DU CONSTRUCTEUR DU FRONT, src/lib/relanceEmail.ts, qui porte le long
// commentaire expliquant chaque règle. Deux copies parce que cette fonction
// tourne sous Deno et ne peut rien importer de src/ : factoriser imposerait un
// paquet partagé publié, pour deux appelants. TOUTE MODIFICATION ICI DOIT ÊTRE
// FAITE LÀ-BAS AUSSI — le client ne doit pas recevoir deux mails différents
// selon qu'un humain ou le cron a déclenché la relance.
//
// Le robot a en plus un bloc que le front n'a pas : les avoirs disponibles.
//
// Variante « Lettre », choisie par Clément le 2026-11-25 parmi trois maquettes.
// Le parti : rester une lettre. La structure tient en quatre traits — un filet
// navy en haut, une ligne d'en-tête, deux bandes pâles autour du tableau — et
// il n'y a ni logo, ni bandeau, ni image.
//
// Rappel des règles de robustesse : mise en page en tableaux avec largeurs en
// attributs HTML, cellpadding/cellspacing/border à zéro, aucun SVG, styles en
// ligne portés par la CELLULE et non par un span à l'intérieur, line-height en
// pixels avec mso-line-height-rule, et un retour à la ligne par cellule pour
// rester sous la limite SMTP de 998 octets par ligne.

/**
 * Filet de sécurité : `true` restaure le modèle d'avant le 2026-11-25.
 *
 * Le front a sa propre bascule, dans src/lib/relanceEmail.ts. Les deux doivent
 * être changées ensemble, et cette fonction redéployée.
 */
const UTILISER_MODELE_HISTORIQUE = false

const POLICE = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif"
const LARGEUR = 600

/**
 * Retrait horizontal du texte.
 *
 * Les bandes pâles du tableau vont d'un bord à l'autre des 600 px, mais leur
 * texte est en retrait de 12 px. Le corps doit l'être d'autant, sinon les
 * colonnes ne sont plus dans l'axe des paragraphes.
 */
const MARGE = 12

const ENCRE       = '#1F2937'
const ENCRE_FORTE = '#0E1A2B'   // navy de la charte
const GRIS        = '#94A3B8'
const GRIS_MOYEN  = '#64748B'
const GRIS_PALE   = '#CBD5E1'
const FILET       = '#E2E8F0'
const FILET_PALE  = '#F1F5F9'
const BANDE       = '#F8FAFC'

/**
 * Teal des liens : #0F766E, et non le #4CC5BB de la charte.
 *
 * Le teal de la charte a un contraste d'environ 2,2:1 sur blanc. C'est un
 * accent d'interface, pensé pour être posé SUR du navy — pas une couleur de
 * texte. Cette variante assombrie monte à 5,5:1, conforme AA.
 */
const ACCENT = '#0F766E'
const ALERTE = '#B91C1C'
const CREDIT = '#15803D'

/** Au-delà de ce retard la date passe en rouge. En deçà, tout est en retard de toute façon. */
const SEUIL_RETARD_ROUGE = 90

const COL_FACTURE  = 280
const COL_MONTANT  = 150
const COL_ECHEANCE = LARGEUR - COL_FACTURE - COL_MONTANT

const POL = `font-family:${POLICE};`
const EXACT = 'mso-line-height-rule:exactly;'

interface FactureLigne {
  numero: string
  montantTtc: number
  restedu: number
  echeance: string | null
  pdfUrl: string | null
}

interface AvoirLigne {
  numero: string
  montant: number
  echeance: string | null
}

/**
 * Une ligne de contenu dans la colonne principale.
 *
 * `vertical` ne porte que le haut et le bas : le retrait horizontal est imposé
 * ici pour que personne n'ait à y penser à chaque appel.
 */
function bloc(contenu: string, vertical: string, styleTexte = '', extra = ''): string {
  const [haut, bas] = vertical.split(' ')
  return `<tr><td align="left" style="padding:${haut} ${MARGE}px ${bas} ${MARGE}px;${extra}${POL}${styleTexte}">${contenu}</td></tr>\n`
}

/**
 * Une ligne qui va d'un bord à l'autre, sans retrait : les tableaux, qui
 * portent déjà le leur sur leurs propres cellules.
 *
 * Elle existe plutôt qu'un `padding-left:0` ajouté après le raccourci dans
 * `bloc` : Word ne surcharge pas de façon fiable un raccourci par une
 * propriété détaillée, et le tableau serait décalé de 12 px sous Outlook
 * seulement — le pire des cas, celui qu'on ne voit pas en développant.
 */
function blocPleineLargeur(contenu: string, vertical: string): string {
  const [haut, bas] = vertical.split(' ')
  return `<tr><td align="left" style="padding:${haut} 0 ${bas} 0;">${contenu}</td></tr>\n`
}

/**
 * Une respiration verticale, avec `&nbsp;` et une hauteur explicite : une
 * cellule vide est effondrée par Word et par plusieurs webmails.
 */
function espace(hauteur: number): string {
  return `<tr><td style="padding:0;line-height:0;font-size:0;height:${hauteur}px;">&nbsp;</td></tr>\n`
}

function textToHtmlBlocs(texte: string): string {
  return texte
    .split(/\n{2,}/)
    .filter(p => p.trim())
    .map(p => bloc(
      p.trim().replace(/\n/g, '<br />'),
      '0 18px',
      `${EXACT}font-size:15px;line-height:26px;color:${ENCRE};`,
    ))
    .join('')
}

/**
 * Le haut de la lettre : un filet navy, puis qui écrit et quand.
 *
 * Le filet est une cellule à fond navy et non une bordure : Word rend les
 * bordures de façon inégale selon la version, un aplat jamais.
 */
function blocEnTete(nomOrg: string | null): string {
  const dateJour = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const cell = `padding:15px ${MARGE}px 14px ${MARGE}px;border-bottom:1px solid ${FILET};${POL}`
  const demi = LARGEUR / 2

  return `<tr><td style="padding:0;line-height:0;font-size:0;height:3px;background-color:${ENCRE_FORTE};">&nbsp;</td></tr>\n`
    + `<tr><td style="padding:0;">\n`
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LARGEUR}" style="width:${LARGEUR}px;max-width:${LARGEUR}px;border-collapse:collapse;">\n`
    + `<tr>\n`
    + `<td align="left" width="${demi}" style="${cell}font-size:11px;font-weight:700;color:${ENCRE_FORTE};letter-spacing:.1em;">${(nomOrg ?? '').toUpperCase()}</td>\n`
    + `<td align="right" width="${demi}" style="${cell}font-size:11px;color:${GRIS};">${dateJour}</td>\n`
    + `</tr>\n`
    + `</table>\n`
    + `</td></tr>\n`
}

/** Libellés écrits en majuscules dans le HTML : Word ignore text-transform. */
function enTeteColonne(libelle: string, align: 'left' | 'right', largeur: number): string {
  return `<td align="${align}" width="${largeur}" style="padding:9px ${MARGE}px;background-color:${BANDE};border-bottom:1px solid ${FILET};${POL}font-size:10px;font-weight:700;color:${GRIS_MOYEN};letter-spacing:.08em;">${libelle}</td>\n`
}

function buildRow(f: FactureLigne, derniere: boolean): string {
  const retard = f.echeance ? joursDepuis(f.echeance) : null
  const estCredit = f.restedu < 0
  const bordure = derniere ? '' : `border-bottom:1px solid ${FILET_PALE};`
  const cell = `padding:13px ${MARGE}px;${bordure}${POL}${EXACT}line-height:20px;`

  const numero = f.pdfUrl
    ? `<a href="${f.pdfUrl}" style="color:${ACCENT};text-decoration:none;">${f.numero}</a>`
      + `<span style="font-size:11px;font-weight:400;color:${GRIS_PALE};">&nbsp;&nbsp;PDF</span>`
    : f.numero

  let echeance = '&mdash;'
  if (f.echeance) {
    const enRetard = retard !== null && retard > 0 && !estCredit
    const suffixe = !enRetard
      ? ''
      : retard > SEUIL_RETARD_ROUGE
        ? `<span style="color:${ALERTE};">&nbsp;&middot;&nbsp;${retard} j</span>`
        : `&nbsp;&middot;&nbsp;${retard} j`
    echeance = fmtDate(f.echeance) + suffixe
  }

  return `<tr>\n`
    + `<td align="left" style="${cell}font-size:14px;font-weight:600;color:${ENCRE_FORTE};">${numero}</td>\n`
    + `<td align="right" style="${cell}font-size:15px;font-weight:600;color:${estCredit ? CREDIT : ENCRE_FORTE};">${fmtEuros(f.restedu)}</td>\n`
    + `<td align="right" style="${cell}font-size:13px;color:${GRIS};">${echeance}</td>\n`
    + `</tr>\n`
}

/**
 * Le tableau des factures.
 *
 * Deux bandes très pâles — l'en-tête de colonnes et le total — lui donnent ses
 * bords sans qu'on ait à le cerner d'un cadre.
 */
function tableauFactures(factures: FactureLigne[]): string {
  const total = factures.reduce((s, f) => s + f.restedu, 0)
  const totalCell = `padding:14px ${MARGE}px;background-color:${BANDE};`

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LARGEUR}" style="width:${LARGEUR}px;max-width:${LARGEUR}px;border-collapse:collapse;">\n`
    + `<tr>\n`
    + enTeteColonne('FACTURE', 'left', COL_FACTURE)
    + enTeteColonne('RESTANT D&Ucirc;', 'right', COL_MONTANT)
    + enTeteColonne('&Eacute;CH&Eacute;ANCE', 'right', COL_ECHEANCE)
    + `</tr>\n`
    + factures.map((f, i) => buildRow(f, i === factures.length - 1)).join('')
    + `<tr>\n`
    + `<td align="left" style="${totalCell}${POL}font-size:13px;font-weight:700;color:${ENCRE_FORTE};">Solde net</td>\n`
    + `<td align="right" style="${totalCell}${POL}font-size:18px;font-weight:700;color:${total < 0 ? CREDIT : ALERTE};">${fmtEuros(total)}</td>\n`
    + `<td style="${totalCell}"></td>\n`
    + `</tr>\n`
    + `</table>\n`
}

/**
 * Les avoirs disponibles, sous le tableau des factures.
 *
 * Plus de boîte verte : un intitulé sur la même bande pâle que le tableau
 * principal, et le vert réservé aux montants — c'est là qu'il signifie quelque
 * chose. La boîte colorée entrait en concurrence avec le tableau des factures,
 * qui est le vrai sujet du mail.
 */
function buildAvoirsBlock(avoirs: AvoirLigne[]): string {
  if (!avoirs.length) return ''
  const total = avoirs.reduce((s, a) => s + Math.abs(a.montant), 0)
  const pluriel = avoirs.length > 1 ? 'S' : ''

  const lignes = avoirs.map((a, i) => {
    const bordure = i === avoirs.length - 1 ? '' : `border-bottom:1px solid ${FILET_PALE};`
    const cell = `padding:11px ${MARGE}px;${bordure}${POL}${EXACT}line-height:18px;`
    // L'intitulé occupe un colspan : sans largeur sur la PREMIÈRE ligne de
    // données, le moteur répartit les colonnes tout seul et les montants des
    // avoirs ne tombent plus dans l'axe de ceux des factures.
    const l = (n: number) => (i === 0 ? ` width="${n}"` : '')
    return `<tr>\n`
      + `<td align="left"${l(COL_FACTURE)} style="${cell}font-size:13px;color:${ENCRE};">${a.numero}</td>\n`
      + `<td align="right"${l(COL_MONTANT)} style="${cell}font-size:13px;font-weight:600;color:${CREDIT};">${fmtEuros(Math.abs(a.montant))}</td>\n`
      + `<td align="right"${l(COL_ECHEANCE)} style="${cell}font-size:12px;color:${GRIS};">${fmtDate(a.echeance)}</td>\n`
      + `</tr>\n`
  }).join('')

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LARGEUR}" style="width:${LARGEUR}px;max-width:${LARGEUR}px;border-collapse:collapse;">\n`
    + `<tr>\n`
    + `<td colspan="3" align="left" style="padding:9px ${MARGE}px;background-color:${BANDE};border-bottom:1px solid ${FILET};${POL}font-size:10px;font-weight:700;color:${GRIS_MOYEN};letter-spacing:.08em;">AVOIR${pluriel} DISPONIBLE${pluriel} &mdash; ${fmtEuros(total)} &Agrave; D&Eacute;DUIRE</td>\n`
    + `</tr>\n`
    + lignes
    + `</table>\n`
}

/**
 * Mention Ockham — texte seul, l'hexagone SVG ne survivait à aucun client.
 *
 * ELLE EST EN PIED DE DOCUMENT, ET NON COLLÉE AU TABLEAU. Dans la première
 * version de la refonte elle suivait le tableau, donc elle s'insérait là où le
 * scénario place [Tableau Factures] — c'est-à-dire en plein milieu du corps.
 * Défaut vu sur un envoi réel.
 */
function blocMention(): string {
  return bloc(
    `Propuls&eacute; par <a href="https://www.ockham-finance.com" target="_blank" style="color:${GRIS_PALE};text-decoration:none;">Ockham Finance</a>`,
    '22px 20px',
    `font-size:11px;color:${GRIS_PALE};`,
  )
}

/**
 * Enveloppe du document. Le seul bloc <style> est entre commentaires
 * conditionnels : il n'est lu que par Outlook, et son absence ailleurs ne
 * change rien puisque tout le reste est en ligne.
 */
function documentHtml(contenu: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>Relance</title>
<!--[if mso]>
<style type="text/css">
  table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  body, table, td, p, a, span { font-family:'Segoe UI', Arial, sans-serif !important; }
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#ffffff;">
<tr><td align="left" style="padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LARGEUR}" style="width:${LARGEUR}px;max-width:${LARGEUR}px;border-collapse:collapse;">
${contenu}
</table>
</td></tr>
</table>
</body>
</html>`
}

function buildHtml(
  corps: string,
  factures: FactureLigne[],
  signature: string | null,
  avoirs: AvoirLigne[] = [],
  nomOrg: string | null = null,
): string {
  if (UTILISER_MODELE_HISTORIQUE) return buildHtmlHistorique(corps, factures, signature, avoirs)

  // 24 px sous le dernier tableau, pour retrouver l'écart qui sépare déjà deux
  // paragraphes. Sans cela la phrase qui suit le total est collée à la bande.
  const tableau = avoirs.length
    ? blocPleineLargeur(tableauFactures(factures), '6px 22px')
      + blocPleineLargeur(buildAvoirsBlock(avoirs), '0px 24px')
    : blocPleineLargeur(tableauFactures(factures), '6px 24px')

  const segments = corps.split(/\[Tableau Factures\]/i)
  let contenu = ''
  segments.forEach((seg, i) => {
    contenu += textToHtmlBlocs(seg)
    if (i < segments.length - 1) contenu += tableau
  })

  // La signature vient de la boîte de l'opérateur et porte ses propres styles.
  // On l'isole par un filet plutôt que de tenter de la normaliser.
  const sig = signature ? bloc(signature, '22px 0px', '', `border-top:1px solid ${FILET};`) : ''

  return documentHtml(
    blocEnTete(nomOrg)
    + espace(26)
    + contenu
    + sig
    + blocMention(),
  )
}

// ── Rôle du contact : comparaison tolérante ────────────────────────────────
//
// role_contact est du texte libre depuis la migration 040, et l'import écrit la
// valeur du fichier telle quelle. Mesuré le 2026-10-31 : 1357 contacts sur 2504
// portaient « Relance » ou « Comptabilité », avec majuscule ou accent. La
// comparaison stricte les écartait tous — 54 % de la base, et 100 % des
// contacts issus d'un import. Le robot n'avait presque personne à qui écrire.
//
// On compare donc sur une forme normalisée. Le filtre SQL en amont ne sert qu'à
// borner le volume : c'est ce test-ci qui fait autorité.
const ROLES_RELANCABLES = ['relance', 'comptabilite']

function normaliserRole(r: string | null | undefined): string {
  return (r ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Lit TOUTES les lignes d'une requete, par lots de 1000.
 *
 * POURQUOI. Aucune des requetes en masse de cette fonction n'avait de limite
 * ni de pagination : elles dependaient du plafond de lignes de l'API, qui
 * coupe EN SILENCE au-dela. Mesure du 2026-11-16 sur SAS MELEZE :
 *
 *   factures ouvertes  3 021 lignes
 *   contacts relance   2 547 lignes
 *
 * Le robot n'en voyait donc qu'une fraction, et concluait de bonne foi
 * « aucune facture echue » ou « aucun contact actif » pour des clients qui
 * avaient les deux. Constate sur MONTBLANC FRANCE : une facture de 264,50 €
 * echue depuis le 19 octobre, invisible pour le robot.
 *
 * L'ORDRE EST OBLIGATOIRE, et c'est le piege de la pagination. Sans ORDER BY,
 * Postgres renvoie les lignes dans un ordre arbitraire : deux lots successifs
 * peuvent se chevaucher ou laisser un trou. Paginer sans trier, c'est remplacer
 * une troncature par une perte aleatoire — pire, parce qu'elle serait
 * intermittente.
 *
 * UNE ERREUR INTERROMPT TOUT, volontairement. Le code precedent ne lisait que
 * « data » et jetait « error » : une requete en echec donnait un tableau vide, et
 * le robot continuait comme si l'organisation n'avait ni facture ni contact.
 * Mieux vaut un echec visible qu'une campagne silencieusement vide.
 */
// deno-lint-ignore no-explicit-any
async function lireTout<T>(construire: () => any, colonneOrdre: string): Promise<{ data: T[] }> {
  const LOT = 1000
  const out: T[] = []
  for (let debut = 0; ; debut += LOT) {
    const { data, error } = await construire()
      .order(colonneOrdre, { ascending: true })
      .range(debut, debut + LOT - 1)
    if (error) throw new Error(`lecture ${colonneOrdre} : ${error.message ?? error}`)
    const lot = (data ?? []) as T[]
    out.push(...lot)
    if (lot.length < LOT) break
  }
  return { data: out }
}

function estRoleRelancable(r: string | null | undefined): boolean {
  return ROLES_RELANCABLES.includes(normaliserRole(r))
}

// ── Envoi Resend Batch (jusqu'à 100 emails par appel) ───────────────────────

interface EmailPayload { from: string; to: string[]; subject: string; html: string }
interface PendingEmail {
  to: string[]; objet: string; html: string
  codeDso: string; nomClient: string; montantDu: number
  facturesEligibles: { numero_piece: string; montant_ttc: number; reste_du: number; date_echeance: string | null; axonaut_pdf_url: string | null }[]
  scenarioId: string
}

async function envoyerResendBatch(emails: EmailPayload[]): Promise<(string | null)[]> {
  try {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emails),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      console.error('[relance-auto] Resend batch error:', res.status, await res.text().catch(() => ''))
      return emails.map(() => null)
    }
    const data = await res.json() as { data?: { id: string }[] }
    return (data.data ?? []).map(d => d.id ?? null)
  } catch (err) {
    console.error('[relance-auto] Resend batch timeout:', err)
    return emails.map(() => null)
  }
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET)
    return json({ error: 'unauthorized' }, 401)

  // Mode simulation : appeler avec ?dry_run=1. La fonction fait TOUT le travail
  // — selection, eligibilite, choix du scenario, construction des emails — puis
  // s'arrete avant l'envoi. Aucun email, aucune ecriture en base.
  // Sert a repondre a la question que le journal ne savait pas traiter :
  // pourquoi tel client a-t-il ete ecarte ?
  const dryRun = new URL(req.url).searchParams.get('dry_run') === '1'

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const today = new Date().toISOString().split('T')[0]
    let nbEnvoyes = 0
    let nbSkip = 0
    let nbErreurs = 0
    // Une ligne par client examine, avec la decision et sa raison.
    const decisions: { org: string; client: string; nom: string; decision: string; detail?: string }[] = []

    // 1. Orgs avec mode auto actif
    const { data: orgs, error: errOrgs } = await supabase
      .from('organisations')
      .select('id, nom, delai_echeance_jours, delai_declenchement_relance_jours, delai_rerelance_jours, signature_auto')
      .eq('relance_auto_active', true)
    if (errOrgs) return json({ error: errOrgs.message }, 500)

    for (const org of (orgs ?? [])) {
      const orgId            = org.id as string
      const orgNom           = org.nom as string
      const delaiEcheanceOrg = (org.delai_echeance_jours as number) ?? 30
      const delaiDeclenche   = (org.delai_declenchement_relance_jours as number) ?? 7
      const delaiRerelance   = (org.delai_rerelance_jours as number) ?? 30
      const signatureAuto    = org.signature_auto as string | null
      let nbEnvoyesOrg = 0
      let nbSkipOrg    = 0
      let nbErreursOrg = 0

      // 2. Scénario de premier niveau de l'org, EXTERNE uniquement.
      //
      // Le filtre sur le type est indispensable : un scénario interne est
      // rédigé pour un commercial (« Ton client X présente un encours… »), pas
      // pour le client. La colonne type existe depuis la migration 152 et
      // n'était pas lue ici — troisième oubli après le calcul du niveau de
      // relance et le front, tous deux corrigés le 24/09/2026.
      //
      // Le tri secondaire sur created_at rend le choix DÉTERMINISTE. Sans lui,
      // deux scénarios de même niveau se disputent la première place sans
      // aucune règle : SAS MELEZE en avait deux au niveau 1, dont un interne.
      // Les 35 envois passés ont tous pris le bon, par chance et non par règle.
      const { data: scenarios } = await supabase
        .from('scenarios_relance')
        .select('id, nom, niveau, objet, corps_texte')
        .eq('organisation_id', orgId)
        .eq('type', 'externe')
        .order('niveau', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
      const scenario = scenarios?.[0]
      if (!scenario) { console.log(`[relance-auto] org ${orgId} : aucun scénario externe — skip`); continue }
      // Tracé dans les Invocations : on doit pouvoir dire après coup quel
      // message est parti, sans avoir à le déduire.
      console.log(`[relance-auto] org ${orgId} : scénario « ${scenario.nom} » (niveau ${scenario.niveau}, externe)`)

      // 3. Clients éligibles
      const { data: clients } = await supabase
        .from('clients')
        .select('code_dso, nom, delai_echeance_jours, relance_bloquee')
        .eq('organisation_id', orgId)
        .eq('relance_auto_active', true)
        .eq('relance_auto_alerte', false)
        .is('statut_juridique', null)
      if (!clients?.length) {
        if (dryRun) { continue }
        await supabase.from('organisations').update({
          relance_auto_derniere_exec:   new Date().toISOString(),
          relance_auto_dernier_statut:  'ok',
          relance_auto_dernier_message: '0 envoyé · 0 ignoré · 0 erreur',
        } as never).eq('id', orgId)
        continue
      }

      // 4. Chargement batch : dédup + contacts + factures + avoirs + crédits 411 en 5 requêtes
      const seuilDedup = new Date(Date.now() - delaiRerelance * 86_400_000).toISOString()
      // echanges_clients.echange_le est une colonne date, pas un horodatage.
      // Postgres sait convertir une chaîne ISO complète, mais on ne fait pas
      // reposer une exclusion d'envoi sur un cast implicite : on compare une
      // date à une date.
      const seuilDedupDate = seuilDedup.slice(0, 10)
      const [dedupRes, contactsRes, facturesRes, avoirsRes, credits411Res, nePasRelancerRes, manuellesRes, echangesRes] = await Promise.all([
        lireTout(() => supabase.from('relances_auto_log').select('code_client, id')
          .eq('organisation_id', orgId).gte('envoye_le', seuilDedup), 'id'),
        // Filtre large volontairement : il attrape toutes les variantes de casse
        // et d'accent ('Relance', 'Comptabilité', 'Relances'...). Le tri fin est
        // fait par estRoleRelancable() plus bas.
        lireTout(() => supabase.from('contacts_client').select('code_client, email, role_contact, id')
          .eq('organisation_id', orgId).eq('actif', true)
          .or('role_contact.ilike.relance%,role_contact.ilike.compta%'), 'id'),
        // P1 : exclure les pseudo-factures 411 des relances automatiques
        lireTout(() => supabase.from('factures').select('code_client, numero_piece, montant_ttc, reste_du, date_echeance, date_emission, axonaut_pdf_url')
          .eq('organisation_id', orgId).eq('est_avoir', false).gt('reste_du', 0.005)
          .not('numero_piece', 'like', '411_%'), 'numero_piece'),
        lireTout(() => supabase.from('factures').select('code_client, numero_piece, montant_ttc, reste_du, date_echeance, date_emission')
          .eq('organisation_id', orgId).eq('est_avoir', true).neq('reste_du', 0), 'numero_piece'),
        // P3 : crédits 411 non dispatchés pour bloquer la relance si dette couverte
        lireTout(() => supabase.from('factures').select('code_client, reste_du, numero_piece')
          .eq('organisation_id', orgId).like('numero_piece', '411_%').lt('reste_du', -0.005), 'numero_piece'),
        // Factures qu'un opérateur a explicitement sorties du circuit de relance
        // (litige, plan de règlement, avoir en cours). Le drapeau vit sur le
        // commentaire de facture depuis la migration 023, et n'était lu que par
        // le navigateur : le robot relançait quand même.
        lireTout(() => supabase.from('commentaires_factures').select('numero_piece')
          .eq('organisation_id', orgId).eq('ne_pas_relancer', true), 'numero_piece'),
        // Relances MANUELLES récentes. La déduplication ne regardait que
        // relances_auto_log : un client relancé à la main la veille recevait
        // quand même la relance automatique le lendemain. Même fenêtre que la
        // déduplication automatique, et relances externes seulement — une
        // notification interne à un commercial n'est pas un contact client.
        lireTout(() => supabase.from('relances').select('code_client, id')
          .eq('organisation_id', orgId).eq('type', 'externe')
          .neq('statut', 'brouillon')
          .not('envoyee_le', 'is', null)
          .gte('envoyee_le', seuilDedup), 'id'),
        // Échanges tracés HORS d'Ockham : un appel, ou un mail parti d'une
        // boîte personnelle (table echanges_clients, migrations 182 et 183).
        // Sans cette lecture, un client qu'un opérateur a eu au téléphone hier
        // recevait quand même la relance automatique le lendemain matin.
        // L'écran le montrait pourtant en vert : le robot contredisait
        // l'interface, et c'est l'opérateur qui passait pour avoir mal fait.
        //
        // Les deux canaux comptent, appel comme mail. Même fenêtre que les
        // relances : deux fenêtres différentes, ce serait deux règles à
        // expliquer aux équipes et à maintenir. Arrêté avec Clément le
        // 2026-11-02.
        lireTout(() => supabase.from('echanges_clients').select('code_client, id')
          .eq('organisation_id', orgId)
          // Un echange supprime par un operateur ne compte plus. Sans ce
          // filtre, un appel enregistre par erreur bloquerait la relance
          // automatique de ce client pendant toute la fenetre, et le bouton
          // Supprimer de l'interface serait un mensonge. Migration 186.
          .eq('archivee', false)
          .gte('echange_le', seuilDedupDate), 'id'),
      ])

      // Un client est écarté s'il a eu un contact récent, quelle qu'en soit la
      // forme : relance du robot, relance d'un opérateur, ou échange tracé hors
      // de l'outil. Les trois comptent, parce que c'est le client qui a été
      // contacté et que lui ne fait pas la différence.
      //
      // Ce qui n'entre PAS ici : le niveau de relance. Il mesure l'escalade sur
      // des factures impayées, pas l'activité, et il se calcule en SQL sans
      // jamais lire echanges_clients.
      const dedupSet = new Set((dedupRes.data ?? []).map((r: { code_client: string }) => r.code_client))
      for (const r of (manuellesRes.data ?? [])) dedupSet.add((r as { code_client: string }).code_client)
      const echangesSet = new Set(
        (echangesRes.data ?? []).map((r: { code_client: string }) => r.code_client)
      )
      for (const code of echangesSet) dedupSet.add(code)

      // Un opérateur a dit « ne pas relancer cette facture ». C'est une décision
      // humaine, elle prime sur toute règle automatique.
      const nePasRelancerSet = new Set(
        (nePasRelancerRes.data ?? []).map((r: { numero_piece: string }) => r.numero_piece)
      )

      // P3 : somme des crédits 411 par client (valeurs négatives)
      const credits411Map = new Map<string, number>()
      for (const c of (credits411Res.data ?? [])) {
        const k = c.code_client as string
        credits411Map.set(k, (credits411Map.get(k) ?? 0) + (c.reste_du as number))
      }

      const contactsMap = new Map<string, { email: string; role_contact: string }[]>()
      for (const c of (contactsRes.data ?? [])) {
        if (!estRoleRelancable(c.role_contact as string)) continue
        const k = c.code_client as string
        if (!contactsMap.has(k)) contactsMap.set(k, [])
        contactsMap.get(k)!.push({ email: c.email as string, role_contact: c.role_contact as string })
      }

      const facturesMap = new Map<string, { numero_piece: string; montant_ttc: number; reste_du: number; date_echeance: string | null; date_emission: string; axonaut_pdf_url: string | null }[]>()
      for (const f of (facturesRes.data ?? [])) {
        const k = f.code_client as string
        if (!facturesMap.has(k)) facturesMap.set(k, [])
        facturesMap.get(k)!.push({
          numero_piece:    f.numero_piece as string,
          montant_ttc:     f.montant_ttc as number,
          reste_du:        f.reste_du as number,
          date_echeance:   f.date_echeance as string | null,
          date_emission:   f.date_emission as string,
          axonaut_pdf_url: f.axonaut_pdf_url as string | null,
        })
      }

      const avoirsMap = new Map<string, { numero_piece: string; montant_ttc: number; reste_du: number; date_echeance: string | null; date_emission: string }[]>()
      for (const a of (avoirsRes.data ?? [])) {
        const k = a.code_client as string
        if (!avoirsMap.has(k)) avoirsMap.set(k, [])
        avoirsMap.get(k)!.push({
          numero_piece:  a.numero_piece as string,
          montant_ttc:   a.montant_ttc as number,
          reste_du:      a.reste_du as number,
          date_echeance: a.date_echeance as string | null,
          date_emission: a.date_emission as string,
        })
      }

      // 5. Préparer les emails en mémoire
      const pending: PendingEmail[] = []

      for (const client of clients) {
        const codeDso             = client.code_dso as string
        const nomClient           = client.nom as string
        const delaiEcheanceClient = (client.delai_echeance_jours as number | null) ?? delaiEcheanceOrg

        // STOP : relances suspendues par decision humaine. Verifie AVANT la
        // deduplication, parce que c'est un motif plus fort — et parce que le
        // journal doit dire « suspendu » et non « deja relance recemment »,
        // sinon on chercherait longtemps pourquoi ce client ne part jamais.
        if (client.relance_bloquee === true) {
          decisions.push({ org: orgNom, client: codeDso, nom: nomClient, decision: 'ecarte',
            detail: 'relances suspendues sur ce compte (STOP)' })
          nbSkip++; nbSkipOrg++; continue
        }

        if (dedupSet.has(codeDso)) {
          // Le motif distingue l'échange des deux autres cas : « déjà relancé »
          // serait faux pour un appel, et la personne qui relit le journal pour
          // comprendre une non-relance a besoin de savoir laquelle des trois
          // sources l'a écarté.
          const motif = echangesSet.has(codeDso)
            ? `contact client trace hors Ockham dans les ${delaiRerelance} derniers jours (appel ou mail)`
            : `deja relance dans les ${delaiRerelance} derniers jours (robot ou operateur)`
          decisions.push({ org: orgNom, client: codeDso, nom: nomClient, decision: 'ecarte', detail: motif })
          nbSkip++; nbSkipOrg++; continue
        }

        const contacts       = contactsMap.get(codeDso) ?? []
        const relanceC       = contacts.filter(c => normaliserRole(c.role_contact) === 'relance')
        const compteC        = contacts.filter(c => normaliserRole(c.role_contact) === 'comptabilite')
        const destinataires  = (relanceC.length ? relanceC : compteC).map(c => c.email).filter(Boolean)
        if (!destinataires.length) {
          decisions.push({ org: orgNom, client: codeDso, nom: nomClient, decision: 'ecarte',
            detail: 'aucun contact actif avec le role relance ou comptabilite' })
          nbSkip++; nbSkipOrg++; continue
        }

        const facturesEligibles = (facturesMap.get(codeDso) ?? []).filter(f => {
          // Décision humaine : on ne relance pas, quelle que soit l'échéance.
          // Si toutes les factures du client sont dans ce cas, il ressort sans
          // facture éligible et se retrouve écarté un peu plus bas.
          if (nePasRelancerSet.has(f.numero_piece)) return false
          const echeance     = f.date_echeance
            ? new Date(f.date_echeance)
            : new Date(new Date(f.date_emission).getTime() + delaiEcheanceClient * 86_400_000)
          const declenchement = new Date(echeance.getTime() + delaiDeclenche * 86_400_000)
          return declenchement.toISOString().split('T')[0] <= today
        })
        if (!facturesEligibles.length) {
          decisions.push({ org: orgNom, client: codeDso, nom: nomClient, decision: 'ecarte',
            detail: `aucune facture echue depuis plus de ${delaiDeclenche} jours, ou toutes marquees "ne pas relancer"` })
          nbSkip++; nbSkipOrg++; continue
        }

        const montantDu   = facturesEligibles.reduce((s, f) => s + f.reste_du, 0)
        // P3 : si les crédits 411 non dispatchés couvrent totalement la dette, pas de relance
        const credit411   = credits411Map.get(codeDso) ?? 0  // valeur négative
        const montantNet  = montantDu + credit411
        if (montantNet <= 0.005) {
          decisions.push({ org: orgNom, client: codeDso, nom: nomClient, decision: 'ecarte',
            detail: 'avoirs et credits couvrent la totalite de la dette' })
          nbSkip++; nbSkipOrg++; continue
        }

        const ctx         = { nomClient, codeClient: codeDso, montantDu, nomOrg: orgNom }
        const objet     = resolveBalises(scenario.objet as string, ctx)
        const corps     = resolveBalises(scenario.corps_texte as string, ctx)
        const lignes: FactureLigne[] = facturesEligibles.map(f => ({
          numero: f.numero_piece, montantTtc: f.montant_ttc, restedu: f.reste_du,
          echeance: f.date_echeance, pdfUrl: f.axonaut_pdf_url,
        }))
        const avoirsEligibles = (avoirsMap.get(codeDso) ?? []).filter(a => {
          const echeance      = a.date_echeance
            ? new Date(a.date_echeance)
            : new Date(new Date(a.date_emission).getTime() + delaiEcheanceClient * 86_400_000)
          const declenchement = new Date(echeance.getTime() + delaiDeclenche * 86_400_000)
          return declenchement.toISOString().split('T')[0] <= today
        })
        const lignesAvoirs: AvoirLigne[] = avoirsEligibles.map(a => ({
          numero: a.numero_piece, montant: a.reste_du, echeance: a.date_echeance,
        }))
        const html = buildHtml(corps, lignes, signatureAuto, lignesAvoirs, orgNom)

        decisions.push({ org: orgNom, client: codeDso, nom: nomClient, decision: 'relance',
          detail: `${facturesEligibles.length} facture(s), ${fmtEuros(montantNet)} du, vers ${destinataires.join(', ')}` })
        pending.push({ to: destinataires, objet, html, codeDso, nomClient, montantDu, facturesEligibles, scenarioId: scenario.id as string })
      }

      // 6. Envoi par batch de 100 + logs en batch
      // En simulation on s'arrete ici : ni Resend, ni ecriture dans
      // relances_auto_log, ni mise a jour de l'organisation.
      if (dryRun) {
        console.log(`[relance-auto][SIMULATION] org ${orgNom} : ${pending.length} client(s) partiraient, ${nbSkipOrg} ecarte(s)`)
        continue
      }
      const BATCH_SIZE = 100
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch   = pending.slice(i, i + BATCH_SIZE)
        const payload = batch.map(p => ({ from: FROM_EMAIL, to: p.to, subject: p.objet, html: p.html }))
        const ids     = await envoyerResendBatch(payload)

        const logsAInserer: object[] = []
        for (let j = 0; j < batch.length; j++) {
          const resendId = ids[j] ?? null
          if (!resendId) { nbErreurs++; nbErreursOrg++; continue }
          const p = batch[j]
          for (const f of p.facturesEligibles) {
            logsAInserer.push({
              organisation_id: orgId, code_client: p.codeDso, numero_facture: f.numero_piece,
              scenario_id: p.scenarioId, statut: 'envoye', resend_id: resendId,
              contact_email: p.to[0] ?? null, montant_total: p.montantDu, corps_html: p.html,
            })
          }
          nbEnvoyes++; nbEnvoyesOrg++
          console.log(`[relance-auto] ${p.codeDso} → ${p.to.join(', ')} (${p.facturesEligibles.length} factures)`)
        }
        if (logsAInserer.length) await supabase.from('relances_auto_log').insert(logsAInserer)
      }

      await supabase.from('organisations').update({
        relance_auto_derniere_exec:   new Date().toISOString(),
        relance_auto_dernier_statut:  nbErreursOrg > 0 ? 'partiel' : 'ok',
        relance_auto_dernier_message: `${nbEnvoyesOrg} envoyé${nbEnvoyesOrg !== 1 ? 's' : ''} · ${nbSkipOrg} ignoré${nbSkipOrg !== 1 ? 's' : ''} · ${nbErreursOrg} erreur${nbErreursOrg !== 1 ? 's' : ''}`,
      } as never).eq('id', orgId)
    }

    // Simulation : on sort AVANT d'ecrire quoi que ce soit, y compris le
    // journal. Un tour a blanc ne doit laisser aucune trace, sinon il fausse
    // la lecture du journal reel.
    if (dryRun) {
      return json({
        simulation: true,
        aucun_email_envoye: true,
        partiraient: decisions.filter(d => d.decision === 'relance').length,
        ecartes: decisions.filter(d => d.decision === 'ecarte').length,
        detail: decisions,
      })
    }

    await supabase.from('cron_runs').insert({
      fonction: 'relance-auto',
      statut: nbErreurs > 0 ? 'partiel' : 'ok',
      nb_traite: nbEnvoyes,
      message: `${nbEnvoyes} envoyés · ${nbSkip} skippés · ${nbErreurs} erreurs`,
    })

    return json({ ok: true, nbEnvoyes, nbSkip, nbErreurs })

  } catch (err) {
    console.error('[relance-auto] erreur non gérée:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
