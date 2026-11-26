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
/**
 * Montant pour l'email, avec une normalisation que l'affichage n'exige pas.
 *
 * Intl separe les milliers par U+202F, l'espace fine insecable. Ce caractere
 * n'existe pas en Latin-1 : toute passerelle qui retranscode le message — et
 * les passerelles d'entreprise le font encore — le rend en carre ou en point
 * d'interrogation, en plein milieu d'un montant. On lui substitue U+00A0,
 * l'insecable ordinaire, qui s'affiche identiquement partout et survit au
 * transcodage. Meme traitement pour l'espace avant l'euro, deja en U+00A0.
 */
export function fmtEurosEmail(n: number) {
  return _fmtEurosEmail.format(n).replace(/\u202f/g, '\u00a0')
}
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
// Variante « Lettre », choisie par Clément le 2026-11-25 parmi trois maquettes.
// Le parti : rester une lettre. Toute la structure tient en trois traits : un
// filet navy en haut, et deux bandes pâles qui donnent au tableau ses bords
// sans le cerner. Ni logo, ni bandeau, ni image : un bandeau coloré pleine
// largeur aurait donné au mail l'allure d'une newsletter, et une newsletter se
// traite comme une newsletter — mauvais pour du recouvrement.

/**
 * Pile de polices, courte après la marque.
 *
 * Elle est répétée sur chaque cellule — c'est la seule façon fiable de
 * l'imposer dans Word, qui hérite mal. Chaque caractère y est donc payé autant
 * de fois qu'il y a de cellules, et la pile a été taillée pour ça : une
 * première version de 77 caractères coûtait 230 octets par ligne de facture.
 *
 * PLUS JAKARTA SANS NE S'AFFICHERA PRESQUE JAMAIS, et c'est assumé. La police
 * de la charte est une webfont, chargée par un <link> Google Fonts dans
 * index.html. Ce lien ne voyage pas avec le mail : Gmail retire les <link> et
 * les <style> des corps de message, et Outlook Windows — moteur Word — ne sait
 * pas charger de webfont du tout. Elle ne rendra donc que sur une machine où
 * la police est installée au niveau du système.
 *
 * On la déclare quand même, en tête : elle coûte 22 caractères, elle dit quelle
 * est la police voulue, et elle devient effective le jour où les postes
 * l'installent. Partout ailleurs, la suite de la pile prend le relais — c'est
 * exactement le rendu d'aujourd'hui.
 *
 * Outlook reçoit de toute façon sa propre police par le bloc conditionnel du
 * <head>, qui force Segoe UI.
 */
const POLICE = "'Plus Jakarta Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif"
const LARGEUR = 600

/**
 * Retrait horizontal du texte.
 *
 * Les bandes pâles du tableau vont d'un bord à l'autre des 600 px, mais leur
 * texte est en retrait de 12 px. Le corps doit l'être d'autant, sinon les
 * colonnes ne sont plus dans l'axe des paragraphes — le défaut saute aux yeux
 * dès qu'on trace une verticale sur le rendu.
 */
const MARGE = 12

/**
 * L'ÉCHELLE TYPOGRAPHIQUE. Quatre tailles, un rôle chacune.
 *
 * Refonte du 2026-11-26. Le tableau émettait SEPT tailles — 10, 11, 12, 13,
 * 14, 15 et 18 px — pour six lignes de contenu. Six d'entre elles tenaient
 * dans un écart de cinq pixels : à cette distance l'œil ne lit pas une
 * hiérarchie, il lit une irrégularité. Le symptôme le plus visible était un
 * numéro de facture en 14 px à côté de son montant en 15 px, même rang, même
 * graisse, un pixel d'écart et aucune raison.
 *
 * Une échelle ne fonctionne que si les marches se voient. Celles-ci se voient.
 *
 * T_TOTAL mérite son écart. Mesuré sur un encours réel : lignes à 15 px, total
 * à 18 px, sur « 55 166,47 € » contre « 147 386,87 € » — personne ne distingue
 * trois pixels sur sept chiffres. SEULE LA COULEUR portait le total, et un
 * homme sur douze ne distingue pas le rouge du noir. À 20 px le total est la
 * seule rupture de la ligne de base, donc visible par la forme d'abord.
 */
