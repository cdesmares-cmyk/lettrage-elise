// Logique de recherche et suggestions intelligentes pour le navigateur de factures
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { TOLERANCE_CENT } from '../lib/constantes'
import type { LigneBancaireAvecStatut } from '../types/lettrage'

export interface FactureNavigateur {
  numero_piece: string
  code_client: string
  nom_client: string | null
  montant_ttc: number
  reste_du: number
  date_echeance: string | null
}

export type SourceSuggestion = 'numero_detecte' | 'client_reconnu' | 'client_approx' | 'client_nom' | 'historique'

export interface SuggestionNavigateur {
  facture: FactureNavigateur
  source: SourceSuggestion
  confiance: 1 | 2 | 3
}

export interface DistributionSuggérée {
  factures: FactureNavigateur[]
  montantTotal: number
  exact: boolean    // true = match au centime, false = approx ±1%
  confiance: 2 | 3
}

const COLS = 'numero_piece, code_client, nom_client, montant_ttc, reste_du, date_echeance'

// ── Correspondance approximative des libellés bancaires ────────────────────

const STOPWORDS = new Set([
  'VIR', 'VIREMENT', 'SEPA', 'INST', 'CREDIT', 'PRLV', 'PRELEVEMENT',
  'CHQ', 'CHEQUE', 'REMISE', 'CARTE', 'CB', 'TIP', 'REJET', 'RETOUR',
  'DE', 'DU', 'LE', 'LA', 'LES', 'ET', 'EN', 'AU', 'AUX', 'SUR', 'PAR', 'POUR',
])

// Formes juridiques et qualificatifs génériques — jamais des identifiants primaires
const FORMES_JURIDIQUES = new Set([
  'SAS', 'SARL', 'SASU', 'EURL', 'SNC', 'SCOP', 'SCIC', 'GIE', 'COOP',
  'GROUP', 'GROUPE', 'HOLDING',
])

