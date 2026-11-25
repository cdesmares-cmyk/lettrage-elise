// Construction du mail de relance client.
//
// ─── POURQUOI CE FICHIER A ÉTÉ RÉÉCRIT, le 2026-11-25 ───────────────────────
//
// Un HTML d'email n'est pas un document, c'est une PROPOSITION. Il est rendu
// par un moteur qu'on ne choisit pas, après être passé par des relais qui ont
// le droit de le réécrire. Trois transformations successives :
//
//   à l'envoi      le fournisseur ré-emballe le HTML dans sa propre enveloppe
//   à la réception le client assainit (il retire <style>, <svg>, position…)
//                  puis rend — et Outlook Windows rend avec le moteur de WORD
//   au retransfert le client reprend le message TEL QU'IL L'A RENDU, le
//                  re-sérialise et le ré-assainit. Les pertes s'accumulent.
//
// L'ancienne version était écrite comme une page web : mise en page en <div>,
// max-width, border-radius, dégradés, SVG en ligne. Elle s'affichait bien chez
// Gmail, qui est un vrai moteur web, et se disloquait partout ailleurs.
//
// ─── LES RÈGLES QUI EN DÉCOULENT, et qu'il ne faut pas défaire ──────────────
//
//   1. MISE EN PAGE EN TABLEAUX, largeurs en ATTRIBUTS HTML doublées en CSS.
//      Word ignore max-width : une mise en page en <div> s'étale sur toute la
//      largeur de la fenêtre.
//   2. cellpadding/cellspacing/border À ZÉRO sur chaque tableau. Sans eux Word
//      applique ses propres espacements — c'est LA cause de « le tableau ne
//      ressemble plus à rien ».
//   3. AUCUN SVG. Gmail les supprime, Outlook ne les rend pas.
//   4. line-height EN PIXELS + mso-line-height-rule:exactly. Word interprète
//      mal les valeurs relatives.
//   5. Styles EN LIGNE uniquement. Un <style> dans le <head> est retiré par
//      plusieurs clients, dont Gmail historiquement.
//
// border-radius, lui, peut rester : Word l'ignore et affiche des angles
// droits. C'est une dégradation silencieuse, pas une casse.
//
// ─── CE QUI A CHANGÉ CÔTÉ DESIGN, et pourquoi ───────────────────────────────
//
// Constat sur un envoi réel : TOUT était rouge. Chaque montant, chaque badge
// de retard, le total. Un retard de 8 jours criait aussi fort qu'un retard de
// 223 jours. Quand tout crie, plus rien ne s'entend.
//
// La couleur est donc devenue rare et signifiante :
//   teal   uniquement ce qui est CLIQUABLE
//   rouge  uniquement le total, et un retard de plus de 90 jours
//   le reste en encre et en gris
//
// Et les traits ont cédé la place au blanc : plus de boîte autour du tableau,
// plus de fond coloré sur l'en-tête, plus de pastilles. La hiérarchie passe
// par la taille et la graisse. C'est plus sobre — et chacun de ces retraits
// rend aussi le rendu plus sûr.
import {
  buildHtmlFromScenarioHistorique,
  buildHtmlHistorique,
} from './relanceEmailHistorique'

/**
 * Filet de sécurité demandé par Clément.
 *
 * Passer à `true` restaure intégralement le modèle d'avant le 2026-11-25, sans
 * rien toucher d'autre. À utiliser si la refonte pose problème en production.
 *
 * Le robot a sa propre copie de cette bascule : la changer ici ne suffit pas,
 * il faut aussi la changer dans supabase/functions/relance-auto/index.ts ET
 * redéployer la fonction.
 */
export const UTILISER_MODELE_HISTORIQUE = false

export type FactureLigne = {
  numero: string
  montantTtc: number
  restedu: number
  echeance: string | null
  pdfUrl?: string | null
}