const T_MICRO = 11   // en-têtes de colonnes, mention PDF, pied de page
const T_PETIT = 13   // dates et retards
const T_CORPS = 15   // prose, numéros, montants, libellé du solde, titre du bloc
const T_TOTAL = 20   // le solde net, et lui seul

/**
 * Deux graisses, pas trois.
 *
 * 600 et 700 cohabitaient. L'écart entre les deux est à peine perceptible dans
 * la plupart des polices : il ne produit pas de niveau supplémentaire, il
 * produit du flottement.
 */
const GRAS = 600

const ENCRE       = '#1F2937'   // texte courant
const ENCRE_FORTE = '#0E1A2B'   // navy de la charte : montants, libellés qui portent

/**
 * Les gris, et leur contraste mesuré sur blanc.
 *
 * L'ancien jeu descendait à #CBD5E1, soit 1,5:1 — la mention « PDF » y était à
 * la limite de l'invisible alors que c'est elle qui signale qu'il y a un
 * document à ouvrir. Les dates étaient à 2,6:1, illisibles sur un téléphone en
 * extérieur. Le seuil AA pour du petit texte est de 4,5:1.
 */
const GRIS        = '#64748B'   // 4,8:1 — secondaire lisible : dates, en-têtes
const GRIS_TENU   = '#94A3B8'   // 2,6:1 — tertiaire : mention PDF, pied. Assumé :
                                // l'information est aussi portée par le lien teal.
const FILET       = '#E2E8F0'   // séparateur marqué
const FILET_PALE  = '#F1F5F9'   // séparateur entre lignes
const BANDE       = '#F8FAFC'   // fond des bandes d'en-tête et de total

/**
 * Teal des liens : #0F766E, et non le #4CC5BB de la charte.
 *
 * Le teal de la charte a un contraste d'environ 2,2:1 sur blanc. C'est un
 * accent d'interface, pensé pour être posé SUR du navy — pas une couleur de
 * texte. Cette variante assombrie monte à 5,5:1, conforme AA, en restant de la
 * même famille. C'est la seule entorse à la charte dans ce fichier, et elle est
 * nécessaire : un numéro de facture illisible est un PDF qu'on n'ouvre pas.
 */
const ACCENT = '#0F766E'

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
 * Une ligne qui va d'un bord à l'autre, sans retrait : le tableau, qui porte
 * déjà le sien sur ses propres cellules.
 *
 * Elle existe plutôt qu'un `padding-left:0` ajouté après le raccourci dans
 * `bloc` : Word ne surcharge pas de façon fiable un raccourci par une propriété
 * détaillée, et on se retrouverait avec un tableau décalé de 12 px sous Outlook
 * seulement — le pire des cas, celui qu'on ne voit pas en développant.
 */
function blocPleineLargeur(contenu: string, vertical: string): string {
  const [haut, bas] = vertical.split(' ')
  return `<tr><td align="left" style="padding:${haut} 0 ${bas} 0;">${contenu}</td></tr>\n`
}

/**
 * Une respiration verticale.
 *
 * Avec `&nbsp;` et une hauteur explicite, parce qu'une cellule vide est
 * effondrée par Word et par plusieurs webmails : l'espace disparaîtrait
 * exactement là où on l'a voulu.
 */
function espace(hauteur: number): string {
  return `<tr><td style="padding:0;line-height:0;font-size:0;height:${hauteur}px;">&nbsp;</td></tr>\n`
}

/** Le corps du scénario, converti en paragraphes. */
function blocsTexte(texte: string): string {
  return texte
    .split(/\n{2,}/)
    .filter(p => p.trim())
    .map(p => bloc(
      p.trim().replace(/\n/g, '<br />'),
      '0 18px',
      `${EXACT}font-size:${T_CORPS}px;line-height:26px;color:${ENCRE};`,
    ))
    .join('')
}

/**
 * Le haut de la lettre : un filet navy, et rien d'autre.
 *
 * Il portait aussi le nom de l'organisation et la date ; Clément les a retirés
 * le 2026-11-25. Le destinataire connaît son fournisseur, et la date figure
 * déjà dans l'en-tête du message que son client mail affiche. La ligne
 * n'apportait donc rien que le mail ne disait déjà.
 *
 * Le filet est une cellule à fond navy et non une bordure : Word rend les
 * bordures de façon inégale selon la version, un aplat jamais.
 */
