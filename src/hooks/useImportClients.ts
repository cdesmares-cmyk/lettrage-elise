// Hook d'import comptes clients — upsert (création + mise à jour) sur la table clients
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculerHash, detecterMapping, parserCSV, parserXLSX, parseBoolean } from '../lib/parseursImport'
import { CHAMPS_CLIENTS } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'
import { useAuth } from '../contexts/AuthContext'

interface RowImportRef { id: string; cree_le: string }
interface RowImportId { id: string }

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
    const champ = CHAMPS_CLIENTS.find(c => c.cle === m.champ_cible)
    if (champ?.type === 'boolean') {
      res[m.champ_cible] = val ? parseBoolean(val) : null
    } else {
      res[m.champ_cible] = val || null
    }
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

    // Table de correspondance commercial : nom (lowercase) et email → nom stocké
    const { data: utilisateursData } = await supabase.from('utilisateurs').select('nom, email')
    const commerciauxMap = new Map<string, string>()
    for (const u of (utilisateursData as unknown as { nom: string; email: string }[] | null) ?? []) {
      if (u.nom) commerciauxMap.set(u.nom.toLowerCase().trim(), u.nom.trim())
      if (u.email) commerciauxMap.set(u.email.toLowerCase().trim(), u.nom.trim())
    }

    // Clients déjà en base : récupère code_dso + nom actuel
    interface RowClientNom { code_dso: string; nom: string }
    const nomsExistants: Record<string, string> = {}
    for (let i = 0; i < tousLesCodes.length; i += 500) {
      const { data } = await supabase
        .from('clients')
        .select('code_dso, nom')
        .in('code_dso', tousLesCodes.slice(i, i + 500))
      const rows = data as unknown as RowClientNom[] | null
      rows?.forEach(r => { nomsExistants[r.code_dso] = r.nom })
    }
    const existants = new Set(Object.keys(nomsExistants))

    const nouveaux = lignesUniques.filter(l => !existants.has((l[colPivot] ?? '').trim()))
    const miseAJour = lignesUniques.filter(l => existants.has((l[colPivot] ?? '').trim()))

    const lignes_a_inserer = lignesUniques.map(l => {
      const row = appliquerMapping(l, mapping)
      if (row.commercial) {
        const val = String(row.commercial).toLowerCase().trim()
        row.commercial = commerciauxMap.get(val) ?? null
      }
      return row
    })

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
      codes_existants: [...existants],
      noms_existants: nomsExistants,
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

      // Upsert par lots de 500.
      // Règle nom : PostgREST normalise tous les rangs d'un batch sur l'union des clés —
      // un rang sans 'nom' reçoit null, ce qui viole NOT NULL.
      // Solution : garantir que CHAQUE rang porte un nom non-null.
      //   - Client existant sans nom dans le fichier → nom actuel récupéré en base
      //   - Nouveau client sans nom dans le fichier  → nom = code_dso
      const nomsExistants = resultat.noms_existants ?? {}
      try {
        for (let i = 0; i < resultat.lignes_a_inserer.length; i += 500) {
          const lot = resultat.lignes_a_inserer.slice(i, i + 500).map(row => {
            const r = { ...row } as Record<string, unknown>
            const code = r['code_dso'] as string
            if (!r['nom']) {
              // Priorité : nom en base (existant) > code_dso (fallback NOT NULL)
              r['nom'] = nomsExistants[code] ?? code
            }
            if (!r['siret']) delete r['siret']
            r['import_id'] = importRec!.id
            return r
          })
          const { error } = await supabase
            .from('clients')
            .upsert(lot as never, { onConflict: 'organisation_id,code_dso', ignoreDuplicates: false })
          if (error) throw error
        }

        // Crée la facture tampon _compte pour chaque client (ON CONFLICT DO NOTHING — préserve si déjà existant)
        const today = new Date().toISOString().split('T')[0]
        const facturesTampon = resultat.lignes_a_inserer
          .filter(l => l['code_dso'])
          .map(l => ({
            numero_piece: `411_${l['code_dso']}`,
            code_client: l['code_dso'] as string,
            nom_client: (l['nom'] as string | null) ?? null,
            date_emission: today,
            montant_ttc: 0,
            montant_ht: 0,
            est_avoir: false,
            est_provisionnee: false,
          }))
        for (let i = 0; i < facturesTampon.length; i += 500) {
          const { error } = await supabase
            .from('factures')
            .upsert(facturesTampon.slice(i, i + 500) as never, { onConflict: 'organisation_id,numero_piece', ignoreDuplicates: true })
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