const _fmtEuros      = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const _fmtEurosEmail = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtEuros(n: number)      { return _fmtEuros.format(n) }
export function fmtEurosEmail(n: number) { return _fmtEurosEmail.format(n) }
export function fmtDate(iso: string)     { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) }
export function joursDepuis(iso: string) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) }

export function buildCorps(factures: FactureLigne[]) {
  const lignes = factures.map(f =>
    `  • Facture ${f.numero} — ${fmtEuros(f.montantTtc)} TTC — Restant dû : ${fmtEuros(f.restedu)}${f.echeance ? ` — éch. ${fmtDate(f.echeance)}` : ''}`
  ).join('\n')
  return `Bonjour,\n\nNous nous permettons de vous contacter au sujet des factures suivantes en attente de règlement :\n\n${lignes}\n\nNous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais, ou de nous contacter en cas de question ou de litige.\n\nCordialement`
}

// Résout les balises textuelles (sauf [Tableau Factures] qui reste en place)
export function resolveBalises(texte: string, ctx: {
  nomClient: string
  codeClient: string
  montantDu: number
  nomOrg?: string
}): string {
  const dateJour = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  return texte
    .replace(/\[Nom client\]/gi, ctx.nomClient)
    .replace(/\[Code client\]/gi, ctx.codeClient)
    .replace(/\[Montant dû\]/gi, _fmtEurosEmail.format(ctx.montantDu))
    .replace(/\[Date du jour\]/gi, dateJour)
    .replace(/\[Nom organisation\]/gi, ctx.nomOrg ?? '')
}


// ─── La charte du mail ──────────────────────────────────────────────────────
//
// Trois encres, deux signaux. Pas davantage : c'est la contrainte qui produit
// la sobriété, pas l'inverse.

/**
 * Pile de polices volontairement courte.
 *
 * Elle est répétée sur chaque cellule — c'est la seule façon fiable de
 * l'imposer dans Word, qui hérite mal. Chaque caractère compte donc : une pile
 * de 77 caractères pesait 230 octets par ligne de facture, pour rien. Outlook
 * reçoit de toute façon sa propre police par le bloc conditionnel du <head>.
 */
const POLICE = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif"
const LARGEUR = 600

const ENCRE       = '#1F2937'   // texte courant
const ENCRE_FORTE = '#0E1A2B'   // montants et libellés qui portent
const GRIS        = '#94A3B8'   // dates, en-têtes, secondaire
const GRIS_PALE   = '#CBD5E1'   // mentions discrètes
const FILET       = '#E2E8F0'   // séparateur marqué
const FILET_PALE  = '#F1F5F9'   // séparateur entre lignes

/**
 * Teal des liens : #0D9488 et non le #4CC5BB de l'application.
 *
 * Le teal de la charte a un contraste d'environ 2:1 sur blanc — illisible pour
 * un texte, et sous le seuil d'accessibilité. Cette variante plus sombre garde
 * l'identité en restant lisible.
 */
const ACCENT = '#0D9488'

/** Rouge : le total, et un retard qui sort vraiment de l'ordinaire. */
const ALERTE = '#B91C1C'
const CREDIT = '#15803D'

/**
 * Au-delà de ce retard, la date passe en rouge.
 *
 * Toutes les factures d'une relance sont en retard par construction : colorer
 * le retard en soi n'apprend rien. Ce seuil reprend celui de la pastille
 * d'ancienneté de l'application (LignesFactures), pour que l'écran et le mail
 * racontent la même chose.
 */
const SEUIL_RETARD_ROUGE = 90

const COL_FACTURE  = 280
const COL_MONTANT  = 150
const COL_ECHEANCE = LARGEUR - COL_FACTURE - COL_MONTANT

