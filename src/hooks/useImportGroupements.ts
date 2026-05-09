// Hook d'import groupements — mise à jour en masse de code_groupement sur la table clients
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculerHash, detecterMapping, parserCSV, parserXLSX } from '../lib/parseursImport'
import { CHAMPS_GROUPEMENTS } from '../lib/champsImport'
import type { LigneMapping, ResultatAnalyse, ResultatValidation, ResultatImport } from '../types/import'

interface RowClientCode { code_dso: string }

async function parserFichier(fichier: File) {
  const ext = fichier.name.split('.').pop()?.toLowerCase()
  return ext === 'csv' ? parserCSV(fichier) : parserXLSX(fichier).then(r => ({
    colonnes: r.colonnes,
    lignes: r.lignes.map(l =>
      Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v ?? '')])),
    ) as Record<string, string>[],
  }))
}

export function useImportGroupements() {
  const [chargement, setChargement] = useState(false)

  async function analyserFichier(fichier: File): Promise<ResultatAnalyse> {
    const [hash, { colonnes, lignes }] = await Promise.all([
      calculerHash(fichier),
      parserFichier(fichier),
    ])
    const mapping = detecterMapping(colonnes, CHAMPS_GROUPEMENTS).map((m, i) => ({
      ...m,
      exemple: String(lignes[0]?.[colonnes[i]] ?? ''),
    }))
    return { colonnes, apercu: lignes.slice(0, 5), mapping, hash }
  }

  async function preparerImport(
    fichier: File,
    mapping: LigneMapping[],
    hash: string
  ): Promise<ResultatValidation> {
    const { lignes } = await parserFichier(fichier)
    const colCode = mapping.find(m => m.champ_cible === 'code_client')?.colonne_source
    const colGroupement = mapping.find(m => m.champ_cible === 'code_groupement')?.colonne_source
    if (!colCode) throw new Error('La colonne Code client (pivot) doit être mappée.')
    if (!colGroupement) throw new Error('La colonne Code groupement doit être mappée.')

    const tousLesCodes = [...new Set(lignes.map(l => (l[colCode] ?? '').trim()).filter(Boolean))]
    const codesExistants = new Set<string>()
    for (let i = 0; i < tousLesCodes.length; i += 500) {
      const { data } = await supabase
        .from('clients')
        .select('code_dso')
        .in('code_dso', tousLesCodes.slice(i, i + 500))
      const rows = data as unknown as RowClientCode[] | null
      rows?.forEach(r => codesExistants.add(r.code_dso))
    }

    const valides = lignes.filter(l => codesExistants.has((l[colCode] ?? '').trim()))
    const invalides = lignes.filter(l => !codesExistants.has((l[colCode] ?? '').trim()))

    const lignes_a_inserer = valides.map(l => ({
      code_client: (l[colCode] ?? '').trim(),
      code_groupement: (l[colGroupement] ?? '').trim() || null,
    }))

    return {
      lignes_a_inserer,
      apercu: lignes.slice(0, 10).map(l => {
        const code = (l[colCode] ?? '').trim()
        return {
          donnees: l,
          statut: codesExistants.has(code) ? 'nouveau' : 'invalide',
          cle_pivot: code,
        }
      }),
      nb_total: lignes.length,
      nb_nouvelles: valides.length,
      nb_doublons: 0,
      nb_invalides: invalides.length,
      hash,
      nom_fichier: fichier.name,
    }
  }

  async function executerImport(resultat: ResultatValidation): Promise<ResultatImport> {
    setChargement(true)
    try {
      const CHUNK = 50
      for (let i = 0; i < resultat.lignes_a_inserer.length; i += CHUNK) {
        const lot = resultat.lignes_a_inserer.slice(i, i + CHUNK)
        await Promise.all(lot.map(l =>
          supabase
            .from('clients')
            .update({ code_groupement: l.code_groupement as string | null } as never)
            .eq('code_dso', l.code_client as string)
        ))
      }
      return { import_id: 'groupements', nb_inserees: resultat.nb_nouvelles }
    } finally {
      setChargement(false)
    }
  }

  return { analyserFichier, preparerImport, executerImport, chargement }
}
