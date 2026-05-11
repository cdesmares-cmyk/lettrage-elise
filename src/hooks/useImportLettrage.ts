// Hook d'import de lettrages en masse — migration historique et prélèvements auto (section 5.1 du CDC)
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculerHash, detecterMapping, parseDate, parseNombre, parserCSV, parserXLSX } from '../lib/parseursImport'
import { CHAMPS_LETTRAGES } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'
import { useAuth } from '../contexts/AuthContext'

// Types locaux pour l'inférence Supabase avec TS6
interface RowFactureBase { numero_piece: string; code_client: string }
interface RowFactureStatut { numero_piece: string; statut_paiement: string }
interface RowImportId { id: string }
interface RowImportRef { id: string; cree_le: string }

// Choisit le parser selon l'extension du fichier
async function parserFichier(fichier: File) {
  const ext = fichier.name.split('.').pop()?.toLowerCase()
  return ext === 'csv' ? parserCSV(fichier) : parserXLSX(fichier).then(r => ({
    colonnes: r.colonnes,
    lignes: r.lignes.map(l =>
      Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v ?? '')])),
    ) as Record<string, string>[],
  }))
}

function appliquerMapping(
  ligne: Record<string, string>,
  mapping: LigneMapping[],
  codeClientDeduit: string | null
): Record<string, unknown> {
  const res: Record<string, unknown> = {}
  for (const m of mapping) {
    if (!m.champ_cible) continue
    const val = ligne[m.colonne_source]
    if (m.champ_cible === 'montant') {
      const n = parseNombre(val)
      res[m.champ_cible] = n !== null ? Math.round(n * 100) / 100 : null
    } else if (m.champ_cible === 'date_lettrage') {
      res[m.champ_cible] = parseDate(val)
    } else {
      res[m.champ_cible] = val?.trim() || null
    }
  }
  // code_client déduit depuis la facture si absent dans le fichier
  if (!res['code_client'] && codeClientDeduit) res['code_client'] = codeClientDeduit
  // mode toujours 'manuel' pour les imports en masse
  res['mode'] = 'manuel'
  return res
}

export function useImportLettrage() {
  const [chargement, setChargement] = useState(false)
  const { utilisateur } = useAuth()

  // Étape 2→3 : analyse le fichier (CSV ou XLSX)
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

  // Étape 3→4 : vérifie les factures en base + détecte sur-paiements
  async function preparerImport(
    fichier: File,
    mapping: LigneMapping[],
    hash: string
  ): Promise<ResultatValidation> {
    // Anti-replay au niveau fichier
    const { data: d1 } = await supabase
      .from('imports').select('id, cree_le').eq('hash_fichier', hash).maybeSingle()
    const dejaimporte = d1 as unknown as RowImportRef | null
    if (dejaimporte) {
      const d = new Date(dejaimporte.cree_le).toLocaleDateString('fr-FR')
      throw new Error(`Ce fichier a déjà été importé le ${d}.`)
    }

    const { lignes } = await parserFichier(fichier)
    const colPivot = mapping.find(m => m.champ_cible === 'numero_facture')?.colonne_source
    if (!colPivot) throw new Error('La colonne N° de facture (pivot) doit être mappée.')

    const toutesLesCles = [...new Set(lignes.map(l => (l[colPivot] ?? '').trim()).filter(Boolean))]

    // 1. Vérifie l'existence des factures via la table source (plus fiable que la vue)
    const facturesBase = new Map<string, string>() // numero_piece → code_client
    for (let i = 0; i < toutesLesCles.length; i += 500) {
      const { data: d2, error: errFact } = await supabase
        .from('factures')
        .select('numero_piece, code_client')
        .in('numero_piece', toutesLesCles.slice(i, i + 500))
      if (errFact) throw new Error(`Erreur vérification factures : ${errFact.message}`)
      const rows = d2 as unknown as RowFactureBase[] | null
      rows?.forEach(r => facturesBase.set(r.numero_piece, r.code_client))
    }

    // 2. Récupère les statuts de paiement pour détecter les sur-paiements (facultatif — erreur non bloquante)
    const surPaiementKeys = new Set<string>()
    try {
      for (let i = 0; i < toutesLesCles.length; i += 500) {
        const { data: d3 } = await supabase
          .from('v_factures_avec_reste_du')
          .select('numero_piece, statut_paiement')
          .in('numero_piece', toutesLesCles.slice(i, i + 500))
        const rows = d3 as unknown as RowFactureStatut[] | null
        rows?.filter(r => r.statut_paiement === 'paye').forEach(r => surPaiementKeys.add(r.numero_piece))
      }
    } catch {
      // Sur-paiements non détectables si la vue est indisponible — import continue sans cette vérification
    }

    // Compat : reconstruire facturesInfo depuis facturesBase pour la suite
    const facturesInfo = new Map<string, { code_client: string; statut: string }>()
    facturesBase.forEach((code_client, numero_piece) => {
      facturesInfo.set(numero_piece, {
        code_client,
        statut: surPaiementKeys.has(numero_piece) ? 'paye' : 'ouvert',
      })
    })

    const valides = lignes.filter(l => facturesInfo.has((l[colPivot] ?? '').trim()))
    const invalides = lignes.filter(l => !facturesInfo.has((l[colPivot] ?? '').trim()))
    const nbAvertissements = valides.filter(l => surPaiementKeys.has((l[colPivot] ?? '').trim())).length

    const lignes_mappees = valides.map(l => {
      const cle = (l[colPivot] ?? '').trim()
      const info = facturesInfo.get(cle)
      return appliquerMapping(l, mapping, info?.code_client ?? null)
    })
    // Filtre les lignes dont les champs obligatoires sont vides
    const lignes_a_inserer = lignes_mappees.filter(l =>
      l['numero_facture'] && l['code_client'] && l['date_lettrage'] && l['montant'] != null
    )
    const nbInvalidesChamps = lignes_mappees.length - lignes_a_inserer.length

    return {
      lignes_a_inserer,
      apercu: lignes.slice(0, 10).map(l => {
        const cle = (l[colPivot] ?? '').trim()
        const existe = facturesInfo.has(cle)
        const surPaiement = surPaiementKeys.has(cle)
        return {
          donnees: l,
          statut: !existe ? 'invalide' : surPaiement ? 'sur_paiement' : 'nouveau',
          cle_pivot: cle,
        }
      }),
      nb_total: lignes.length,
      nb_nouvelles: lignes_a_inserer.length,
      nb_doublons: 0,
      nb_avertissements: nbAvertissements,
      nb_invalides: invalides.length + nbInvalidesChamps,
      hash,
      nom_fichier: fichier.name,
    }
  }

  // Étape 4→succès : insère l'import puis les lettrages
  async function executerImport(resultat: ResultatValidation): Promise<ResultatImport> {
    setChargement(true)
    try {
      const { data: d3, error: errImport } = await supabase
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
      if (errImport) throw errImport
      const importRec = d3 as unknown as RowImportId | null
      if (!importRec) throw new Error('Enregistrement d\'import non créé.')

      try {
        for (let i = 0; i < resultat.lignes_a_inserer.length; i += 500) {
          const lot = resultat.lignes_a_inserer.slice(i, i + 500).map(l => ({
            ...l,
            cree_par: utilisateur?.id ?? null,
          }))
          const { error } = await supabase.from('lettrages').insert(lot as never)
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
