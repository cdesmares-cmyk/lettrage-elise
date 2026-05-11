// Hook d'import comptes clients — upsert (création + mise à jour) sur la table clients
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculerHash, detecterMapping, parserCSV, parserXLSX } from '../lib/parseursImport'
import { CHAMPS_CLIENTS } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'
import { useAuth } from '../contexts/AuthContext'

interface RowImportRef { id: string; cree_le: string }
interface RowImportId { id: string }
interface RowCodeDso { code_dso: string }

async function parserFichier(fichier: File) {
  const ext = fichier.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') {
    return parserCSV(fichier)
  }
  const r = await parserXLSX(fichier)
  return {
    colonnes: r.colonnes,
    lignes: r.lignes.map(l =>
      Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v ?? '')])),
    ) as Record<string, string>[],
  }
}

function appliquerMapping(ligne: Record<string, string>, mapping: LigneMapping[]): Record<string, unknown> {
  const res: Record<string, unknown> = {}
  for (const m of mapping) {
    if (!m.champ_cible) continue
    const val = (ligne[m.colonne_source] ?? '').trim()
    res[m.champ_cible] = val || null
  }
  return res
}

export function useImportClients() {
  const [chargement, setChargement] = useState(false)
  const { utilisateur } = useAuth()

  async function analyserFichier(fichier: File): Promise<ResultatAnalyse> {
    const [hash, { colonnes, lignes }] = await Promise.all([
      calculerHash(fichier),
      parserFichier(fichier),
    ])
    const mapping = detecterMapping(colonnes, CHAMPS_CLIENTS).map((m, i) => ({
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
    // Anti-replay fichier
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
    const colPivot = mapping.find(m => m.champ_cible === 'code_dso')?.colonne_source
    if (!colPivot) throw new Error('La colonne Code client (pivot) doit être mappée.')

    // Dédoublonnage intra-fichier sur la clé pivot
    const vus = new Set<string>()
    const lignesUniques: Record<string, string>[] = []
    for (const l of lignes) {
      const code = (l[colPivot] ?? '').trim()
      if (!code || vus.has(code)) continue
      vus.add(code)
      lignesUniques.push(l)
    }

    const tousLesCodes = [...vus]

    // Codes déjà en base
    const existants = new Set<string>()
    for (let i = 0; i < tousLesCodes.length; i += 500) {
      const { data } = await supabase
        .from('clients')
        .select('code_dso')
        .in('code_dso', tousLesCodes.slice(i, i + 500))
      const rows = data as unknown as RowCodeDso[] | null
      rows?.forEach(r => existants.add(r.code_dso))
    }

    const nouveaux = lignesUniques.filter(l => !existants.has((l[colPivot] ?? '').trim()))
    const miseAJour = lignesUniques.filter(l => existants.has((l[colPivot] ?? '').trim()))

    const lignes_a_inserer = lignesUniques.map(l => appliquerMapping(l, mapping))

    const apercu = lignesUniques.slice(0, 10).map(l => {
      const code = (l[colPivot] ?? '').trim()
      return {
        donnees: l,
        statut: existants.has(code) ? ('doublon' as const) : ('nouveau' as const),
        cle_pivot: code,
      }
    })

    return {
      lignes_a_inserer,
      apercu,
      nb_total: lignesUniques.length,
      nb_nouvelles: nouveaux.length,
      nb_doublons: miseAJour.length,
      hash,
      nom_fichier: fichier.name,
    }
  }

  async function executerImport(resultat: ResultatValidation): Promise<ResultatImport> {
    setChargement(true)
    try {
      // Enregistrement de l'import
      const { data: d2, error: errImport } = await supabase
        .from('imports')
        .insert({
          type: 'import_clients' as const,
          nom_fichier: resultat.nom_fichier,
          hash_fichier: resultat.hash,
          nb_lignes_total: resultat.nb_total,
          nb_lignes_inserees: resultat.nb_total,
          nb_lignes_doublons: 0,
          cree_par: utilisateur?.id ?? null,
        } as never)
        .select('id')
        .single()
      if (errImport) throw errImport
      const importRec = d2 as unknown as RowImportId | null
      if (!importRec) throw new Error('Enregistrement d\'import non créé.')

      // Upsert par lots de 500 (créer nouveaux + mettre à jour existants)
      try {
        for (let i = 0; i < resultat.lignes_a_inserer.length; i += 500) {
          const lot = resultat.lignes_a_inserer.slice(i, i + 500)
          const { error } = await supabase
            .from('clients')
            .upsert(lot as never, { onConflict: 'code_dso', ignoreDuplicates: false })
          if (error) throw error
        }

        // Crée la facture tampon _compte pour chaque client (ON CONFLICT DO NOTHING — préserve si déjà existant)
        const today = new Date().toISOString().split('T')[0]
        const facturesTampon = resultat.lignes_a_inserer
          .filter(l => l['code_dso'] && l['nom'])
          .map(l => ({
            numero_piece: `${l['code_dso']}_compte`,
            code_client: l['code_dso'] as string,
            nom_client: l['nom'] as string,
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
      } catch (err) {
        await supabase.from('imports').delete().eq('id', importRec.id)
        throw err
      }

      return { import_id: importRec.id, nb_inserees: resultat.nb_total }
    } finally {
      setChargement(false)
    }
  }

  return { analyserFichier, preparerImport, executerImport, chargement }
}
