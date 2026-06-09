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

// Convertit un serial Excel (nombre de jours depuis 1900-01-00) en ISO YYYY-MM-DD
function serialExcelVersIso(n: number): string | null {
  // Plage raisonnable : ~1950 à ~2060 (serial 18264 à 58849)
  if (n < 18000 || n > 60000) return null
  const d = new Date(Math.round((n - 25569) * 86400 * 1000))
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

// Convertit une valeur brute en date ISO YYYY-MM-DD
// Formats supportés : Date JS, serial Excel (nombre ou string entier), DD/MM/YYYY,
// DD/MM/YY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD, timestamp YYYY-MM-DD HH:mm:ss
export function parseDate(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().split('T')[0]

  if (typeof v === 'number') return serialExcelVersIso(Math.round(v))

  const s = String(v ?? '').trim()
  if (!s) return null

  // Serial Excel passé comme string depuis un CSV (ex: "45366")
  if (/^\d{4,6}$/.test(s)) {
    const res = serialExcelVersIso(parseInt(s, 10))
    if (res) return res
  }

  // DD/MM/YYYY ou DD-MM-YYYY
  const fr4 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (fr4) return `${fr4[3]}-${fr4[2].padStart(2, '0')}-${fr4[1].padStart(2, '0')}`

  // DD/MM/YY (année sur 2 chiffres → 2000+)
  const fr2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/)
  if (fr2) return `20${fr2[3]}-${fr2[2].padStart(2, '0')}-${fr2[1].padStart(2, '0')}`

  // YYYY-MM-DD ou YYYY/MM/DD (avec ou sans heure)
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(s)) return s.slice(0, 10).replace(/\//g, '-')

  return null
}

// Convertit une valeur brute en nombre — gère tous les formats FR et EN
// FR : 1 250,22 / 1.250,22 / 15,22 / -15,22
// EN : 1,250.22 / 1250.22 / 15.22
export function parseNombre(v: unknown): number | null {
  if (typeof v === 'number') return isNaN(v) ? null : v

  // Supprime symboles monétaires, espaces insécables, espaces
  let s = String(v ?? '').trim().replace(/[€$£ \s]/g, '')
  if (!s) return null

  const hasComma = s.includes(',')
  const hasDot   = s.includes('.')

  if (hasComma && hasDot) {
    // Les deux séparateurs présents : le dernier est le décimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // Format FR : 1.250,22 → supprimer les points, remplacer la virgule
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // Format EN : 1,250.22 → supprimer les virgules
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    // Virgule seule : décimal si ≤ 2 chiffres après (15,22), milliers sinon (1,250)
    const apres = s.split(',')[1] ?? ''
    s = apres.length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (hasDot) {
    // Point seul : si plusieurs points → séparateurs de milliers (1.250.000)
    if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '')
    // Sinon décimal standard → ne rien faire
  }

  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? null : n
}

// Convertit une valeur brute en booléen (pour le champ est_avoir)
export function parseBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  return ['avoir', 'a', 'oui', 'yes', '1', 'true', 'x', 'vrai'].includes(
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
