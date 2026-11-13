// Copier un graphique en PNG, pour le coller dans un mail ou un document.
//
// POURQUOI PAS DU HTML. Le graphique est un SVG. Outlook et Gmail suppriment
// ou degradent le SVG en ligne — le destinataire voit un trou — et Word
// l'importe de facon inconstante selon la version. Le PNG se colle partout,
// sans reglage et sans surprise.
//
// POURQUOI UN FICHIER A PART. Rien ici ne connait le graphique d'activite :
// la fonction prend un conteneur, y trouve un SVG, et en fait une image. Le
// jour ou on voudra le meme bouton sur les encaissements ou la balance agee,
// il n'y aura rien a reecrire.

/** Ce qui a reellement eu lieu, pour que l'appelant sache quoi afficher. */
export type ResultatCopie = 'presse-papier' | 'telechargement'

const ECHELLE = 2        // rend a 2x : net sur un ecran dense et a l'impression
const MARGE   = 16       // un peu d'air autour, sinon l'image colle au texte

/**
 * Serialise le SVG du conteneur, le rasterise, et le met dans le presse-papier.
 *
 * @throws si le conteneur ne contient aucun SVG, ou si la rasterisation echoue.
 *         L'appelant doit attraper et prevenir — echouer en silence laisserait
 *         croire que la copie a marche.
 */
export async function copierGraphiqueEnPng(
  conteneur: HTMLElement,
  nomFichier: string,
): Promise<ResultatCopie> {
  const svgOriginal = conteneur.querySelector('svg')
  if (!svgOriginal) throw new Error('Aucun graphique à copier.')

  const rect = svgOriginal.getBoundingClientRect()
  const largeur = Math.ceil(rect.width)  + MARGE * 2
  const hauteur = Math.ceil(rect.height) + MARGE * 2

  const clone = svgOriginal.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width',  String(rect.width))
  clone.setAttribute('height', String(rect.height))

  // Les polices chargees par la page ne sont PAS disponibles pendant la
  // rasterisation : l'image est rendue depuis une URL isolee, sans acces aux
  // feuilles de style. On impose donc une pile systeme, sinon le navigateur
  // choisit une serif par defaut et le rendu ne ressemble plus a l'ecran.
  clone.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

  const svgTexte = new XMLSerializer().serializeToString(clone)
  const svgUrl = URL.createObjectURL(new Blob([svgTexte], { type: 'image/svg+xml;charset=utf-8' }))

  try {
    const image = await chargerImage(svgUrl)

    const canvas = document.createElement('canvas')
    canvas.width  = largeur * ECHELLE
    canvas.height = hauteur * ECHELLE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Rasterisation impossible sur ce navigateur.')

    // Fond blanc explicite. Sans lui le PNG est transparent, ce qui donne un
    // graphique illisible colle sur un fond sombre — et Word affiche du noir.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(ECHELLE, ECHELLE)
    ctx.drawImage(image, MARGE, MARGE, rect.width, rect.height)

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
    if (!blob) throw new Error('Image non générée.')

    // Le presse-papier d'images n'existe pas partout : Chrome et Edge le
    // supportent, Firefox partiellement. On tente, et on se replie sur un
    // telechargement plutot que d'echouer.
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        return 'presse-papier'
      } catch {
        // Permission refusee, document non focalise, navigateur recalcitrant :
        // on ne perd pas l'image pour autant.
      }
    }

    telecharger(blob, `${nomFichier}.png`)
    return 'telechargement'
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

function chargerImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload  = () => res(img)
    img.onerror = () => rej(new Error('Le graphique n\'a pas pu être converti en image.'))
    img.src = url
  })
}

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  URL.revokeObjectURL(url)
}
