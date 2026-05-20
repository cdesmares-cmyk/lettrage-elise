// Hook d'import des factures XLSX (section 5.1 du CDC)
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  calculerHash, detecterMapping, parseDate, parseNombre, parseBoolean, parserCSV, parserXLSX
} from '../lib/parseursImport'

async function parserFichier(fichier: File) {
  const ext = fichier.name.split('.').pop()?.toLowerCase()
  return ext === 'csv' ? parserCSV(fichier).then(r => ({
    colonnes: r.colonnes,
    lignes: r.lignes as Record<string, unknown>[],
  })) : parserXLSX(fichier)
}
import { CHAMPS_FACTURES } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'
import { useAuth } from '../contexts/AuthContext'

// Types locaux pour contourner les limitations d'inférence Supabase avec TS6
interface RowImportRef { id: string; cree_le: string }
interface RowNumeroPiece { numero_piece: string }
interface RowImportId { id: string }
interface RowClientNom { code_dso: string; nom: string }

function normaliserNumero(val: string): string {
  const s = val.trim()
  if (/^\d+(\.\d*)?$/.test(s)) {
    const n = Math.round(parseFloat(s))
    return Number.isFinite(n) ? String(n) : s
  }
  return s
}

function appliquerMapping(
  ligne: Record<string, unknown>,
  mapping: LigneMapping[]
): Record<string, unknown> {
  const res: Record<string, unknown> = {}
  for (const m of mapping) {
    if (!m.champ_cible) continue
    const val = ligne[m.colonne_source]
    if (m.champ_cible === 'montant_ttc' || m.champ_cible === 'montant_ht' || m.champ_cible === 'reste_du') {
      const n = parseNombre(val)
      res[m.champ_cible] = n !== null ? Math.round(n * 100) / 100 : null
    } else if (m.champ_cible === 'date_emission' || m.champ_cible === 'date_echeance') {
      res[m.champ_cible] = parseDate(val)
    } else if (m.champ_cible === 'est_avoir') {
      res[m.champ_cible] = parseBoolean(val)
    } else if (m.champ_cible === 'numero_piece') {
      res[m.champ_cible] = val != null ? normaliserNumero(String(val)) : null
    } else {
      res[m.champ_cible] = val != null ? String(val).trim() : null
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
      parserFichier(fichier),
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

    const { lignes } = await parserFichier(fichier)
    const colPivot = mapping.find(m => m.champ_cible === 'numero_piece')?.colonne_source
    if (!colPivot) throw new Error('La colonne N° de pièce (pivot) doit être mappée.')

    const toutesLesCles = [...new Set(
      lignes.map(l => String(l[colPivot] ?? '')).filter(Boolean)
    )]

    // Récupère les codes clients uniques du fichier pour vérifier les noms
    const colCodeClient = mapping.find(m => m.champ_cible === 'code_client')?.colonne_source
    const colNomClient  = mapping.find(m => m.champ_cible === 'nom_client')?.colonne_source
    const codesClientsUniques = colCodeClient
      ? [...new Set(lignes.map(l => String(l[colCodeClient] ?? '')).filter(Boolean))]
      : []

    // Charge les clients existants (nom de référence = source de vérité)
    const clientsEnBase = new Map<string, string>() // code_dso → nom actuel
    for (let i = 0; i < codesClientsUniques.length; i += 500) {
      const { data } = await supabase
        .from('clients')
        .select('code_dso, nom')
        .in('code_dso', codesClientsUniques.slice(i, i + 500))
      const rows = data as unknown as RowClientNom[] | null
      rows?.forEach(r => clientsEnBase.set(r.code_dso, r.nom))
    }

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

    const totalTtcFichier = Math.round(
      lignes.reduce((s, l) => {
        const m = appliquerMapping(l, mapping)
        return s + (typeof m['montant_ttc'] === 'number' ? m['montant_ttc'] : 0)
      }, 0) * 100
    ) / 100

    // Détecte les clients dont le nom dans le fichier diffère du nom en base
    const noms_differents: { code_client: string; nom_fichier: string; nom_base: string }[] = []
    if (colCodeClient && colNomClient) {
      const vus = new Set<string>()
      for (const l of lignes) {
        const code = String(l[colCodeClient] ?? '').trim()
        const nomF = String(l[colNomClient] ?? '').trim()
        if (!code || !nomF || vus.has(code)) continue
        vus.add(code)
        const nomBase = clientsEnBase.get(code)
        if (nomBase && nomBase.toLowerCase() !== nomF.toLowerCase()) {
          noms_differents.push({ code_client: code, nom_fichier: nomF, nom_base: nomBase })
        }
      }
    }

    // Pour les nouvelles lignes : remplace nom_client par le nom de la base si le client existe
    // Filtre les lignes dont les champs obligatoires sont vides (code_client, numero_piece, date_emission, montant_ttc)
    const lignes_mappees = nouvelles.map(l => {
      const mapped = appliquerMapping(l, mapping)
      const code = mapped['code_client'] as string | undefined
      if (code && clientsEnBase.has(code)) {
        mapped['nom_client'] = clientsEnBase.get(code)!
      }
      return mapped
    })
    const lignes_a_inserer = lignes_mappees.filter(l =>
      l['code_client'] && l['numero_piece'] && l['date_emission'] && l['montant_ttc'] != null
    )
    const nb_invalides = lignes_mappees.length - lignes_a_inserer.length

    return {
      lignes_a_inserer,
      apercu,
      nb_total: lignes.length,
      nb_nouvelles: lignes_a_inserer.length,
      nb_doublons: (lignes.length - candidats.length) + doublonsIntraFichier.length,
      nb_invalides: nb_invalides > 0 ? nb_invalides : undefined,
      total_ttc_fichier: totalTtcFichier,
      noms_differents: noms_differents.length > 0 ? noms_differents : undefined,
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

        // Crée la facture tampon _compte pour chaque client (ON CONFLICT DO NOTHING — préserve si déjà existant)
        const today = new Date().toISOString().split('T')[0]
        const facturesTampon = clientsUniques.map(c => ({
          numero_piece: `${c.code_dso}_compte`,
          code_client: c.code_dso,
          nom_client: c.nom,
          date_emission: today,
          montant_ttc: 0,
          montant_ht: 0,
          est_avoir: false,
          est_provisionnee: false,
        }))
        for (let i = 0; i < facturesTampon.length; i += 500) {
          const { error } = await supabase
            .from('factures')
            .upsert(facturesTampon.slice(i, i + 500) as never, { onConflict: 'numero_piece', ignoreDuplicates: true })
          if (error) throw error
        }
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

      // 3. Insertion des factures par lots de 500 (import_id tracé pour annulation)
      try {
        for (let i = 0; i < resultat.lignes_a_inserer.length; i += 500) {
          const lot = resultat.lignes_a_inserer.slice(i, i + 500).map((l: Record<string, unknown>) => ({
            ...l,
            import_id: importRec.id,
          }))
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
