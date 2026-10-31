// Construction des écritures d'une correction de lettrage.
//
// Extrait de ModalCorrection pour que le module de la page Lettrage et celui du
// compte client écrivent rigoureusement la même chose. Deux copies de code qui
// fabriquent des écritures comptables, c'est deux comportements qui divergent
// au premier correctif.
//
// Principe : une correction ne réécrit jamais le passé. Elle pose des écritures
// datées du jour, négatives sur ce qu'on retire, positives sur ce qu'on
// réaffecte, dont la somme est nulle. Une période déjà exportée reste donc
// intacte, et la correction apparaît dans l'export suivant sous forme de deux
// mouvements qui s'annulent. C'est la façon comptable de corriger une période
// close : on n'efface pas, on passe une écriture rectificative.
import { supabase } from './supabase'

export interface LigneCorrection {
  numero_facture: string
  code_client: string
  /** Signé : négatif pour un retrait d'affectation, positif pour une réaffectation. */
  montant: number
}

export interface EcritureCorrection {
  id_ligne_bancaire: string | null
  numero_facture: string | null
  code_client: string
  montant: number
  date_lettrage: string
  mode: string
  correction_id: string | null
  commentaire: string | null
  cree_par: string | null
  operateur: string | null
}

interface SourceInfo {
  id_ligne_bancaire: string
  montant: number
  proportion: number
}

function arrondir(n: number) {
  return Math.round(n * 100) / 100
}

/**
 * Prépare les lignes à insérer dans `lettrages` pour une correction.
 *
 * L'écriture est rattachée aux lignes bancaires qui ont servi au lettrage
 * d'origine, avec le suffixe `-C` : la ligne de correction pointe vers une
 * pseudo-opération bancaire, ce qui la distingue d'un lettrage réel tout en
 * gardant le lien avec son origine. Cette convention est lue ailleurs dans
 * l'application (historique de lettrage, export comptable), ne pas la changer
 * sans les mettre à jour.
 *
 * Quand plusieurs lignes bancaires ont alimenté une facture, le montant est
 * réparti au prorata de ce que chacune avait apporté, le reliquat tombant sur
 * la dernière pour que la somme retombe au centime.
 */
export async function construireEcrituresCorrection(
  lignes: LigneCorrection[],
  auteur: { cree_par: string | null; operateur: string | null },
  dateJour: string,
): Promise<EcritureCorrection[]> {
  const lignesNeg = lignes.filter(l => l.montant < 0)
  const lignesPos = lignes.filter(l => l.montant > 0)

  // Pour chaque facture dégrevée, retrouver les lignes bancaires d'origine.
  const sourceMap = new Map<string, SourceInfo[]>()
  for (const neg of lignesNeg) {
    const numero = neg.numero_facture.trim()
    const { data } = await supabase
      .from('lettrages')
      .select('id_ligne_bancaire, montant')
      .eq('numero_facture', numero)
      .eq('annule', false)
      .gt('montant', 0)
      .not('id_ligne_bancaire', 'is', null)
    const sources = ((data ?? []) as { id_ligne_bancaire: string | null; montant: number }[])
      .filter((r): r is { id_ligne_bancaire: string; montant: number } =>
        // Les lignes en -C sont elles-mêmes des corrections : elles ne peuvent
        // pas servir de source à une nouvelle correction.
        !!r.id_ligne_bancaire && !r.id_ligne_bancaire.endsWith('-C')
      )
    const tot = sources.reduce((s, r) => s + r.montant, 0)
    sourceMap.set(numero, sources.map(s => ({
      id_ligne_bancaire: s.id_ligne_bancaire,
      montant: s.montant,
      proportion: tot > 0 ? s.montant / tot : 1 / sources.length,
    })))
  }

  // Les réaffectations se répartissent sur l'ensemble des sources dégrevées,
  // pas seulement sur celles d'une facture : l'argent repris forme un pot
  // commun avant d'être reposé.
  const vues = new Set<string>()
  const toutesSources: SourceInfo[] = []
  for (const sources of sourceMap.values()) {
    for (const src of sources) {
      if (!vues.has(src.id_ligne_bancaire)) {
        vues.add(src.id_ligne_bancaire)
        toutesSources.push(src)
      }
    }
  }
  const totalGlobal = toutesSources.reduce((s, src) => s + src.montant, 0)
  const sourcesGlobales: SourceInfo[] = toutesSources.map(src => ({
    ...src,
    proportion: totalGlobal > 0 ? src.montant / totalGlobal : 1 / toutesSources.length,
  }))

  const correctionId = crypto.randomUUID()

  function ligne(l: LigneCorrection, montant: number, idLigne: string | null): EcritureCorrection {
    return {
      id_ligne_bancaire: idLigne,
      numero_facture: l.numero_facture.trim(),
      code_client: l.code_client,
      montant: arrondir(montant),
      date_lettrage: dateJour,
      mode: 'correction',
      correction_id: correctionId,
      commentaire: `Correction : ${montant < 0 ? 'retrait d\'affectation' : 'réaffectation'}`,
      cree_par: auteur.cree_par,
      operateur: auteur.operateur,
    }
  }

  function repartir(m: number, sources: SourceInfo[], l: LigneCorrection): EcritureCorrection[] {
    if (sources.length === 0) return [ligne(l, m, null)]
    if (sources.length === 1) return [ligne(l, m, sources[0].id_ligne_bancaire + '-C')]
    let reste = m
    return sources.map((src, i) => {
      const dernier = i === sources.length - 1
      const part = dernier ? reste : arrondir(m * src.proportion)
      reste -= part
      return ligne(l, part, src.id_ligne_bancaire + '-C')
    })
  }

  const ecritures: EcritureCorrection[] = []
  for (const l of lignesNeg) {
    ecritures.push(...repartir(arrondir(l.montant), sourceMap.get(l.numero_facture.trim()) ?? [], l))
  }
  for (const l of lignesPos) {
    ecritures.push(...repartir(arrondir(l.montant), sourcesGlobales, l))
  }
  return ecritures
}

/** Somme des écritures. Doit valoir 0 : c'est l'invariant de la correction. */
export function totalEcritures(ecritures: EcritureCorrection[]): number {
  return arrondir(ecritures.reduce((s, e) => s + e.montant, 0))
}
