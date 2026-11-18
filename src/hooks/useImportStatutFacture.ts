// Import « Mise à jour de statut » — pose Litige ou Dépréciée en masse.
//
// POURQUOI UN TYPE D'IMPORT À PART, et non une colonne ajoutée à l'import de
// factures. Deux raisons, dans cet ordre.
//
//   1. L'import de factures exige cinq colonnes : n° de pièce, code client,
//      nom client, date d'émission, montant TTC. Un fichier à deux colonnes
//      serait refusé dès l'écran de correspondance. Or marquer des factures
//      existantes n'a besoin que du numéro et du statut.
//
//   2. Surtout : cet import NE PEUT PAS créer de facture. Pas par vigilance,
//      par construction — il n'écrit que des UPDATE. Mélangé à l'import de
//      factures, une erreur de correspondance de colonnes aurait pu en
//      fabriquer.
//
// UNE FACTURE DÉJÀ PRÉSENTE DOIT POUVOIR ÊTRE MODIFIÉE. C'est le point que
// Clément a corrigé : dans l'import de factures, « doublon » veut dire
// « ignorée », et seul reste_du échappe à la règle. Ici, l'existant est la
// cible normale — une facture absente de la base est l'anomalie.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculerHash, detecterMapping, parserCSV, parserXLSX } from '../lib/parseursImport'
import { CHAMPS_STATUT_FACTURE } from '../lib/champsImport'
import { lireStatut, libelleStatut, exemplesValeursAcceptees } from '../lib/statutsFacture'
import type { StatutFacture } from '../types/client'
import type {
  LigneMapping, LigneApercu, ResultatAnalyse, ResultatValidation, ResultatImport,
} from '../types/import'
import { useAuth } from '../contexts/AuthContext'

interface RowImportRef { id: string; cree_le: string }
interface RowImportId { id: string }

async function parserFichier(fichier: File) {
  const ext = fichier.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') return parserCSV(fichier)
  const r = await parserXLSX(fichier)
  return {
    colonnes: r.colonnes,
    lignes: r.lignes.map(l =>
      Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v ?? '')])),
    ) as Record<string, string>[],
  }
}

function appliquerMapping(ligne: Record<string, string>, mapping: LigneMapping[]): Record<string, string> {
  const res: Record<string, string> = {}
  for (const m of mapping) {
    if (!m.champ_cible) continue
    res[m.champ_cible] = (ligne[m.colonne_source] ?? '').trim()
  }
  return res
}

/**
 * Lit tout le référentiel des factures, par lots.
 *
 * La pagination n'est pas une précaution de style : une requête sans limite est
 * coupée en silence par l'API au-delà du plafond de lignes. Ici, la coupure
 * serait pernicieuse — les factures manquantes seraient déclarées
 * « introuvables », et l'opérateur conclurait à un problème dans son fichier.
 */
async function chargerStatutsExistants(): Promise<Map<string, StatutFacture | null>> {
  const LOT = 1000
  const map = new Map<string, StatutFacture | null>()
  for (let debut = 0; ; debut += LOT) {
    const { data, error } = await supabase
      .from('factures')
      .select('numero_piece, statut_facture')
      .order('numero_piece', { ascending: true })
      .range(debut, debut + LOT - 1)
    if (error) throw new Error(`lecture des factures : ${error.message}`)
    const lot = (data as unknown as { numero_piece: string; statut_facture: StatutFacture | null }[]) ?? []
    for (const f of lot) map.set(f.numero_piece, f.statut_facture)
    if (lot.length < LOT) break
  }
  return map
}