function filetHaut(): string {
  return `<tr><td style="padding:0;line-height:0;font-size:0;height:3px;background-color:${ENCRE_FORTE};">&nbsp;</td></tr>\n`
}

function enTeteColonne(libelle: string, align: 'left' | 'right', largeur: number): string {
  // Les libellés sont écrits en majuscules dans le HTML plutôt que par
  // text-transform : Word ignore cette propriété.
  return `<td align="${align}" width="${largeur}" style="padding:9px ${MARGE}px;background-color:${BANDE};border-bottom:1px solid ${FILET};${POL}font-size:${T_MICRO}px;font-weight:${GRAS};color:${GRIS};letter-spacing:.08em;">${libelle}</td>\n`
}

function ligneFacture(f: FactureLigne, derniere: boolean): string {
  const retard = f.echeance ? joursDepuis(f.echeance) : null
  const estCredit = f.restedu < 0

  // Le trait disparaît sous la dernière ligne : la bande de total qui suit
  // fournit déjà la séparation, et deux traits collés font sale.
  const bordure = derniere ? '' : `border-bottom:1px solid ${FILET_PALE};`
  const cell = `padding:13px ${MARGE}px;${bordure}${POL}${EXACT}line-height:20px;`

  // Le numéro et sa couleur sont sur la cellule ; le <a> ne garde que ce qui
  // lui est propre, parce que les clients imposent leur propre couleur de lien.
  const numero = f.pdfUrl
    ? `<a href="${f.pdfUrl}" style="color:${ACCENT};text-decoration:none;">${f.numero}</a>`
      + `<span style="font-size:${T_MICRO}px;font-weight:400;color:${GRIS_TENU};">&nbsp;&nbsp;PDF</span>`
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
    + `<td align="left" style="${cell}font-size:${T_CORPS}px;font-weight:${GRAS};color:${ENCRE_FORTE};">${numero}</td>\n`
    + `<td align="right" style="${cell}font-size:${T_CORPS}px;font-weight:${GRAS};color:${estCredit ? CREDIT : ENCRE_FORTE};">${fmtEurosEmail(f.restedu)}</td>\n`
    + `<td align="right" style="${cell}font-size:${T_PETIT}px;color:${GRIS};">${echeance}</td>\n`
    + `</tr>\n`
}

/**
 * Le tableau des factures.
 *
 * Deux bandes très pâles — l'en-tête de colonnes et le total — lui donnent ses
 * bords sans qu'on ait à le cerner d'un cadre. Les bandes vont d'un bord à
 * l'autre des 600 px tandis que leur texte est en retrait de MARGE, exactement
 * comme les paragraphes.
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
    + factures.map((f, i) => ligneFacture(f, i === factures.length - 1)).join('')
    + `<tr>\n`
    + `<td align="left" style="${totalCell}${POL}font-size:${T_CORPS}px;font-weight:${GRAS};color:${ENCRE_FORTE};">Solde net</td>\n`
    + `<td align="right" style="${totalCell}${POL}font-size:${T_TOTAL}px;font-weight:${GRAS};color:${total < 0 ? CREDIT : ALERTE};">${fmtEurosEmail(total)}</td>\n`
    + `<td style="${totalCell}"></td>\n`
    + `</tr>\n`
    + `</table>\n`
}

/**
 * Mention Ockham — texte seul, l'hexagone SVG ne survivait à aucun client.
 *
 * ELLE EST EN PIED DE DOCUMENT, ET NON COLLÉE AU TABLEAU. Dans la première
 * version de la refonte elle suivait le tableau, donc elle s'insérait là où le
 * scénario place [Tableau Factures] — c'est-à-dire en plein milieu du corps,
 * entre le tableau et le paragraphe suivant. Défaut vu sur un envoi réel.
 */
function blocMention(): string {
  return bloc(
    `Propuls&eacute; par <a href="https://www.ockham-finance.com" target="_blank" style="color:${GRIS_TENU};text-decoration:none;">Ockham Finance</a>`,
    '22px 20px',
    `font-size:${T_MICRO}px;color:${GRIS_TENU};`,
  )
}

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
  return bloc(signature, '22px 0px', '', `border-top:1px solid ${FILET};`)
}


