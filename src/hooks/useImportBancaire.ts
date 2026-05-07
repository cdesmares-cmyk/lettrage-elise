// Hook d'import des relevés bancaires CSV (section 5.1 du CDC)
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculerHash, detecterMapping, parseDate, parseNombre, parserCSV } from '../lib/parseursImport'
import { CHAMPS_BANCAIRES } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'
import { useAuth } from '../contexts/AuthContext'

// Types locaux pour contourner les limitations d'inférence Supabase avec TS6
interface RowImportRef { id: string; cree_le: string }
interface RowIdOperation { id_operation: string }
interface RowImportId { id: string }

function appliquerMapping(
  ligne: Record<string, string>,
  mapping: LigneMapping[]
): Record<string, unknown> {
  const res: Record<string, unknown> = {}
  for (const m of mapping) {
    if (!m.champ_cible) continue
    const val = ligne[m.colonne_source]
    if (m.champ_cible === 'debit' || m.champ_cible === 'credit') {
      res[m.champ_cible] = parseNombre(val)
    } else if (m.champ_cible === 'date_operation') {
      res[m.champ_cible] = parseDate(val)
    } else {
      res[m.champ_cible] = val || null
    }
  }
  return res
}

export function useImportBancaire() {
  const [chargement, setChargement] = useState(false)
  const { utilisateur } = useAuth()

  // Étape 2→3 : lit les en-têtes et 5 premières lignes, détecte le mapping automatique
  async function analyserFichier(fichier: File): Promise<ResultatAnalyse> {
    const [hash, { colonnes, lignes }] = await Promise.all([
      calculerHash(fichier),
      parserCSV(fichier),
    ])
    const mapping = detecterMapping(colonnes, CHAMPS_BANCAIRES).map((m, i) => ({
      ...m,
      exemple: String(lignes[0]?.[colonnes[i]] ?? ''),
    }))
    return { colonnes, apercu: lignes.slice(0, 5), mapping, hash }
  }

  // Étape 3→4 : applique le mapping, vérifie les doublons pivot en base
  async function preparerImport(
    fichier: File,
    mapping: LigneMapping[],
    hash: string
  ): Promise<ResultatValidation> {
    // Anti-replay au niveau fichier (hash unique)
    const { data: d1 } = await supabase
      .from('imports')
      .select('id, cree_le')
      .eq('hash_fichier', hash)
      .maybeSingle()
    const dejaimporte = d1 as unknown as RowImportRef | null
    if (dejaimporte) {
      const d = new Date(dejaimporte.cree_le).toLocaleDateString('fr-FR')
      throw new Error(`Ce fichier a déjà été importé le ${d}.`)
    }

    const { lignes } = await parserCSV(fichier)
    const colPivot = mapping.find(m => m.champ_cible === 'id_operation')?.colonne_source
    if (!colPivot) throw new Error('La colonne N° Opération (pivot) doit être mappée.')

    const toutesLesCles = [...new Set(lignes.map(l => l[colPivot]).filter(Boolean))]

    // Vérification par lots de 500 (limite URL Supabase)
    const existantes = new Set<string>()
    for (let i = 0; i < toutesLesCles.length; i += 500) {
      const { data: d2 } = await supabase
        .from('lignes_bancaires')
        .select('id_operation')
        .in('id_operation', toutesLesCles.slice(i, i + 500))
      const rows = d2 as unknown as RowIdOperation[] | null
      rows?.forEach(r => existantes.add(r.id_operation))
    }

    // Doublons vs base de données
    const candidats = lignes.filter(l => !existantes.has(l[colPivot]))

    // Doublons intra-fichier : même clé pivot en double dans le fichier
    const vuesDansFichier = new Set<string>()
    const nouvelles: typeof lignes = []
    const doublonsIntraFichier: typeof lignes = []
    for (const l of candidats) {
      const cle = l[colPivot]
      if (vuesDansFichier.has(cle)) { doublonsIntraFichier.push(l) }
      else { vuesDansFichier.add(cle); nouvelles.push(l) }
    }

    // Aperçu avec détection de doublon en ordre de lecture
    const vuesApercu = new Set<string>()
    const apercu = lignes.slice(0, 10).map(l => {
      const cle = l[colPivot] ?? ''
      const estDoublon = existantes.has(cle) || vuesApercu.has(cle)
      vuesApercu.add(cle)
      return { donnees: l, statut: estDoublon ? 'doublon' as const : 'nouveau' as const, cle_pivot: cle }
    })

    return {
      lignes_a_inserer: nouvelles.map(l => appliquerMapping(l, mapping)),
      apercu,
      nb_total: lignes.length,
      nb_nouvelles: nouvelles.length,
      nb_doublons: (lignes.length - candidats.length) + doublonsIntraFichier.length,
      hash,
      nom_fichier: fichier.name,
    }
  }

  // Étape 4→succès : insère l'enregistrement d'import puis les lignes bancaires
  async function executerImport(resultat: ResultatValidation): Promise<ResultatImport> {
    setChargement(true)
    try {
      const { data: d3, error: errImport } = await supabase
        .from('imports')
        .insert({
          type: 'csv_bancaire' as const,
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
      const importRec = d3 as unknown as RowImportId | null
      if (!importRec) throw new Error('Enregistrement d\'import non créé.')

      try {
        for (let i = 0; i < resultat.lignes_a_inserer.length; i += 500) {
          const lot = resultat.lignes_a_inserer.slice(i, i + 500).map(l => ({
            ...l,
            import_id: importRec.id,
          }))
          // `as never` car les lignes sont validées par le mapping — TS6 ne peut pas inférer ici
          const { error } = await supabase.from('lignes_bancaires').insert(lot as never)
          if (error) throw error
        }
      } catch (err) {
        // Nettoyage : supprimer l'import si l'insertion des lignes échoue
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