export function useImportStatutFacture() {
  const [chargement, setChargement] = useState(false)
  const { utilisateur } = useAuth()

  async function analyserFichier(fichier: File): Promise<ResultatAnalyse> {
    const [hash, { colonnes, lignes }] = await Promise.all([
      calculerHash(fichier),
      parserFichier(fichier),
    ])
    const mapping = detecterMapping(colonnes, CHAMPS_STATUT_FACTURE).map((m, i) => ({
      ...m,
      exemple: String(lignes[0]?.[colonnes[i]] ?? ''),
    }))
    return { colonnes, apercu: lignes.slice(0, 5), mapping, hash }
  }

  async function preparerImport(
    fichier: File,
    mapping: LigneMapping[],
    hash: string,
  ): Promise<ResultatValidation> {
    const { data: d1 } = await supabase
      .from('imports')
      .select('id, cree_le')
      .eq('hash_fichier', hash)
      .maybeSingle()
    const dejaImporte = d1 as unknown as RowImportRef | null
    if (dejaImporte) {
      const d = new Date(dejaImporte.cree_le).toLocaleDateString('fr-FR')
      throw new Error(`Ce fichier a déjà été importé le ${d}.`)
    }

    const { lignes } = await parserFichier(fichier)
    const existants = await chargerStatutsExistants()

    const aAppliquer: { numero_piece: string; statut: StatutFacture | null }[] = []
    const invalides: { donnees_brutes: Record<string, string>; raison: string }[] = []
    const apercu: LigneApercu[] = []
    const compte = new Map<string, number>()
    const vus = new Set<string>()

    for (const brute of lignes) {
      const l = appliquerMapping(brute, mapping)
      const numero = (l['numero_piece'] ?? '').trim()

      function rejeter(raison: string) {
        invalides.push({ donnees_brutes: brute, raison })
        apercu.push({ donnees: brute, statut: 'invalide', cle_pivot: numero || '—', message: raison })
      }

      if (!numero) { rejeter('numéro de facture manquant'); continue }

      // Deux fois la même facture dans un fichier : la seconde ligne est
      // ignorée. Appliquer les deux ferait dépendre le résultat de l'ordre des
      // lignes, ce qui n'est jamais ce que l'on veut d'un import.
      if (vus.has(numero)) {
        apercu.push({ donnees: brute, statut: 'doublon', cle_pivot: numero, message: 'déjà vu dans ce fichier' })
        continue
      }
      vus.add(numero)

      if (!existants.has(numero)) { rejeter('facture introuvable en base'); continue }

      const lecture = lireStatut(l['statut_facture'])

      if (lecture.action === 'invalide') {
        rejeter(`statut « ${lecture.brut} » non reconnu — valeurs acceptées : ${exemplesValeursAcceptees()}`)
        continue
      }
      // Cellule vide : on ne se prononce pas. Surtout pas « efface ».
      if (lecture.action === 'ignorer') {
        apercu.push({ donnees: brute, statut: 'doublon', cle_pivot: numero, message: 'cellule vide — statut inchangé' })
        continue
      }

      const cible: StatutFacture | null = lecture.action === 'effacer' ? null : lecture.valeur
      const actuel = existants.get(numero) ?? null

      if (actuel === cible) {
        apercu.push({ donnees: brute, statut: 'doublon', cle_pivot: numero, message: 'déjà à ce statut' })
        continue
      }

      aAppliquer.push({ numero_piece: numero, statut: cible })
      const etiquette = cible === null ? 'Statut retiré' : libelleStatut(cible)
      compte.set(etiquette, (compte.get(etiquette) ?? 0) + 1)
      apercu.push({
        donnees: brute,
        statut: 'modification',
        cle_pivot: numero,
        message: cible === null ? 'statut retiré' : `passera en « ${libelleStatut(cible)} »`,
      })
    }

    return {
      lignes_a_inserer: [],
      statuts_a_appliquer: aAppliquer,
      recap_statuts: [...compte.entries()].map(([libelle, nb]) => ({ libelle, nb })),
      apercu: apercu.slice(0, 10),
      nb_total: lignes.length,
      nb_nouvelles: aAppliquer.length,
      nb_doublons: lignes.length - aAppliquer.length - invalides.length,
      nb_invalides: invalides.length,
      lignes_invalides: invalides,
      hash,
      nom_fichier: fichier.name,
    }
  }

  async function executerImport(resultat: ResultatValidation): Promise<ResultatImport> {
    setChargement(true)
    try {
      const { data: d2, error: errImport } = await supabase
        .from('imports')
        .insert({
          type: 'maj_statut_facture' as const,
          nom_fichier: resultat.nom_fichier,
          hash_fichier: resultat.hash,
          nb_lignes_total: resultat.nb_total,
          nb_lignes_inserees: resultat.nb_nouvelles,
          nb_lignes_doublons: resultat.nb_doublons,
          cree_par: utilisateur?.id ?? null,
        } as never)
        .select('id')
        .single()
      if (errImport) throw errImport
      const importRec = d2 as unknown as RowImportId | null
      if (!importRec) throw new Error("Enregistrement d'import non créé.")

      try {
        // Un UPDATE par statut cible, et non un par facture : trois requêtes au
        // lieu de plusieurs centaines. Le lot est plafonné parce que les
        // numéros partent dans l'URL — au-delà, le serveur la refuse.
        const LOT = 200
        const parStatut = new Map<string, string[]>()
        for (const a of resultat.statuts_a_appliquer ?? []) {
          const cle = a.statut ?? '__null__'
          const liste = parStatut.get(cle) ?? []
          liste.push(a.numero_piece)
          parStatut.set(cle, liste)
        }

        for (const [cle, numeros] of parStatut) {
          const statut = cle === '__null__' ? null : (cle as StatutFacture)
          for (let i = 0; i < numeros.length; i += LOT) {
            const { error } = await supabase
              .from('factures')
              .update({ statut_facture: statut } as never)
              .in('numero_piece', numeros.slice(i, i + LOT))
            if (error) throw error
          }
        }
      } catch (err) {
        // L'enregistrement d'import est retiré si l'écriture échoue : il
        // laisserait croire à un import réussi, et son hash bloquerait toute
        // nouvelle tentative avec le même fichier.
        await supabase.from('imports').delete().eq('id', importRec.id)
        throw err
      }

      return { import_id: importRec.id, nb_inserees: resultat.nb_nouvelles }
    } finally {
      setChargement(false)
    }
  }

  return { analyserFichier, preparerImport, executerImport, chargement }
}
