// Hook d'import contacts — upsert (email+code_client) et désactivation (colonne delete)
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculerHash, detecterMapping, parserCSV, parserXLSX } from '../lib/parseursImport'
import { CHAMPS_CONTACTS } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'
import { useAuth } from '../contexts/AuthContext'

interface RowImportRef { id: string; cree_le: string }
interface RowImportId { id: string }
interface RowContact { id: string; email: string; code_client: string }

async function parserFichier(fichier: File) {
  const ext = fichier.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') return parserCSV(fichier)
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

function normaliserEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function useImportContacts() {
  const [chargement, setChargement] = useState(false)
  const { utilisateur } = useAuth()

  async function analyserFichier(fichier: File): Promise<ResultatAnalyse> {
    const [hash, { colonnes, lignes }] = await Promise.all([
      calculerHash(fichier),
      parserFichier(fichier),
    ])
    const mapping = detecterMapping(colonnes, CHAMPS_CONTACTS).map((m, i) => ({
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

    const colEmail = mapping.find(m => m.champ_cible === 'email')?.colonne_source
    const colCode = mapping.find(m => m.champ_cible === 'code_client')?.colonne_source
    if (!colCode) throw new Error('La colonne Code client (pivot) doit être mappée.')
    if (!colEmail) throw new Error('La colonne Email doit être mappée.')

    const colNom = mapping.find(m => m.champ_cible === 'nom')?.colonne_source
    const colDelete = mapping.find(m => m.champ_cible === 'delete')?.colonne_source

    // Validation format + dédoublonnage intra-fichier (email+code_client)
    const vus = new Map<string, number>() // cle → index première occurrence
    const lignesValides: Record<string, string>[] = []
    const lignesErreur: { ligne: Record<string, string>; raison: string }[] = []
    const lignesDoublon = new Set<number>()

    for (let idx = 0; idx < lignes.length; idx++) {
      const l = lignes[idx]
      const email = normaliserEmail(l[colEmail] ?? '')
      const code = (l[colCode] ?? '').trim()
      const nom = colNom ? (l[colNom] ?? '').trim() : ''

      if (!email || !email.includes('@')) {
        lignesErreur.push({ ligne: l, raison: 'email invalide ou manquant' })
        continue
      }
      if (!code) {
        lignesErreur.push({ ligne: l, raison: 'code client manquant' })
        continue
      }
      if (!nom) {
        lignesErreur.push({ ligne: l, raison: 'nom manquant' })
        continue
      }

      const cle = `${email}|${code}`
      if (vus.has(cle)) {
        // Marque les deux occurrences comme doublons
        const premierIdx = vus.get(cle)!
        lignesDoublon.add(premierIdx)
        lignesDoublon.add(idx)
      } else {
        vus.set(cle, idx)
      }
    }

    // Retire les doublons intra-fichier
    for (let idx = 0; idx < lignes.length; idx++) {
      const l = lignes[idx]
      if (lignesDoublon.has(idx)) continue
      const email = normaliserEmail(l[colEmail] ?? '')
      const code = (l[colCode] ?? '').trim()
      const nom = colNom ? (l[colNom] ?? '').trim() : ''
      if (!email || !email.includes('@') || !code || !nom) continue
      lignesValides.push(l)
    }

    const nbDoublonsIntraFichier = lignesDoublon.size

    // Recherche des contacts existants en base (par email + code_client)
    const paires = lignesValides.map(l => ({
      email: normaliserEmail(l[colEmail] ?? ''),
      code_client: (l[colCode] ?? '').trim(),
    }))

    const emailsUniques = [...new Set(paires.map(p => p.email))]
    const existantsMap = new Map<string, string>() // "email|code" → id

    for (let i = 0; i < emailsUniques.length; i += 500) {
      const { data } = await supabase
        .from('contacts_client')
        .select('id, email, code_client')
        .in('email', emailsUniques.slice(i, i + 500))
      const rows = data as unknown as RowContact[] | null
      rows?.forEach(r => existantsMap.set(`${normaliserEmail(r.email)}|${r.code_client}`, r.id))
    }

    const lignesAInserer = lignesValides.map(l => appliquerMapping(l, mapping))
    const aSupprimer = colDelete
      ? lignesValides.filter(l => (l[colDelete] ?? '').trim().toLowerCase() === 'delete')
      : []
    const aNouveaux = lignesValides.filter(l => {
      const cle = `${normaliserEmail(l[colEmail] ?? '')}|${(l[colCode] ?? '').trim()}`
      return !existantsMap.has(cle) && !(colDelete && (l[colDelete] ?? '').toLowerCase() === 'delete')
    })
    const aMettreAJour = lignesValides.filter(l => {
      const cle = `${normaliserEmail(l[colEmail] ?? '')}|${(l[colCode] ?? '').trim()}`
      return existantsMap.has(cle) && !(colDelete && (l[colDelete] ?? '').toLowerCase() === 'delete')
    })

    // Aperçu sur les 10 premières lignes brutes (valides ET invalides) pour que l'utilisateur
    // voie exactement ce qui se passe ligne par ligne, avec la raison si erreur de format.
    const apercu = lignes.slice(0, 10).map((l, idx) => {
      const email = normaliserEmail(l[colEmail] ?? '')
      const code = (l[colCode] ?? '').trim()
      const nom = colNom ? (l[colNom] ?? '').trim() : ''

      if (!email || !email.includes('@'))
        return { donnees: l, statut: 'invalide' as const, cle_pivot: email || '—', message: 'email invalide ou manquant' }
      if (!code)
        return { donnees: l, statut: 'invalide' as const, cle_pivot: email, message: 'code client manquant' }
      if (!nom)
        return { donnees: l, statut: 'invalide' as const, cle_pivot: email, message: 'nom manquant' }
      if (lignesDoublon.has(idx))
        return { donnees: l, statut: 'doublon' as const, cle_pivot: email }

      const cle = `${email}|${code}`
      const estSuppression = colDelete && (l[colDelete] ?? '').toLowerCase() === 'delete'
      if (estSuppression)
        return { donnees: l, statut: 'modification' as const, cle_pivot: email, message: 'sera désactivé' }
      if (existantsMap.has(cle))
        return { donnees: l, statut: 'modification' as const, cle_pivot: email }
      return { donnees: l, statut: 'nouveau' as const, cle_pivot: email }
    })

    return {
      lignes_a_inserer: lignesAInserer,
      apercu,
      nb_total: lignesValides.length,
      nb_nouvelles: aNouveaux.length,
      nb_doublons: aMettreAJour.length,
      nb_invalides: lignesErreur.length + nbDoublonsIntraFichier + aSupprimer.length,
      hash,
      nom_fichier: fichier.name,
    }
  }

  async function executerImport(resultat: ResultatValidation): Promise<ResultatImport> {
    setChargement(true)
    try {
      const { data: d2, error: errImport } = await supabase
        .from('imports')
        .insert({
          type: 'import_contacts' as const,
          nom_fichier: resultat.nom_fichier,
          hash_fichier: resultat.hash,
          nb_lignes_total: resultat.nb_total,
          nb_lignes_inserees: resultat.nb_nouvelles + resultat.nb_doublons,
          nb_lignes_doublons: 0,
          cree_par: utilisateur?.id ?? null,
        } as never)
        .select('id')
        .single()
      if (errImport) throw errImport
      const importRec = d2 as unknown as RowImportId | null
      if (!importRec) throw new Error('Enregistrement d\'import non créé.')

      try {
        // Séparer les lignes à supprimer (actif = false) des lignes à upsert
        const aSupprimer = resultat.lignes_a_inserer.filter(
          l => String(l['delete'] ?? '').toLowerCase() === 'delete'
        )
        const aUpsert = resultat.lignes_a_inserer.filter(
          l => String(l['delete'] ?? '').toLowerCase() !== 'delete'
        )

        // Désactiver les contacts marqués delete
        for (const l of aSupprimer) {
          if (!l['email'] || !l['code_client']) continue
          await supabase
            .from('contacts_client')
            .update({ actif: false } as never)
            .eq('email', String(l['email']).toLowerCase())
            .eq('code_client', String(l['code_client']))
        }

        // Upsert par lots de 500 (ON CONFLICT sur email+code_client)
        for (let i = 0; i < aUpsert.length; i += 500) {
          const lot = aUpsert.slice(i, i + 500).map(row => {
            const r = { ...row } as Record<string, unknown>
            // Normaliser email, retirer champ delete
            if (r['email']) r['email'] = String(r['email']).toLowerCase().trim()
            delete r['delete']
            delete r['id_contact']
            // Valeur par défaut role_contact
            if (!r['role_contact']) r['role_contact'] = 'autre'
            return r
          })
          const { error } = await supabase
            .from('contacts_client')
            .upsert(lot as never, { onConflict: 'email,code_client', ignoreDuplicates: false })
          if (error) throw error
        }
      } catch (err) {
        await supabase.from('imports').delete().eq('id', importRec.id)
        throw err
      }

      return { import_id: importRec.id, nb_inserees: resultat.nb_nouvelles + resultat.nb_doublons }
    } finally {
      setChargement(false)
    }
  }

  return { analyserFichier, preparerImport, executerImport, chargement }
}