/**
 * Les styles de texte sont portés par la CELLULE, jamais par un <span> dedans.
 *
 * MESURE, le 2026-11-25. Première version de cette refonte : une constante
 * `font-family:…;mso-line-height-rule:exactly;` répétée sur chaque cellule ET
 * sur le span à l'intérieur. Résultat : 2 289 octets par ligne de facture,
 * contre 1 837 pour l'ancien modèle avec ses SVG. Le retrait des images était
 * entièrement mangé par la répétition des styles.
 *
 * Ce qui rend la répétition évitable : Word n'hérite pas du <body> ni du
 * <table> vers le <td>, mais il hérite correctement du <td> vers son contenu.
 * Styler la cellule suffit donc, et le span ne sert plus que lorsqu'un fragment
 * doit s'écarter du reste — la mention PDF, un retard en rouge.
 */
const POL = `font-family:${POLICE};`

/** Word interprète mal les line-height relatifs. À poser avec chaque line-height. */
const EXACT = 'mso-line-height-rule:exactly;'


// ─── Les briques ────────────────────────────────────────────────────────────
//
// Chaque brique termine par un retour à la ligne, et chaque cellule occupe sa
// propre ligne.
//
// POURQUOI : le SMTP impose 998 octets par ligne (RFC 5321). Au-delà, un relais
// a le droit de couper — au milieu d'un attribut, d'une entité, n'importe où. La
// première version de cette refonte produisait une ligne de 12 932 caractères :
// j'étais en train de réintroduire exactement la classe de panne que ce fichier
// corrige. Les retours à la ligne entre balises sont sans effet sur le rendu.

/** Une ligne de contenu dans la colonne principale. */
function bloc(contenu: string, padding: string, styleTexte = ''): string {
  return `<tr><td align="left" style="padding:${padding};${POL}${styleTexte}">${contenu}</td></tr>\n`
}

/** Le corps du scénario, converti en paragraphes. */
function blocsTexte(texte: string): string {
  return texte
    .split(/\n{2,}/)
    .filter(p => p.trim())
    .map(p => bloc(
      p.trim().replace(/\n/g, '<br />'),
      '0 0 18px 0',
      `${EXACT}font-size:15px;line-height:26px;color:${ENCRE};`,
    ))
    .join('')
}

function enTeteColonne(libelle: string, align: 'left' | 'right', largeur: number): string {
  // Les libellés sont écrits en majuscules dans le HTML plutôt que par
  // text-transform : Word ignore cette propriété.
  return `<td align="${align}" width="${largeur}" style="padding:0 0 10px 0;border-bottom:1px solid ${FILET};${POL}font-size:10px;font-weight:700;color:${GRIS};letter-spacing:.08em;">${libelle}</td>\n`
}

function ligneFacture(f: FactureLigne, derniere: boolean): string {
  const retard = f.echeance ? joursDepuis(f.echeance) : null
  const estCredit = f.restedu < 0

  // Le trait disparaît sous la dernière ligne : c'est l'espace qui sépare du
  // total, pas un deuxième filet collé au premier.
  const bordure = derniere ? '' : `border-bottom:1px solid ${FILET_PALE};`
  const cell = `padding:13px 0;${bordure}${POL}${EXACT}line-height:20px;`

  // Le numéro et sa couleur sont sur la cellule ; le <a> ne garde que ce qui
  // lui est propre, parce que les clients imposent leur propre couleur de lien.
  const numero = f.pdfUrl
    ? `<a href="${f.pdfUrl}" style="color:${ACCENT};text-decoration:none;">${f.numero}</a>`
      + `<span style="font-size:11px;font-weight:400;color:${GRIS_PALE};">&nbsp;&nbsp;PDF</span>`
    : f.numero

  let echeance = '&mdash;'
  if (f.echeance) {
    // Le retard n'est coloré que s'il dépasse le seuil : sinon il n'y a pas de
    // span du tout, et la cellule porte seule la mise en forme.
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
    + `<td align="right" style="${cell}font-size:15px;font-weight:600;color:${estCredit ? CREDIT : ENCRE_FORTE};">${_fmtEurosEmail.format(f.restedu)}</td>\n`
    + `<td align="right" style="${cell}font-size:13px;color:${GRIS};">${echeance}</td>\n`
    + `</tr>\n`
}

/** Le tableau des factures, sans boîte ni fond : deux filets et du blanc. */
function tableauFactures(factures: FactureLigne[]): string {
  const total = factures.reduce((s, f) => s + f.restedu, 0)
  const totalBord = `padding:18px 0 0 0;border-top:1px solid ${FILET};`

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LARGEUR}" style="width:${LARGEUR}px;max-width:${LARGEUR}px;border-collapse:collapse;">\n`
    + `<tr>\n`
    + enTeteColonne('FACTURE', 'left', COL_FACTURE)
    + enTeteColonne('RESTANT D&Ucirc;', 'right', COL_MONTANT)
    + enTeteColonne('&Eacute;CH&Eacute;ANCE', 'right', COL_ECHEANCE)
    + `</tr>\n`
    + factures.map((f, i) => ligneFacture(f, i === factures.length - 1)).join('')
    + `<tr>\n`
    + `<td align="left" style="${totalBord}${POL}font-size:13px;font-weight:600;color:${ENCRE_FORTE};">Solde net</td>\n`
    + `<td align="right" style="${totalBord}${POL}font-size:20px;font-weight:700;color:${total < 0 ? CREDIT : ALERTE};">${_fmtEurosEmail.format(total)}</td>\n`
    + `<td style="${totalBord}"></td>\n`
    + `</tr>\n`
    + `</table>\n`
}

