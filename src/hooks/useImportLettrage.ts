// Import en masse de lettrages — migration historique (section 5.1 du CDC)
// Prérequis : les factures référencées doivent exister dans la table factures
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculerHash, detecterMapping, parseDate, parseNombre, parserCSV, parserXLSX } from '../lib/parseursImport'
import { CHAMPS_LETTRAGES } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'
import { useAuth } from '../contexts/AuthContext'

interface RowFacture { numero_piece: string; code_client: string; reste_du: number | null }
interface RowImportId { id: string }

async function parserFichier(fichier: File): Promise<{ colonnes: string[]; lignes: Record<string, string>[] }> {
  const ext = fichier.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') return parserCSV(fichier)
  const { colonnes, lignes } = await parserXLSX(fichier)
  return {
    colonnes,
    lignes: lignes.map(l =>
      Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v ?? '').trim()]))
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

    // Numéros de facture uniques dans le fichier
    const numerosUniques = [...new Set(
      lignes.map(l => (l[colPivot] ?? '').trim()).filter(Boolean)
    )]

    if (numerosUniques.length === 0) throw new Error('Aucun numéro de facture trouvé dans la colonne mappée.')

    // Vérifie les factures via la vue (identique à ce que montre Supabase Table Editor)
    const facturesMap = new Map<string, string>() // numero_piece → code_client
    for (let i = 0; i < numerosUniques.length; i += 500) {
      const { data, error } = await supabase
        .from('v_factures_avec_reste_du')
        .select('numero_piece, code_client')
        .in('numero_piece', numerosUniques.slice(i, i + 500))
      if (error) throw new Error(`Erreur vérification factures : ${error.message}`)
      const rows = data as unknown as RowFacture[] | null
      rows?.forEach(r => facturesMap.set(r.numero_piece, r.code_client))
    }

    const colCodeClient = mapping.find(m => m.champ_cible === 'code_client')?.colonne_source

    // Construit les lignes valides et identifie les invalides
    const lignesAInserer: Record<string, unknown>[] = []
    let nbInvalides = 0

    for (const ligne of lignes) {
      const numFact = (ligne[colPivot] ?? '').trim()
      const codeClientFichier = colCodeClient ? (ligne[colCodeClient] ?? '').trim() : null
      const codeClientFacture = facturesMap.get(numFact)
      const montant = parseNombre(ligne[colMontant])
      const date = parseDate(ligne[colDate])

      // Facture introuvable ou champs obligatoires manquants
      if (!codeClientFacture || !montant || !date) {
        nbInvalides++
        continue
      }

      lignesAInserer.push({
        numero_facture: numFact,
        code_client: codeClientFichier || codeClientFacture,
        montant: Math.round(montant * 100) / 100,
        date_lettrage: date,
        mode: 'import',
      })
    }

    // Aperçu des 10 premières lignes avec statut
    const apercu = lignes.slice(0, 10).map(l => {
      const num = (l[colPivot] ?? '').trim()
      const existe = facturesMap.has(num)
      const montant = parseNombre(l[colMontant])
      const date = parseDate(l[colDate])
      return {
        donnees: l,
        statut: (!existe || !montant || !date) ? 'invalide' as const : 'nouveau' as const,
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
