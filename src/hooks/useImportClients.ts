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

    // ── Resolution du commercial ────────────────────────────────────────────
    //
    // L'EMAIL est la cle. C'est la seule valeur du systeme qui identifie une
    // personne sans ambiguite : ni accent, ni ordre prenom/nom, ni homonyme.
    // Cette base compte trois comptes portant « Clement Desmares » — un
    // rapprochement par nom y est imprevisible.
    //
    // Les ecritures du nom restent acceptees EN REPLI, pour les fichiers deja
    // en circulation. Mais une graphie partagee par deux utilisateurs est
    // marquee ambigue et refusee : mieux vaut ne rien ecrire que de choisir au
    // hasard.
    //
    // Le libelle stocke est celui du panneau Options — « Nom Prenom ». L'import
    // ecrivait « Nom » seul, que le selecteur ne sait pas afficher : la donnee
    // etait juste et le champ paraissait vide.
    interface RowUtil { id: string; prenom: string | null; nom: string; email: string }
    const { data: utilisateursData } = await supabase
      .from('utilisateurs').select('id, prenom, nom, email')

    type Cible = { id: string; libelle: string }
    const parEmail = new Map<string, Cible>()
    const parNom   = new Map<string, Cible | null>()   // null = graphie ambigue

    for (const u of (utilisateursData as unknown as RowUtil[] | null) ?? []) {
      const libelle = u.prenom ? `${u.nom} ${u.prenom}` : u.nom
      const cible: Cible = { id: u.id, libelle }
      if (u.email) parEmail.set(u.email.toLowerCase().trim(), cible)
      const graphies = u.prenom
        ? [u.nom, `${u.nom} ${u.prenom}`, `${u.prenom} ${u.nom}`]
        : [u.nom]
      for (const g of graphies) {
        const cle = g.toLowerCase().trim()
        if (!cle) continue
        const vu = parNom.get(cle)
        if (vu === undefined) parNom.set(cle, cible)
        else if (vu === null || vu.id !== u.id) parNom.set(cle, null)
      }
    }

    function resoudreCommercial(brut: string): Cible | null {
      const cle = brut.toLowerCase().trim()
      return parEmail.get(cle) ?? parNom.get(cle) ?? null
    }

    // Clients déjà en base : récupère code_dso + nom actuel
    interface RowClientNom {
      code_dso: string; nom: string
      commercial: string | null; commercial_id: string | null
    }
    const nomsExistants: Record<string, string> = {}
    const commerciauxExistants: Record<string, { commercial: string | null; commercial_id: string | null }> = {}
    for (let i = 0; i < tousLesCodes.length; i += 500) {
      const { data } = await supabase
        .from('clients')
        .select('code_dso, nom, commercial, commercial_id')
        .in('code_dso', tousLesCodes.slice(i, i + 500))
      const rows = data as unknown as RowClientNom[] | null
      rows?.forEach(r => {
        nomsExistants[r.code_dso] = r.nom
        commerciauxExistants[r.code_dso] = { commercial: r.commercial, commercial_id: r.commercial_id }
      })
    }
    const existants = new Set(Object.keys(nomsExistants))

    const nouveaux = lignesUniques.filter(l => !existants.has((l[colPivot] ?? '').trim()))
    const miseAJour = lignesUniques.filter(l => existants.has((l[colPivot] ?? '').trim()))

    // La colonne Commercial n'est traitee que si elle est mappee. Sinon on ne
    // touche ni au texte ni au lien.
    const aColonneCommercial = mapping.some(m => m.champ_cible === 'commercial')
    const nonReconnus = new Map<string, number>()

    const lignes_a_inserer = lignesUniques.map(l => {
      const row = appliquerMapping(l, mapping)
      if (!aColonneCommercial) return row

      const code    = (l[colPivot] ?? '').trim()
      const actuel  = commerciauxExistants[code]
      const brut    = row.commercial == null ? '' : String(row.commercial).trim()
      const cible   = brut ? resoudreCommercial(brut) : null

      if (cible) {
        row.commercial    = cible.libelle
        row.commercial_id = cible.id
      } else {
        // Cellule vide ou valeur non reconnue : on REECRIT l'existant.
        // PostgREST normalise tous les rangs d'un lot sur l'union des cles —
        // omettre la cle ici mettrait null sur les autres rangs. On la porte
        // donc toujours, avec la valeur d'aujourd'hui.
        if (brut) nonReconnus.set(brut, (nonReconnus.get(brut) ?? 0) + 1)
        row.commercial    = actuel?.commercial ?? null
        row.commercial_id = actuel?.commercial_id ?? null
      }
      return row
    })

    const commerciaux_non_reconnus = [...nonReconnus.entries()]
      .map(([valeur, nb]) => ({ valeur, nb }))
      .sort((a, b) => b.nb - a.nb)

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
      commerciaux_existants: commerciauxExistants,
      commerciaux_non_reconnus,
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

      // Garde-fou : aucune ligne ne doit partir sans code client. Sans lui,
      // PostgreSQL repond « null value in column code_dso violates not-null
      // constraint », message que personne ne peut relier a son fichier.
      const sansCode = resultat.lignes_a_inserer.filter(
        l => !l['code_dso'] || String(l['code_dso']).trim() === ''
      ).length
      if (sansCode > 0) {
        await supabase.from('imports').delete().eq('id', importRec.id)
        throw new Error(
          `${sansCode} ligne${sansCode > 1 ? 's' : ''} sans code client. ` +
          'Vérifiez que la colonne « Code client » est bien celle qui porte les codes, ' +
          'et qu\'aucune autre colonne ne vise le même champ.'
        )
      }

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