/** Mention Ockham — texte seul, l'hexagone SVG ne survivait à aucun client. */
const MENTION_OCKHAM =
  `Propuls&eacute; par <a href="https://www.ockham-finance.com" target="_blank" style="color:${GRIS_PALE};text-decoration:none;">Ockham Finance</a>`

/**
 * Enveloppe du document.
 *
 * Le <head> ne porte aucun style de mise en forme — tout est en ligne. Le seul
 * bloc <style> est entre commentaires conditionnels : il n'est lu que par
 * Outlook, et son absence ailleurs ne change rien.
 */
function document(contenu: string): string {
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

/**
 * Bloc signature.
 *
 * La signature vient de la boîte mail de l'opérateur et porte ses propres
 * styles — sa propre police, parfois sa propre couleur. On ne peut pas la
 * normaliser sans la dénaturer : on se contente de l'isoler par un filet et de
 * l'air, là où l'ancienne version ajoutait une barre teal qui entrait en
 * concurrence avec elle.
 */
function blocSignature(signature: string | null): string {
  if (!signature) return ''
  return bloc(signature, `28px 0 0 0;border-top:1px solid ${FILET}`)
}


// ─── Les deux entrées publiques ─────────────────────────────────────────────

/** Construit le mail depuis un scénario contenant [Tableau Factures]. */
export function buildHtmlFromScenario(corps: string, factures: FactureLigne[], signature: string | null): string {
  if (UTILISER_MODELE_HISTORIQUE) return buildHtmlFromScenarioHistorique(corps, factures, signature)

  const tableau = bloc(tableauFactures(factures), '6px 0 0 0')
    + bloc(MENTION_OCKHAM, '14px 0 26px 0', `font-size:11px;color:${GRIS_PALE};`)

  const segments = corps.split(/\[Tableau Factures\]/i)
  let contenu = ''
  segments.forEach((seg, i) => {
    contenu += blocsTexte(seg)
    if (i < segments.length - 1) contenu += tableau
  })

  return document(contenu + blocSignature(signature))
}

/** Construit le mail par défaut, quand aucun scénario n'est choisi. */
export function buildHtml(factures: FactureLigne[], signature: string | null): string {
  if (UTILISER_MODELE_HISTORIQUE) return buildHtmlHistorique(factures, signature)

  const corps = 'Bonjour,\n\n'
    + 'Nous nous permettons de vous adresser ce rappel concernant les factures suivantes '
    + 'qui restent à ce jour en attente de règlement.\n\n'
    + '[Tableau Factures]\n\n'
    + 'Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais, '
    + 'ou de nous contacter directement en cas de question ou de litige.\n\n'
    + 'Cordialement,'

  return buildHtmlFromScenario(corps, factures, signature)
}
