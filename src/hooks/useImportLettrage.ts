// Import en masse de lettrages (migration historique + prélèvements auto)
// Prérequis : les factures référencées doivent exister dans la table factures
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculerHash, detecterMapping, parseDate, parseNombre, parserCSV, parserXLSX } from '../lib/parseursImport'
import { CHAMPS_LETTRAGES } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'
import { useAuth } from '../contexts/AuthContext'

interface RowFacture { numero_piece: string; code_client: string; reste_du: number | null }
interface RowImportId { id: string }
interface RowImportRef { id: string; cree_le: string }

async function parserFichier(fichier: File): Promise<{ colonnes: string[]; lignes: Record<string, string>[] }> {
  const ext = fichier.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') {
    return parserCSV(fichier)
  }
  const { colonnes, lignes } = await parserXLSX(fichier)
  return {
    colonnes,
    lignes: lignes.map(l =>
      Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v ?? '').trim()]))
    ) as Record<string, string>[],
  }
}

function extraireValeurPivot(ligne: Record<string, string>, colPivot: string): string {
  return (ligne[colPivot] ?? '').trim()
}

function construireLigneLettrage(
  ligne: Record<string, string>,
  mapping: LigneMapping[],
  codeClientDeduit: string
): Record<string, unknown> | null {
  const res: Record<string, unknown> = {}

  for (const m of mapping) {
    if (!m.champ_cible) continue
    const val = ligne[m.colonne_source]
    if (m.champ_cible === 'montant') {
      const n = parseNombre(val)
      res.montant = n !== null ? Math.round(n * 100) / 100 : null
    } else if (m.champ_cible === 'date_lettrage') {
      res.date_lettrage = parseDate(val)
    } else {
      res[m.champ_cible] = val?.trim() || null
    }
  }

  // code_client : depuis le fichier ou déduit depuis la facture
  if (!res.code_client) res.code_client = codeClientDeduit || null

  res.mode = 'manuel'

  // Champs obligatoires
  if (!res.numero_facture || !res.code_client || !res.date_lettrage || res.montant == null) {
    return null
  }

  return res
}

