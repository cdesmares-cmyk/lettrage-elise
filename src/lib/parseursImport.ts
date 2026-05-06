// Utilitaires purs de parsing — sans dépendance React ni Supabase
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { ChampCible, LigneMapping } from '../types/import'

// Hash SHA-256 du contenu du fichier pour la détection de doublons au niveau fichier
export async function calculerHash(fichier: File): Promise<string> {
  const buffer = await fichier.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Normalise une chaîne : minuscules, sans accents, sans caractères spéciaux
export function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Détecte automatiquement la correspondance colonnes fichier → champs cibles
export function detecterMapping(colonnes: string[], champs: ChampCible[]): LigneMapping[] {
  return colonnes.map(col => {
    const colNorm = normaliser(col)
    const champ = champs.find(c =>
      c.aliases.some(a => {
        const aNorm = normaliser(a)
        return aNorm === colNorm || colNorm.includes(aNorm) || aNorm.includes(colNorm)
      })
    )
    return { colonne_source: col, champ_cible: champ?.cle ?? null, exemple: '', auto: !!champ }
  })
}

// Convertit une valeur brute en date ISO YYYY-MM-DD
export function parseDate(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().split('T')[0]
  if (typeof v === 'number') {
    // Numéro de série Excel (jours depuis 1900-01-00)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
  }
  const s = String(v ?? '').trim()
  // Format français DD/MM/YYYY
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`
  // Format ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

// Convertit une valeur brute en nombre (gère les formats français et anglais)
export function parseNombre(v: unknown): number | null {
  if (typeof v === 'number') return isNaN(v) ? null : v
  const s = String(v ?? '')
    .replace(/\s/g, '')
    .replace(/,(\d{2})$/, '.$1')  // virgule décimale française
    .replace(/[^0-9.\-]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// Convertit une valeur brute en booléen (pour le champ est_avoir)
export function parseBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  return ['avoir', 'oui', 'yes', '1', 'true', 'x', 'vrai'].includes(
    String(v ?? '').toLowerCase().trim()
  )
}

// Parse un fichier CSV — retourne toutes les lignes et les colonnes
export function parserCSV(fichier: File): Promise<{ colonnes: string[], lignes: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(fichier, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve({
        colonnes: result.meta.fields ?? [],
        lignes: result.data,
      }),
      error: (err) => reject(new Error(err.message)),
    })
  })
}

// Parse un fichier XLSX — retourne toutes les lignes de la première feuille
export async function parserXLSX(fichier: File): Promise<{ colonnes: string[], lignes: Record<string, unknown>[] }> {
  const buffer = await fichier.arrayBuffer()
  const classeur = XLSX.read(buffer, { type: 'array', cellDates: true })
  const feuille = classeur.Sheets[classeur.SheetNames[0]]
  const brut = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: null })
  // Nettoyer les espaces dans les noms de colonnes
  const lignes = brut.map(l =>
    Object.fromEntries(Object.entries(l).map(([k, v]) => [k.trim(), v]))
  )
  const colonnes = lignes.length > 0 ? Object.keys(lignes[0]) : []
  return { colonnes, lignes }
}