export function normaliserLibelle(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\bSTE\b/g, 'SAINTE')
    .replace(/\bST\b/g, 'SAINT')
    .replace(/\bCIE\b/g, 'COMPAGNIE')
    .replace(/\bETS\b/g, 'ETABLISSEMENTS')
    .replace(/\bGRP\b/g, 'GROUPE')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokeniserLibelle(s: string): string[] {
  return normaliserLibelle(s)
    .split(' ')
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

// Tokens ordonnés par position de lecture, formes juridiques retirées.
// Ancre = premier token (identifiant principal), géographie en fin → poids faible.
export function extraireTokensClient(libelle: string): string[] {
  return normaliserLibelle(libelle)
    .split(' ')
    .filter(t => t.length >= 3 && !STOPWORDS.has(t) && !FORMES_JURIDIQUES.has(t))
}

// Couches 2-4 : qualification progressive → Jaccard → poids position.
// Retourne le code_client gagnant parmi les candidats fournis.
export function sélectionnerClient(
  candidats: Array<{ code: string; nom: string }>,
  tokens: string[],
): string | null {
  if (!candidats.length || !tokens.length) return null

  // Couche 2 : qualification progressive (ordre de lecture)
  let actifs = candidats.filter(c => c.nom.includes(tokens[0]))
  if (!actifs.length) return null
  if (actifs.length === 1) return actifs[0].code

  for (let i = 1; i < tokens.length; i++) {
    const affines = actifs.filter(c => c.nom.includes(tokens[i]))
    if (affines.length === 1) return affines[0].code
    if (affines.length === 0) break
    actifs = affines
  }
  if (actifs.length === 1) return actifs[0].code

  // Couche 3 : Jaccard sur les tokens normalisés
  const tokensLib = new Set(tokens)
  let maxJaccard = 0
  let winnerJaccard: string | null = null
  for (const { code, nom } of actifs) {
    const nomToks = new Set(nom.split(' ').filter(t => t.length >= 3 && !STOPWORDS.has(t) && !FORMES_JURIDIQUES.has(t)))
    if (!nomToks.size) continue
    const inter = [...nomToks].filter(t => tokensLib.has(t)).length
    const union = new Set([...nomToks, ...tokensLib]).size
    const score = union > 0 ? inter / union : 0
    if (score > maxJaccard) { maxJaccard = score; winnerJaccard = code }
  }
  if (winnerJaccard && maxJaccard >= 0.3) return winnerJaccard

  // Couche 4 : poids position (tiebreaker)
  const POIDS = [4, 2, 1, 0.5]
  let maxPoids = -1
  let winnerPoids: string | null = null
  for (const { code, nom } of actifs) {
    const score = tokens.reduce((acc, tok, idx) =>
      nom.includes(tok) ? acc + (POIDS[idx] ?? 0.5) : acc, 0)
    if (score > maxPoids) { maxPoids = score; winnerPoids = code }
  }
  return winnerPoids
}

function similariteLibelle(a: string, b: string): number {
  const tokA = new Set(tokeniserLibelle(a))
  const tokB = new Set(tokeniserLibelle(b))
  if (!tokA.size || !tokB.size) return 0
  const intersection = [...tokA].filter(t => tokB.has(t)).length
  const union = new Set([...tokA, ...tokB]).size
  return union === 0 ? 0 : intersection / union
}

// Convertit un exemple de numéro de facture en RegExp stricte.
// Ex: "FAC-2026-001234" → /FAC\-\d{4}\-\d{6}/gi
export function exempleVersRegex(exemple: string): RegExp | null {
  const trimmed = exemple.trim()
  if (!trimmed) return null
  const segments = trimmed.match(/(\d+)|([^\d]+)/g) ?? []
  const pattern = segments.map(seg =>
    /^\d+$/.test(seg)
      ? `\\d{${seg.length}}`
      : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('')
  try { return new RegExp(pattern, 'gi') } catch { return null }
}

// Dérive une RegExp de fallback depuis les exemples configurés par l'opérateur.
// Pour "2026051470" (10 chiffres) → /\b\d{8,10}\b/ (tolère 2 chiffres en moins).
// Permet de détecter "26051470" dans le libellé → ilike.%26051470% trouve "2026051470".
export function fallbackNumerique(exemples: string[]): RegExp | null {
  const longueurs: number[] = []
  for (const ex of exemples) {
    const matches = ex.match(/\d+/g)
    if (matches) longueurs.push(...matches.map(m => m.length))
  }
  if (!longueurs.length) return null
  const max = Math.max(...longueurs)
  const min = Math.max(4, max - 2)
  try { return new RegExp(`\\b\\d{${min},${max}}\\b`, 'g') } catch { return null }
}

// Applique les patterns sur libellé + detail + infos_complementaires.
// Retourne tous les matches distincts (multi-numéros dans la même ligne).
export function extraireNumerosTexte(
  libelle: string | null,
  detail: string | null,
  infosComp: string | null,
  patterns: RegExp[],
): string[] {
  const texte = [libelle, detail, infosComp].filter(Boolean).join(' ')
  if (!texte) return []
  const resultats = new Set<string>()
  for (const re of patterns) {
    const matches = texte.matchAll(new RegExp(re.source, re.flags))
    for (const m of matches) resultats.add(m[0])
  }
  return [...resultats]
}

// ── Subset sum borné — cherche 1, 2, 3 ou 4 factures dont la somme = cible ──

export function trouverDistribution(
  factures: FactureNavigateur[],
  cible: number,
): DistributionSuggérée | null {
  if (!factures.length || cible < 0.01) return null
  const arr = (n: number) => Math.round(n * 100) / 100
  const c = arr(cible)

  // 1 facture exacte
  for (const f of factures) {
    if (Math.abs(arr(f.reste_du) - c) <= TOLERANCE_CENT)
      return { factures: [f], montantTotal: arr(f.reste_du), exact: true, confiance: 3 }
  }

  // 2 factures exactes
  for (let i = 0; i < factures.length - 1; i++) {
    for (let j = i + 1; j < factures.length; j++) {
      const s = arr(factures[i].reste_du + factures[j].reste_du)
      if (Math.abs(s - c) <= TOLERANCE_CENT)
        return { factures: [factures[i], factures[j]], montantTotal: s, exact: true, confiance: 3 }
    }
  }

  // 3 factures exactes
  for (let i = 0; i < factures.length - 2; i++) {
    for (let j = i + 1; j < factures.length - 1; j++) {
      for (let k = j + 1; k < factures.length; k++) {
        const s = arr(factures[i].reste_du + factures[j].reste_du + factures[k].reste_du)
        if (Math.abs(s - c) <= TOLERANCE_CENT)
          return { factures: [factures[i], factures[j], factures[k]], montantTotal: s, exact: true, confiance: 3 }
      }
    }
  }

  // 4 factures exactes (garde K ≤ 25 pour éviter O(n⁴) sur grands portefeuilles)
  if (factures.length <= 25) {
    for (let i = 0; i < factures.length - 3; i++) {
      for (let j = i + 1; j < factures.length - 2; j++) {
        for (let k = j + 1; k < factures.length - 1; k++) {
          for (let l = k + 1; l < factures.length; l++) {
            const s = arr(factures[i].reste_du + factures[j].reste_du + factures[k].reste_du + factures[l].reste_du)
            if (Math.abs(s - c) <= TOLERANCE_CENT)
              return { factures: [factures[i], factures[j], factures[k], factures[l]], montantTotal: s, exact: true, confiance: 3 }
          }
        }
      }
    }
  }

  // 1 facture approx (±1%)
  const proche = factures
    .map(f => ({ f, ecart: Math.abs(arr(f.reste_du) - c) }))
    .filter(x => x.ecart / c <= 0.01)
    .sort((a, b) => a.ecart - b.ecart)[0]
  if (proche)
    return { factures: [proche.f], montantTotal: arr(proche.f.reste_du), exact: false, confiance: 2 }

  return null
}

// Détection silencieuse utilisable hors navigateur (ex: PanneauLettrage).
// Retourne une distribution confiance 3/3 uniquement — les cas approx restent dans la modale.
export async function detecterAutoSilencieux(
  ligne: LigneBancaireAvecStatut,
  formats: string[],
): Promise<{ distrib: DistributionSuggérée; factures: FactureNavigateur[] } | null> {
  try {
    const patterns = formats.map(exempleVersRegex).filter((r): r is RegExp => r !== null)
    const fallback = fallbackNumerique(formats)
    const allPatterns = fallback ? [...patterns, fallback] : patterns
    const numerosDetectes = extraireNumerosTexte(
      ligne.libelle, ligne.detail, ligne.infos_complementaires, allPatterns
    )
    const cible = ligne.restant
    const [facturesNum, sepaMatch, facturesNom] = await Promise.all([
      fetchParNums(numerosDetectes),
      fetchSepaMatch(ligne.libelle),
      fetchParNomClient(ligne.libelle),
    ])
    // Priorité 1 : N° détecté dans le libellé
    if (facturesNum.length) {
      const d = trouverDistribution(facturesNum, cible)
      if (d?.confiance === 3) return { distrib: d, factures: d.factures }
    }
    // Priorité 2 : client reconnu via SEPA (exact uniquement — fuzzy → confiance ≤ 2)
    if (sepaMatch?.factures.length && !sepaMatch.fuzzy) {
      const d = trouverDistribution(sepaMatch.factures, cible)
      if (d?.confiance === 3) return { distrib: d, factures: d.factures }
    }
    // Priorité 3 : nom client détecté dans le libellé
    if (facturesNom?.length) {
      const d = trouverDistribution(facturesNom, cible)
      if (d?.confiance === 3) return { distrib: d, factures: d.factures }
    }
    return null
  } catch {
    return null
  }
}

async function fetchParNums(nums: string[]): Promise<FactureNavigateur[]> {
  if (!nums.length) return []
  try {
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select(COLS)
      .or(nums.map(n => `numero_piece.ilike.%${n}%`).join(','))
      .gt('reste_du', TOLERANCE_CENT)
      .eq('est_avoir', false)
      .limit(10)
    return (data as FactureNavigateur[]) ?? []
  } catch { return [] }
}

async function fetchSepaMatch(libelle: string): Promise<{ factures: FactureNavigateur[]; nbUtil: number; fuzzy: boolean } | null> {
  try {
    // ── Match exact ────────────────────────────────────────────────────────
    const { data: sepaExact } = await supabase
      .from('libelles_sepa')
      .select('code_client, nb_utilisations')
      .eq('libelle', libelle)
      .maybeSingle()

    if (sepaExact) {
      const r = sepaExact as { code_client: string; nb_utilisations: number }
      const { data } = await supabase
        .from('v_factures_avec_reste_du')
        .select(COLS)
        .eq('code_client', r.code_client)
        .gt('reste_du', TOLERANCE_CENT)
        .eq('est_avoir', false)
        .order('date_echeance', { ascending: true })
        .limit(10)
      return { factures: (data as FactureNavigateur[]) ?? [], nbUtil: r.nb_utilisations, fuzzy: false }
    }

    // ── Match approximatif (fallback) ──────────────────────────────────────
    const tokens = tokeniserLibelle(libelle)
    if (!tokens.length) return null

    // Token le plus long = le plus distinctif (ex: "BMVIROLLE" plutôt que "VIR")
    const tokenPrincipal = [...tokens].sort((a, b) => b.length - a.length)[0]
    const { data: candidats } = await supabase
      .from('libelles_sepa')
      .select('libelle, code_client, nb_utilisations')
      .ilike('libelle', `%${tokenPrincipal}%`)
      .limit(20)

    if (!candidats?.length) return null

    type RowSepa = { libelle: string; code_client: string; nb_utilisations: number }
    const meilleur = (candidats as RowSepa[])
      .map(c => ({ ...c, score: similariteLibelle(libelle, c.libelle) }))
      .filter(c => c.score >= 0.6)
      .sort((a, b) => b.score - a.score)[0]

    if (!meilleur) return null

    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select(COLS)
      .eq('code_client', meilleur.code_client)
      .gt('reste_du', TOLERANCE_CENT)
      .eq('est_avoir', false)
      .order('date_echeance', { ascending: true })
      .limit(10)

    return { factures: (data as FactureNavigateur[]) ?? [], nbUtil: meilleur.nb_utilisations, fuzzy: true }
  } catch { return null }
}

// Recherche directe du nom client dans le libellé bancaire.
// Étape 1 : découverte des clients via l'ancre (pos-0 token, ordre de lecture).
// Étape 2 : factures du client gagnant via couches 2-4 client-side.
async function fetchParNomClient(libelle: string): Promise<FactureNavigateur[] | null> {
  const tokens = extraireTokensClient(libelle)
  if (!tokens.length) return null
  try {
    const { data: discovery } = await supabase
      .from('v_factures_avec_reste_du')
      .select('code_client, nom_client')
      .ilike('nom_client', `%${tokens[0]}%`)
      .gt('reste_du', TOLERANCE_CENT)
      .eq('est_avoir', false)
      .limit(50)
    if (!discovery?.length) return null

    const nomMap = new Map<string, string>()
    for (const r of discovery as { code_client: string; nom_client: string | null }[]) {
      if (!nomMap.has(r.code_client)) nomMap.set(r.code_client, normaliserLibelle(r.nom_client ?? ''))
    }
    const winnerCode = sélectionnerClient(
      [...nomMap.entries()].map(([code, nom]) => ({ code, nom })),
      tokens,
    )
    if (!winnerCode) return null

    const { data: factures } = await supabase
      .from('v_factures_avec_reste_du')
      .select(COLS)
      .eq('code_client', winnerCode)
      .gt('reste_du', TOLERANCE_CENT)
      .eq('est_avoir', false)
      .order('date_echeance', { ascending: true })
      .limit(20)
    return (factures as FactureNavigateur[]) ?? null
  } catch { return null }
}

async function fetchHistorique(ligne: LigneBancaireAvecStatut): Promise<FactureNavigateur[]> {
  try {
    const { data: lignesPareilRaw } = await supabase
      .from('lignes_bancaires')
      .select('id_operation')
      .eq('libelle', ligne.libelle)
      .neq('id_operation', ligne.id_operation)
      .limit(20)
    const lignesPareil = (lignesPareilRaw as { id_operation: string }[] | null)
    if (!lignesPareil?.length) return []

    const { data: lettragesRaw } = await supabase
      .from('lettrages')
      .select('numero_facture')
      .in('id_ligne_bancaire', lignesPareil.map(l => l.id_operation))
      .not('numero_facture', 'is', null)
      .eq('annule', false)
      .limit(15)
    const lettrages = lettragesRaw as unknown as { numero_facture: string }[] | null
    if (!lettrages?.length) return []

    const numsFact = [...new Set(lettrages.map(l => l.numero_facture).filter(Boolean))]
    if (!numsFact.length) return []

    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select(COLS)
      .in('numero_piece', numsFact)
      .gt('reste_du', TOLERANCE_CENT)
      .eq('est_avoir', false)
    return (data as FactureNavigateur[]) ?? []
  } catch { return [] }
}

export function useNavigateurFactures(
  ligneActive: LigneBancaireAvecStatut | null,
  ouvert: boolean,
  codeClient?: string,
) {
  const [query, setQueryRaw] = useState('')
  const [resultats, setResultats] = useState<FactureNavigateur[]>([])
  const [suggestions, setSuggestions] = useState<SuggestionNavigateur[]>([])
  const [chargement, setChargement] = useState(false)
  const [chargementSugg, setChargementSugg] = useState(false)
  const [selection, setSelection] = useState<Map<string, FactureNavigateur>>(new Map())
  const [distributionSuggérée, setDistributionSuggérée] = useState<DistributionSuggérée | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formatsRef = useRef<string[]>([])

  // Charge les formats de numéros de facture configurés par l'admin (une seule fois)
  useEffect(() => {
    supabase
      .from('ref_valeurs')
      .select('valeur')
      .eq('categorie', 'format_facture')
      .eq('actif', true)
      .then(({ data }) => {
        formatsRef.current = (data as { valeur: string }[] ?? []).map(r => r.valeur)
      })
  }, [])

  useEffect(() => {
    if (!ouvert) {
      setQueryRaw('')
      setResultats([])
      setSuggestions([])
      setSelection(new Map())
      setDistributionSuggérée(null)
      return
    }
    if (ligneActive) computeSuggestions(ligneActive)
    else if (codeClient) computeSuggestionsClient(codeClient)
  }, [ouvert, ligneActive?.id_operation, codeClient])

  async function computeSuggestions(ligne: LigneBancaireAvecStatut) {
    setChargementSugg(true)
    try {
      const patterns = formatsRef.current
        .map(exempleVersRegex)
        .filter((r): r is RegExp => r !== null)

      // Fallback adaptatif : plage dérivée des exemples configurés (ex: \d{8,10} pour un format \d{10})
      const fallback = fallbackNumerique(formatsRef.current)
      const allPatterns = fallback ? [...patterns, fallback] : patterns

      const numerosDetectes = extraireNumerosTexte(
        ligne.libelle, ligne.detail, ligne.infos_complementaires, allPatterns
      )

      const [facturesNum, sepaMatch, facturesHisto, facturesNom] = await Promise.all([
        fetchParNums(numerosDetectes),
        fetchSepaMatch(ligne.libelle),
        fetchHistorique(ligne),
        fetchParNomClient(ligne.libelle),
      ])

      const found = new Map<string, SuggestionNavigateur>()

      // Priorité croissante : historique < client_nom < client_reconnu < numero_detecte
      facturesHisto.forEach(f =>
        found.set(f.numero_piece, { facture: f, source: 'historique', confiance: 1 })
      )
      facturesNom?.forEach(f => {
        if (!found.has(f.numero_piece) || found.get(f.numero_piece)!.confiance < 2)
          found.set(f.numero_piece, { facture: f, source: 'client_nom', confiance: 2 })
      })
      if (sepaMatch) {
        const confBase: 1 | 2 | 3 = sepaMatch.nbUtil >= 3 ? 3 : sepaMatch.nbUtil >= 2 ? 2 : 1
        // Match fuzzy : confiance plafonnée à 2, source distincte pour le badge
        const conf: 1 | 2 | 3 = sepaMatch.fuzzy ? Math.min(confBase, 2) as 1 | 2 : confBase
        const source: SourceSuggestion = sepaMatch.fuzzy ? 'client_approx' : 'client_reconnu'
        sepaMatch.factures.forEach(f =>
          found.set(f.numero_piece, { facture: f, source, confiance: conf })
        )
      }
      facturesNum.forEach(f =>
        found.set(f.numero_piece, { facture: f, source: 'numero_detecte', confiance: 3 })
      )

      setSuggestions([...found.values()].sort((a, b) => b.confiance - a.confiance))

      // ── Distribution automatique ─────────────────────────────────────────
      const cible = ligne.restant
      // Priorité 1 : factures identifiées par numéro dans le libellé
      let distrib = facturesNum.length ? trouverDistribution(facturesNum, cible) : null
      // Priorité 2 : factures du client reconnu via SEPA
      if (!distrib && sepaMatch?.factures.length) distrib = trouverDistribution(sepaMatch.factures, cible)

      setDistributionSuggérée(distrib)
      if (distrib) setSelection(new Map(distrib.factures.map(f => [f.numero_piece, f])))
    } finally {
      setChargementSugg(false)
    }
  }

  async function computeSuggestionsClient(code: string) {
    setChargementSugg(true)
    try {
      const { data } = await supabase
        .from('v_factures_avec_reste_du')
        .select(COLS)
        .eq('code_client', code)
        .gt('reste_du', TOLERANCE_CENT)
        .eq('est_avoir', false)
        .order('date_echeance', { ascending: true })
        .limit(20)
      const factures = (data as FactureNavigateur[]) ?? []
      setSuggestions(factures.map(f => ({ facture: f, source: 'client_reconnu' as SourceSuggestion, confiance: 3 as const })))
    } finally {
      setChargementSugg(false)
    }
  }

  function setQuery(q: string) {
    setQueryRaw(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) {
      setResultats([])
      setChargement(false)
      return
    }
    setChargement(true)
    debounceRef.current = setTimeout(() => rechercherFactures(q), 300)
  }

  async function rechercherFactures(q: string) {
    try {
      const { data } = await supabase
        .from('v_factures_avec_reste_du')
        .select(COLS)
        .or(`numero_piece.ilike.%${q}%,code_client.ilike.%${q}%,nom_client.ilike.%${q}%`)
        .gt('reste_du', TOLERANCE_CENT)
        .eq('est_avoir', false)
        .order('date_echeance', { ascending: true })
        .limit(50)
      setResultats((data as FactureNavigateur[]) ?? [])
    } catch {
      setResultats([])
    } finally {
      setChargement(false)
    }
  }

  function toggleSelection(facture: FactureNavigateur) {
    setSelection(prev => {
      const next = new Map(prev)
      if (next.has(facture.numero_piece)) {
        next.delete(facture.numero_piece)
      } else {
        next.set(facture.numero_piece, facture)
      }
      return next
    })
  }

  function reset() {
    setQueryRaw('')
    setResultats([])
    setSuggestions([])
    setSelection(new Map())
  }

  const selectionArray = [...selection.values()]
  const totalSelection = selectionArray.reduce((s, f) => s + f.reste_du, 0)

  return {
    query, setQuery,
    resultats, suggestions,
    chargement, chargementSugg,
    selection, toggleSelection, reset,
    selectionArray, totalSelection,
    distributionSuggérée,
  }
}