export function useImportLettrage() {
  const [chargement, setChargement] = useState(false)
  const { utilisateur } = useAuth()

  async function analyserFichier(fichier: File): Promise<ResultatAnalyse> {
    const [hash, { colonnes, lignes }] = await Promise.all([
      calculerHash(fichier),
      parserFichier(fichier),
    ])
    const mapping = detecterMapping(colonnes, CHAMPS_LETTRAGES).map((m, i) => ({
      ...m,
      exemple: String(lignes[0]?.[colonnes[i]] ?? ''),
    }))
    return { colonnes, apercu: lignes.slice(0, 5), mapping, hash }
  }

  async function preparerImport(
    fichier: File,
    mapping: LigneMapping[],
    hash: string
  ): Promise<ResultatValidation> {
    // Anti-replay : rejette si ce fichier a déjà été importé
    const { data: importExistant } = await supabase
      .from('imports')
      .select('id, cree_le')
      .eq('hash_fichier', hash)
      .maybeSingle()
    const existant = importExistant as unknown as RowImportRef | null
    if (existant) {
      const d = new Date(existant.cree_le).toLocaleDateString('fr-FR')
      throw new Error(`Ce fichier a déjà été importé le ${d}.`)
    }

    // Colonne pivot obligatoire
    const colPivot = mapping.find(m => m.champ_cible === 'numero_facture')?.colonne_source
    if (!colPivot) {
      throw new Error(
        'La colonne "N° de facture" n\'est pas mappée. ' +
        'Revenez à l\'étape précédente et associez la bonne colonne.'
      )
    }

    const { lignes } = await parserFichier(fichier)

    // Numéros de facture uniques présents dans le fichier
    const numerosUniques = [...new Set(
      lignes.map(l => extraireValeurPivot(l, colPivot)).filter(Boolean)
    )]

    if (numerosUniques.length === 0) {
      throw new Error('Aucun numéro de facture trouvé dans la colonne mappée. Vérifiez le fichier.')
    }

    // Récupère les factures correspondantes depuis la table factures
    const facturesMap = new Map<string, { code_client: string; reste_du: number | null }>()
    for (let i = 0; i < numerosUniques.length; i += 500) {
      const lot = numerosUniques.slice(i, i + 500)
      const { data, error } = await supabase
        .from('factures')
        .select('numero_piece, code_client, reste_du')
        .in('numero_piece', lot)
      if (error) throw new Error(`Erreur lors de la vérification des factures : ${error.message}`)
      const rows = data as unknown as RowFacture[] | null
      rows?.forEach(r => facturesMap.set(r.numero_piece, {
        code_client: r.code_client,
        reste_du: r.reste_du,
      }))
    }

    // Aucune facture trouvée = factures non importées
    if (facturesMap.size === 0) {
      const exemples = numerosUniques.slice(0, 3).map(n => `"${n}"`).join(', ')
      throw new Error(
        `Aucune des ${numerosUniques.length} factures du fichier n'existe en base de données.\n` +
        `Exemples cherchés : ${exemples}\n\n` +
        `Vous devez d'abord importer votre fichier de factures (onglet Dépôt → Factures) avant d'importer les lettrages.`
      )
    }

    // Factures partiellement manquantes
    if (facturesMap.size < numerosUniques.length) {
      const manquantes = numerosUniques.filter(n => !facturesMap.has(n))
      const exemples = manquantes.slice(0, 3).map(n => `"${n}"`).join(', ')
      throw new Error(
        `${manquantes.length} facture(s) sur ${numerosUniques.length} introuvables en base.\n` +
        `Exemples introuvables : ${exemples}\n\n` +
        `Importez d'abord ces factures via Dépôt → Factures, ou vérifiez que les numéros correspondent exactement à ceux de la base.`
      )
    }

    // Toutes les factures sont trouvées : construire les lignes à insérer
    const lignesValides: Record<string, unknown>[] = []
    const lignesInvalides: { numero: string; raison: string }[] = []

    for (const ligne of lignes) {
      const numFact = extraireValeurPivot(ligne, colPivot)
      const facture = facturesMap.get(numFact)
      if (!facture) {
        lignesInvalides.push({ numero: numFact, raison: 'Facture introuvable' })
        continue
      }
      const l = construireLigneLettrage(ligne, mapping, facture.code_client)
      if (!l) {
        lignesInvalides.push({ numero: numFact, raison: 'Champ obligatoire manquant (date ou montant)' })
        continue
      }
      lignesValides.push(l)
    }

    // Doublons intra-fichier (même numéro de facture en double)
    const vusDansFichier = new Set<string>()
    const aInserer: typeof lignesValides = []
    const doublonsFichier: typeof lignesValides = []
    for (const l of lignesValides) {
      const cle = String(l.numero_facture)
      if (vusDansFichier.has(cle)) {
        doublonsFichier.push(l)
      } else {
        vusDansFichier.add(cle)
        aInserer.push(l)
      }
    }

    // Détection sur-paiements : factures dont reste_du <= 0
    const surPaiementNums = new Set(
      lignesValides
        .map(l => String(l.numero_facture))
        .filter(num => {
          const f = facturesMap.get(num)
          return f && f.reste_du !== null && f.reste_du <= 0
        })
    )

    const apercu = lignes.slice(0, 10).map(l => {
      const num = extraireValeurPivot(l, colPivot)
      const existe = facturesMap.has(num)
      const surPaiement = surPaiementNums.has(num)
      const invalide = lignesInvalides.some(i => i.numero === num)
      return {
        donnees: l,
        statut: (!existe || invalide) ? 'invalide' as const
               : surPaiement ? 'sur_paiement' as const
               : 'nouveau' as const,
        cle_pivot: num,
      }
    })

    return {
      lignes_a_inserer: aInserer,
      apercu,
      nb_total: lignes.length,
      nb_nouvelles: aInserer.length,
      nb_doublons: doublonsFichier.length,
      nb_avertissements: surPaiementNums.size,
      nb_invalides: lignesInvalides.length,
      hash,
      nom_fichier: fichier.name,
    }
  }

  async function executerImport(resultat: ResultatValidation): Promise<ResultatImport> {
    setChargement(true)
    try {
      // Enregistrement de l'import
      const { data: importData, error: errImport } = await supabase
        .from('imports')
        .insert({
          type: 'import_lettrage' as const,
          nom_fichier: resultat.nom_fichier,
          hash_fichier: resultat.hash,
          nb_lignes_total: resultat.nb_total,
          nb_lignes_inserees: resultat.nb_nouvelles,
          nb_lignes_doublons: resultat.nb_doublons,
          cree_par: utilisateur?.id ?? null,
        } as never)
        .select('id')
        .single()
      if (errImport) throw new Error(`Erreur création import : ${errImport.message}`)
      const importRec = importData as unknown as RowImportId | null
      if (!importRec) throw new Error('Enregistrement d\'import non créé.')

      // Insertion des lettrages par lots — le trigger sync_reste_du met à jour factures.reste_du automatiquement
      try {
        for (let i = 0; i < resultat.lignes_a_inserer.length; i += 500) {
          const lot = resultat.lignes_a_inserer.slice(i, i + 500).map(l => ({
            ...l,
            cree_par: utilisateur?.id ?? null,
          }))
          const { error } = await supabase.from('lettrages').insert(lot as never)
          if (error) throw new Error(`Erreur insertion lettrages : ${error.message}`)
        }
      } catch (err) {
        // Rollback : supprime l'enregistrement import si l'insertion échoue
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
