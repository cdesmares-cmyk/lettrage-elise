// Hook d'import des factures XLSX (section 5.1 du CDC)
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  calculerHash, detecterMapping, parseDate, parseNombre, parseBoolean, parserXLSX
} from '../lib/parseursImport'
import { CHAMPS_FACTURES } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'
import { useAuth } from '../contexts/AuthContext'

// Types locaux pour contourner les limitations d'inférence Supabase avec TS6
interface RowImportRef { id: string; cree_le: string }
interface RowNumeroPiece { numero_piece: string }
interface RowImportId { id: string }

function appliquerMapping(
  ligne: Record<string, unknown>,
  mapping: LigneMapping[]
): Record<string, unknown> {
  const res: Record<string, unknown> = {}
  for (const m of mapping) {
    if (!m.champ_cible) continue
    const val = ligne[m.colonne_source]
    if (m.champ_cible === 'montant_ttc' || m.champ_cible === 'montant_ht') {
      const n = parseNombre(val)
      res[m.champ_cible] = n !== null ? Math.round(n * 100) / 100 : null
    } else if (m.champ_cible === 'date_emission' || m.champ_cible === 'date_echeance') {
      res[m.champ_cible] = parseDate(val)
    } else if (m.champ_cible === 'est_avoir') {
      res[m.champ_cible] = parseBoolean(val)
    } else {
      res[m.champ_cible] = val != null ? String(val) : null
    }
  }
  if (res['est_avoir'] === undefined) res['est_avoir'] = false
  if (res['est_provisionnee'] === undefined) res['est_provisionnee'] = false
  // Auto-détection avoir : montant TTC négatif → avoir même si colonne non mappée
  if (!res['est_avoir'] && typeof res['montant_ttc'] === 'number' && res['montant_ttc'] < 0) {
    res['est_avoir'] = true
  }
  return res
}

export function useImportFactures() {
  const [chargement, setChargement] = useState(false)
  const { utilisateur } = useAuth()

  // Étape 2→3 : lit les en-têtes et 5 premières lignes, détecte le mapping automatique
  async function analyserFichier(fichier: File): Promise<ResultatAnalyse> {
    const [hash, { colonnes, lignes }] = await Promise.all([
      calculerHash(fichier),
      parserXLSX(fichier),
    ])
    const mapping = detecterMapping(colonnes, CHAMPS_FACTURES).map((m, i) => ({
      ...m,
      exemple: String(lignes[0]?.[colonnes[i]] ?? ''),
    }))
    const apercu = lignes.slice(0, 5).map(l =>
      Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v ?? '')]))
    )
    return { colonnes, apercu, mapping, hash }
  }

  // Étape 3→4 : applique le mapping, vérifie les doublons pivot en base
  async function preparerImport(
    fichier: File,
    mapping: LigneMapping[],
    hash: string
  ): Promise<ResultatValidation> {
    // Anti-replay au niveau fichier
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

    const { lignes } = await parserXLSX(fichier)
    const colPivot = mapping.find(m => m.champ_cible === 'numero_piece')?.colonne_source
    if (!colPivot) throw new Error('La colonne N° de pièce (pivot) doit être mappée.')

    const toutesLesCles = [...new Set(
      lignes.map(l => String(l[colPivot] ?? '')).filter(Boolean)
    )]

    // Vérification par lots de 500
    const existantes = new Set<string>()
    for (let i = 0; i < toutesLesCles.length; i += 500) {
      const { data: d2 } = await supabase
        .from('factures')
        .select('numero_piece')
        .in('numero_piece', toutesLesCles.slice(i, i + 500))
      const rows = d2 as unknown as RowNumeroPiece[] | null
      rows?.forEach(r => existantes.add(r.numero_piece))
    }

    // Doublons vs base de données
    const candidats = lignes.filter(l => !existantes.has(String(l[colPivot] ?? '')))

    // Doublons intra-fichier : même clé pivot en double dans le fichier
    const vuesDansFichier = new Set<string>()
    const nouvelles: typeof lignes = []
    const doublonsIntraFichier: typeof lignes = []
    for (const l of candidats) {
      const cle = String(l[colPivot] ?? '')
      if (vuesDansFichier.has(cle)) { doublonsIntraFichier.push(l) }
      else { vuesDansFichier.add(cle); nouvelles.push(l) }
    }

    // Aperçu avec détection de doublon en ordre de lecture
    const vuesApercu = new Set<string>()
    const apercu = lignes.slice(0, 10).map(l => {
      const cle = String(l[colPivot] ?? '')
      const estDoublon = existantes.has(cle) || vuesApercu.has(cle)
      vuesApercu.add(cle)
      return {
        donnees: Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v ?? '')])),
        statut: estDoublon ? 'doublon' as const : 'nouveau' as const,
        cle_pivot: cle,
      }
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

  // Étape 4→succès : upsert clients → enregistrement import → insertion factures
  async function executerImport(resultat: ResultatValidation): Promise<ResultatImport> {
    setChargement(true)
    try {
      // 1. Créer les comptes clients manquants (ON CONFLICT DO NOTHING — préserve les données existantes)
      const clientsUniques = [
        ...new Map(
          resultat.lignes_a_inserer
            .filter(l => l['code_client'] && l['nom_client'])
            .map(l => [
              l['code_client'] as string,
              { code_dso: l['code_client'] as string, nom: l['nom_client'] as string },
            ])
        ).values(),
      ]
      if (clientsUniques.length > 0) {
        const { error: errClients } = await supabase
          .from('clients')
          .upsert(clientsUniques as never, { onConflict: 'code_dso', ignoreDuplicates: true })
        if (errClients) throw errClients
      }

      // 2. Enregistrement de l'import
      const { data: d3, error: errImport } = await supabase
        .from('imports')
        .insert({
          type: 'xlsx_factures' as const,
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

      // 3. Insertion des factures par lots de 500
      try {
        for (let i = 0; i < resultat.lignes_a_inserer.length; i += 500) {
          const lot = resultat.lignes_a_inserer.slice(i, i + 500)
          const { error } = await supabase.from('factures').insert(lot as never)
          if (error) throw error
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