/**
 * L'encours du client, pour le presse-papier. PAS un email.
 *
 * POURQUOI UNE FONCTION À PART, et non le constructeur d'email avec un corps
 * réduit à [Tableau Factures] — ce qu'on faisait jusqu'au 2026-11-26.
 *
 * Un email est un document autonome envoyé à un tiers : il lui faut un haut,
 * un bas, une mention d'émetteur. Un collage est un FRAGMENT déposé dans un
 * message que l'opérateur rédige déjà : il fournit lui-même le bonjour, le
 * contexte et sa signature. Passer par le constructeur d'email collait donc
 * dans son message le filet navy — une barre noire en travers du texte — et
 * « Propulsé par Ockham Finance » juste au-dessus de SA signature. Deux
 * éléments faux par construction, pas par réglage.
 *
 * POURQUOI UN CADRE, alors que le mail n'en a pas. Le mail est volontairement
 * sans bord : des filets et du blanc, rien qui concurrence le contenu. C'est
 * juste quand le mail EST le document. Déposé au milieu du texte de quelqu'un
 * d'autre, le même tableau n'a plus de limite et se dissout. Un fragment a
 * besoin d'un bord précisément parce qu'il vit dans le contenu d'autrui.
 *
 * La ligne de contexte met le rendu riche au niveau du rendu texte, qui portait
 * déjà « ENCOURS CLIENT — … / État au … » quand la version HTML n'avait rien.
 * Le code client n'y figure pas : c'est une référence interne, sans valeur pour
 * le destinataire d'un mail client.
 */
export function buildEncoursHtml(nomClient: string, factures: FactureLigne[]): string {
  const dateJour = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  // border-collapse:separate, sans quoi l'arrondi est ignoré. Word ignore
  // l'arrondi de toute façon et rend des angles droits — dégradation
  // silencieuse, pas une casse.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LARGEUR + 2}" style="width:${LARGEUR + 2}px;max-width:${LARGEUR + 2}px;border-collapse:separate;border:1px solid ${FILET};border-radius:10px;background-color:#ffffff;">\n`
    + `<tr>\n`
    // Pas de bordure sous la ligne de contexte : la bande grise de l'en-tête
    // de colonnes, qui suit immédiatement, sépare déjà. Deux traits collés
    // l'un à l'autre se voient, et ne séparent pas mieux qu'un seul.
    + `<td align="left" style="padding:13px ${MARGE}px 12px ${MARGE}px;${POL}font-size:${T_CORPS}px;line-height:22px;${EXACT}">`
    + `<span style="font-weight:${GRAS};color:${ENCRE_FORTE};">Encours ${nomClient}</span>`
    + `<span style="font-size:${T_PETIT}px;color:${GRIS};">&nbsp;&middot;&nbsp;état au ${dateJour}</span>`
    + `</td>\n`
    + `</tr>\n`
    + `<tr>\n`
    + `<td style="padding:0;">\n`
    + tableauFactures(factures)
    + `</td>\n`
    + `</tr>\n`
    + `</table>\n`
}


// ─── Les deux entrées publiques ─────────────────────────────────────────────

/** Construit le mail depuis un scénario contenant [Tableau Factures]. */
export function buildHtmlFromScenario(
  corps: string,
  factures: FactureLigne[],
  signature: string | null,
): string {
  if (UTILISER_MODELE_HISTORIQUE) return buildHtmlFromScenarioHistorique(corps, factures, signature)

  // 24 px en bas, pour retrouver l'ecart qui separe deja deux paragraphes
  // (18 px de bas + 6 px de haut). Sans cela la phrase qui suit le total est
  // collee a la bande grise.
  const tableau = blocPleineLargeur(tableauFactures(factures), '6px 24px')

  const segments = corps.split(/\[Tableau Factures\]/i)
  let contenu = ''
  segments.forEach((seg, i) => {
    contenu += blocsTexte(seg)
    if (i < segments.length - 1) contenu += tableau
  })

  return document(
    filetHaut()
    + espace(30)                  // l'air entre le filet et « Bonjour, »
    + contenu
    + blocSignature(signature)
    + blocMention(),
  )
}

/** Construit le mail par défaut, quand aucun scénario n'est choisi. */
export function buildHtml(
  factures: FactureLigne[],
  signature: string | null,
): string {
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
