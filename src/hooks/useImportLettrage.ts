// Import en masse de lettrages — migration historique (section 5.1 du CDC)
// Prérequis : les factures référencées doivent exister dans la table factures
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculerHash, detecterMapping, parseDate, parseNombre, parserCSV, parserXLSX } from '../lib/parseursImport'
import { CHAMPS_LETTRAGES } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'
import { useAuth } from '../contexts/AuthContext'

interface RowFacture { numero_piece: string; code_client: string }
interface EntreeFacture { code_client: string; numero_piece: string }
interface RowImportId { id: string }

// Normalise un numéro de pièce pour la comparaison :
// - supprime espaces normaux, insécables et retours chariot
// - met en minuscules
// - purement numérique → entier String sans décimale ni zéros en tête
function normaliserNumero(val: string): string {
  const s = val.replace(/[ \r\n\t]/g, ' ').trim().toLowerCase()
  if (/^\d+(\.\d*)?$/.test(s)) {
    const n = Math.round(parseFloat(s))
    return Number.isFinite(n) ? String(n) : s
  }
  return s
}

async function parserFichier(fichier: File): Promise<{ colonnes: string[]; lignes: Record<string, string>[] }> {
  const ext = fichier.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') return parserCSV(fichier)
  const { colonnes, lignes } = await parserXLSX(fichier)
  return {
    colonnes,
    lignes: lignes.map(l =>
      Object.fromEntries(Object.entries(l).map(([k, v]) => [
        k,
        v instanceof Date
          ? (isNaN(v.getTime()) ? '' : v.toISOString().split('T')[0])
          : String(v ?? '').trim(),
      ]))
    ) as Record<string, string>[],
  }
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
    _hash: string
  ): Promise<ResultatValidation> {
    const colPivot = mapping.find(m => m.champ_cible === 'numero_facture')?.colonne_source
    if (!colPivot) throw new Error('La colonne "N° de facture" doit être mappée.')

    const colMontant = mapping.find(m => m.champ_cible === 'montant')?.colonne_source
    if (!colMontant) throw new Error('La colonne "Montant TTC" doit être mappée.')

    const colDate = mapping.find(m => m.champ_cible === 'date_lettrage')?.colonne_source
    if (!colDate) throw new Error('La colonne "Date de lettrage" doit être mappée.')

    const { lignes } = await parserFichier(fichier)

    if (lignes.length === 0) throw new Error('Le fichier ne contient aucune ligne.')

    // Numéros de facture : version normalisée (lowercase, sans .0) pour la comparaison
    const numerosNormalises = [...new Set(
      lignes.map(l => normaliserNumero(l[colPivot] ?? '')).filter(Boolean)
    )]
    // Version originale (trim seul) pour interroger la DB qui peut stocker en majuscules
    const numerosOriginaux = [...new Set(
      lignes.map(l => (l[colPivot] ?? '').trim()).filter(Boolean)
    )]
    // Union des deux → couvre le cas DB uppercase ET DB lowercase
    const numerosQuery = [...new Set([...numerosNormalises, ...numerosOriginaux])]

    if (numerosNormalises.length === 0) throw new Error('Aucun numéro de facture trouvé dans la colonne mappée.')

    // Vérifie les factures — clé de la map en lowercase pour match insensible à la casse
    const facturesMap = new Map<string, EntreeFacture>()
    for (let i = 0; i < numerosQuery.length; i += 500) {
      const { data, error } = await supabase
        .from('factures')
        .select('numero_piece, code_client')
        .in('numero_piece', numerosQuery.slice(i, i + 500))
      if (error) throw new Error(`Erreur vérification factures : ${error.message}`)
      const rows = data as unknown as RowFacture[] | null
      // Clé lowercase → lookup toujours en lowercase ; valeur conserve la forme canonique DB
      rows?.forEach(r => facturesMap.set(r.numero_piece.toLowerCase(), {
        code_client: r.code_client,
        numero_piece: r.numero_piece,
      }))
    }


    const colCodeClient   = mapping.find(m => m.champ_cible === 'code_client')?.colonne_source
    const colLibelle      = mapping.find(m => m.champ_cible === 'libelle_bancaire')?.colonne_source
    const colCommentaire  = mapping.find(m => m.champ_cible === 'commentaire')?.colonne_source

    // Construit les lignes valides et identifie les invalides
    const lignesAInserer: Record<string, unknown>[] = []
    const lignesInvalides: { donnees_brutes: Record<string, string>; raison: string }[] = []
    let nbInvalides = 0

    const today = new Date().toISOString().split('T')[0]

    for (const ligne of lignes) {
      const numFact = normaliserNumero(ligne[colPivot] ?? '')
      const codeClientFichier = colCodeClient ? (ligne[colCodeClient] ?? '').trim() : null
      const entreeFacture = facturesMap.get(numFact)
      const montant = parseNombre(ligne[colMontant])
      const dateRaw = (ligne[colDate] ?? '').trim()
      const dateParsee = parseDate(dateRaw)
      const labelTexte = !dateParsee && dateRaw ? dateRaw : null

      // Facture introuvable, montant manquant, ou colonne date vide
      if (!entreeFacture || !montant || (!dateParsee && !labelTexte)) {
        const raisons: string[] = []
        if (!entreeFacture) raisons.push('Facture introuvable en base')
        if (!montant) raisons.push('Montant manquant ou invalide')
        if (!dateParsee && !labelTexte) raisons.push('Date manquante ou invalide')
        lignesInvalides.push({ donnees_brutes: ligne, raison: raisons.join(' · ') })
        nbInvalides++
        continue
      }

      const libelle     = colLibelle     ? (ligne[colLibelle]     ?? '').trim() : ''
      const commentaire = colCommentaire ? (ligne[colCommentaire] ?? '').trim() : ''
      const commentaireFinal = [libelle, commentaire].filter(Boolean).join(' · ') || labelTexte || null

      lignesAInserer.push({
        // Forme canonique DB → le trigger sync_reste_du retrouve la facture exactement
        numero_facture: entreeFacture.numero_piece,
        code_client: codeClientFichier || entreeFacture.code_client,
        montant: Math.round(montant * 100) / 100,
        date_lettrage: dateParsee ?? today,
        commentaire: commentaireFinal,
        mode: 'import',
      })
    }

    // Aperçu des 10 premières lignes avec statut
    const apercu = lignes.slice(0, 10).map(l => {
      const num = normaliserNumero(l[colPivot] ?? '')
      const existe = facturesMap.has(num)
      const montant = parseNombre(l[colMontant])
      const dateRaw = (l[colDate] ?? '').trim()
      const dateParsee = parseDate(dateRaw)
      const hasLabel = !dateParsee && !!dateRaw
      return {
        donnees: l,
        statut: (!existe || !montant || (!dateParsee && !hasLabel)) ? 'invalide' as const : 'nouveau' as const,
        cle_pivot: num,
      }
    })

    return {
      lignes_a_inserer: lignesAInserer,
      apercu,
      nb_total: lignes.length,
      nb_nouvelles: lignesAInserer.length,
      nb_doublons: 0,
      nb_invalides: nbInvalides,
      lignes_invalides: lignesInvalides,
      hash: _hash,
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
          nb_lignes_doublons: 0,
          cree_par: utilisateur?.id ?? null,
        } as never)
        .select('id')
        .single()
      if (errImport) throw new Error(`Erreur création import : ${errImport.message}`)
      const importRec = importData as unknown as RowImportId | null
      if (!importRec) throw new Error('Enregistrement d\'import non créé.')

      // Insertion des lettrages par lots — le trigger sync_reste_du met à jour factures.reste_du
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
