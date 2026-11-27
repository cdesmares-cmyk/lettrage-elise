// Export Lettrage multi-onglets via SheetJS — 3 feuilles : Affectation + Lignes bancaires + Cadrage
// Date de référence : date_operation pour les lettrages initiaux (mode='manuel' etc.),
// date_lettrage pour les corrections et dispatches (date réelle de l'opération de dispatch).
import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { fetchAll, fetchAllParLots } from './pagination'
import { estCompte471, LIBELLE_471 } from './comptes471'

interface RowLettrage {
  id: string
  id_ligne_bancaire: string
  code_client: string
  numero_facture: string | null
  montant: number
  commentaire: string | null
  operateur: string | null
  mode: string
  date_lettrage: string
}

interface RowCompensation {
  date_lettrage: string
  numero_facture: string | null
  montant: number
  commentaire: string | null
  compensation_id: string
}

interface RowImportLettrage {
  date_lettrage: string
  code_client: string
  numero_facture: string | null
  montant: number
  commentaire: string | null
  operateur: string | null
}

interface RowCorrection {
  date_lettrage: string
  id_ligne_bancaire: string | null
  code_client: string
  numero_facture: string | null
  montant: number
  commentaire: string | null
  operateur: string | null
  correction_id: string
}

interface RowLigneBancaire {
  id_operation: string
  date_operation: string
  libelle: string
  detail: string | null
  infos_complementaires: string | null
  debit: number | null
  credit: number | null
  montant_lettre: number
  statut_lettrage: string
}

interface AffectationRow {
  date: string
  ligne: string
  detail: string
  infos_complementaires: string
  debit_credit: string
  code_client: string
  numero_facture: string
  type: string
  montant: number
  commentaire: string
  operateur: string
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function round2(n: number) { return Math.round(n * 100) / 100 }

export async function exporterLettrageXls(dateDebut: string, dateFin: string, nomFichier?: string): Promise<void> {
  // ── 1. Toutes les lignes bancaires dans la plage de dates ────────
  const lignes = await fetchAll<RowLigneBancaire>((from, to) =>
    supabase
      .from('v_lignes_bancaires_avec_statut')
      .select('id_operation, date_operation, libelle, detail, infos_complementaires, debit, credit, montant_lettre, statut_lettrage')
      .gte('date_operation', dateDebut)
      .lte('date_operation', dateFin)
      .order('date_operation', { ascending: true })
      .order('id_operation')
      .range(from, to)
  )

  // Map id_operation → infos ligne (feuille 1 et cadrage)
  const ligneInfoMap = new Map(
    lignes.map(l => [l.id_operation, {
      date_operation: l.date_operation,
      libelle: l.libelle,
      detail: l.detail ?? '',
      infos_complementaires: l.infos_complementaires ?? '',
      debit_credit: l.credit != null ? `Crédit : ${l.credit}` : l.debit != null ? `Débit : ${l.debit}` : '',
    }])
  )

  // IDs des lignes crédit uniquement (les seules pouvant avoir des lettrages)
  const ligneIdsCredit = lignes
    .filter(l => l.statut_lettrage !== 'debit')
    .map(l => l.id_operation)

  // ── 2. Lettrages associés aux lignes crédit ──────────────────────
  // PAR LOTS, et non en un seul `.in()`. Mesuré le 2026-11-27 : au-delà
  // d'environ 700 identifiants la passerelle refuse l'URL en 400. L'erreur
  // était avalée par l'ancien helper, et la feuille « Affectation » sortait
  // VIDE, sans rien signaler — sur une période de plus de 700 lignes, donc
  // précisément sur les exports qui comptent.
  const lettrages = await fetchAllParLots<RowLettrage>(ligneIdsCredit, (lot, from, to) =>
    supabase
      .from('lettrages')
      .select('id, id_ligne_bancaire, code_client, numero_facture, montant, commentaire, operateur, mode, date_lettrage')
      .in('id_ligne_bancaire', lot)
      .eq('annule', false)
      .order('id')
      .range(from, to)
  )

  // ── 2b. Compensations internes ───────────────────────────────────
  const compensations = await fetchAll<RowCompensation>((from, to) =>
    supabase
      .from('lettrages')
      .select('date_lettrage, numero_facture, montant, commentaire, compensation_id')
      .is('id_ligne_bancaire', null)
      .not('compensation_id', 'is', null)
      .eq('annule', false)
      .gte('date_lettrage', dateDebut)
      .lte('date_lettrage', dateFin)
      .order('compensation_id')
      .order('date_lettrage')
      .order('id')
      .range(from, to)
  )

  // ── 2c. Lettrages importés manuellement ─────────────────────────
  const importsHistoriques = await fetchAll<RowImportLettrage>((from, to) =>
    supabase
      .from('lettrages')
      .select('date_lettrage, code_client, numero_facture, montant, commentaire, operateur')
      .is('id_ligne_bancaire', null)
      .eq('mode', 'import')
      .eq('annule', false)
      .gte('date_lettrage', dateDebut)
      .lte('date_lettrage', dateFin)
      .order('date_lettrage')
      .order('id')
      .range(from, to)
  )

  // ── 2d. Corrections de lettrage ──────────────────────────────────
  // Toutes les corrections : standalone (id_ligne_bancaire IS NULL) et liées à une ligne (-C).
  const corrections = await fetchAll<RowCorrection>((from, to) =>
    supabase
      .from('lettrages')
      .select('date_lettrage, id_ligne_bancaire, code_client, numero_facture, montant, commentaire, operateur, correction_id')
      .eq('mode', 'correction')
      .eq('annule', false)
      .gte('date_lettrage', dateDebut)
      .lte('date_lettrage', dateFin)
      .order('correction_id')
      .order('date_lettrage')
      .order('id')
      .range(from, to)
  )

  // Map lettrages par ligne bancaire (feuille 2)
  const lettragsByLigne = new Map<string, RowLettrage[]>()
  for (const l of lettrages) {
    if (!lettragsByLigne.has(l.id_ligne_bancaire)) lettragsByLigne.set(l.id_ligne_bancaire, [])
    lettragsByLigne.get(l.id_ligne_bancaire)!.push(l)
  }

  const wb = XLSX.utils.book_new()

  // ── Feuille 1 : Affectation — toutes sources fusionnées, triées par date croissante ──
  const affectations: AffectationRow[] = []

  for (const l of lettrages) {
    const info = ligneInfoMap.get(l.id_ligne_bancaire)
    // Corrections et dispatches : date réelle de l'opération (date_lettrage = jour du dispatch)
    // Lettrages initiaux : date de la ligne bancaire (date_operation)
    const dateRef = (l.mode === 'correction' || l.mode === 'dispatch')
      ? l.date_lettrage
      : (info?.date_operation ?? '')
    affectations.push({
      date: dateRef,
      ligne: info?.libelle ?? '',
      detail: info?.detail ?? '',
      infos_complementaires: info?.infos_complementaires ?? '',
      debit_credit: info?.debit_credit ?? '',
      code_client: l.code_client,
      numero_facture: estCompte471(l.code_client) ? LIBELLE_471 : (l.numero_facture ?? ''),
      type: l.montant < 0 ? 'Avoir' : '',
      montant: l.montant,
      commentaire: l.commentaire ?? '',
      operateur: l.operateur ?? '',
    })
  }

  for (const c of compensations) {
    affectations.push({
      date: c.date_lettrage,
      ligne: 'Compensation interne',
      detail: '',
      infos_complementaires: '',
      debit_credit: '',
      code_client: '',
      numero_facture: c.numero_facture ?? '',
      type: c.montant < 0 ? 'Avoir' : '',
      montant: c.montant,
      commentaire: c.commentaire ?? '',
      operateur: '',
    })
  }

  for (const imp of importsHistoriques) {
    affectations.push({
      date: imp.date_lettrage,
      ligne: 'Import historique',
      detail: '',
      infos_complementaires: '',
      debit_credit: '',
      code_client: imp.code_client,
      numero_facture: estCompte471(imp.code_client) ? LIBELLE_471 : (imp.numero_facture ?? ''),
      type: imp.montant < 0 ? 'Avoir' : '',
      montant: imp.montant,
      commentaire: imp.commentaire ?? '',
      operateur: imp.operateur ?? '',
    })
  }

  for (const corr of corrections) {
    affectations.push({
      date: corr.date_lettrage,
      ligne: 'Correction lettrage',
      detail: '',
      infos_complementaires: '',
      debit_credit: '',
      code_client: corr.code_client,
      numero_facture: corr.numero_facture ?? '',
      type: '',
      montant: corr.montant,
      commentaire: corr.commentaire ?? '',
      operateur: corr.operateur ?? '',
    })
  }

  affectations.sort((a, b) => a.date.localeCompare(b.date))

  const aoa1: (string | number)[][] = [
    ['Date', 'Ligne bancaire', 'Détail', 'Infos complémentaires', 'Débit / Crédit', 'Code client', 'N° Facture', 'Type', 'Montant', 'Commentaire', 'Opérateur'],
  ]
  for (const r of affectations) {
    aoa1.push([fmtDate(r.date), r.ligne, r.detail, r.infos_complementaires, r.debit_credit, r.code_client, r.numero_facture, r.type, r.montant, r.commentaire, r.operateur])
  }

  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
  ws1['!cols'] = [
    { wch: 12 }, { wch: 42 }, { wch: 28 }, { wch: 32 }, { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 32 }, { wch: 15 },
  ]
  styleHeaderRow(ws1, 11)

  // ── Feuille 2 : Lignes bancaires (débits + crédits) ──────────────
  const aoa2: (string | number)[][] = [
    ['Référence', 'Date', 'Libellé', 'Détail', 'Infos complémentaires', 'Débit', 'Crédit', 'Type', 'Commentaire'],
  ]
  for (const lb of lignes) {
    const isDebit = lb.statut_lettrage === 'debit'
    const letts = lettragsByLigne.get(lb.id_operation) ?? []
    const hasFactures = letts.some(l => !estCompte471(l.code_client))
    const hasAutres = letts.some(l => estCompte471(l.code_client))
    const type = isDebit ? 'Débit'
      : !letts.length ? 'Non lettré'
      : hasFactures && hasAutres ? 'Mixte'
      : hasAutres ? LIBELLE_471
      : 'Facture'
    const commentairesAutres = letts
      .filter(l => estCompte471(l.code_client))
      .map(l => (l.commentaire ?? '').trim() || (l.numero_facture ?? '').trim())
      .filter(Boolean)
      .join(' / ')
    aoa2.push([
      lb.id_operation,
      fmtDate(lb.date_operation),
      lb.libelle,
      lb.detail ?? '',
      lb.infos_complementaires ?? '',
      lb.debit ?? '',
      lb.credit ?? '',
      type,
      commentairesAutres,
    ])
  }

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  ws2['!cols'] = [
    { wch: 28 }, { wch: 12 }, { wch: 42 }, { wch: 28 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 38 },
  ]
  styleHeaderRow(ws2, 9)

  // ── Feuille 3 : Cadrage ──────────────────────────────────────────
  // totalLettreVue vient de la VUE (montant_lettre, agrégé par Postgres) ;
  // lettreClient et autres viennent des LIGNES DE LETTRAGE rapatriées. Deux
  // chemins indépendants pour la même grandeur : leur écart alimente la
  // colonne Contrôle, et c'est ce qui donne sa valeur à cette feuille.
  const jourMap = new Map<string, {
    totalCredit: number
    totalLettreVue: number
    totalLettreRealise: number
    totalAutres: number
  }>()
  const vide = () => ({ totalCredit: 0, totalLettreVue: 0, totalLettreRealise: 0, totalAutres: 0 })

  for (const lb of lignes) {
    if (!lb.credit) continue
    const date = lb.date_operation
    if (!jourMap.has(date)) jourMap.set(date, vide())
    jourMap.get(date)!.totalCredit += lb.credit
    jourMap.get(date)!.totalLettreVue += lb.montant_lettre ?? 0
  }

  for (const l of lettrages) {
    const date = ligneInfoMap.get(l.id_ligne_bancaire)?.date_operation
    if (!date) continue
    if (!jourMap.has(date)) jourMap.set(date, vide())
    // Les encaissements affectés au compte d'attente 471 sont suivis à part.
    // Ils n'ont mouvementé aucun compte client, donc ils n'ont rien à faire
    // dans le total lettré ; mais ils expliquent une partie de l'écart. Sans
    // cette colonne, un écart parfaitement légitime — un remboursement
    // fournisseur, par exemple — ressemble à une erreur de lettrage, et
    // quelqu'un part chercher un problème qui n'existe pas.
    //
    // CE TEST NE PORTAIT QUE SUR 'AUTRES' jusqu'au 2026-11-27. Or le panneau
    // de lettrage — le parcours quotidien — écrit '471'. La colonne était donc
    // aveugle au cas principal, et ces montants partaient dans le `else`,
    // c'est-à-dire exactement dans le total lettré client que le paragraphe
    // ci-dessus interdit. Le Cadrage se trompait deux fois sur la même ligne.
    if (estCompte471(l.code_client)) jourMap.get(date)!.totalAutres += l.montant
    else                             jourMap.get(date)!.totalLettreRealise += l.montant
  }

  // DES EN-TÊTES QUI DISENT CE QUE CONTIENNENT LES COLONNES.
  //
  // L'ancienne version affichait « Total Lettré » et « Delta », et calculait :
  //     totalLettre = totalCredit - totalLettreRealise
  //     delta       = totalCredit - totalLettre      // = totalLettreRealise
  // Soit l'inverse de leurs noms : « Total Lettré » montrait le RESTE non
  // affecté à un client, et « Delta » le vrai montant lettré.
  //
  // Tant que la colonne 471 affichait zéro, l'inversion restait invisible.
  // Une fois cette colonne réparée, le 2026-11-27, elle devenait absurde :
  // « Total Lettré » et « dont Autres » tombaient égales, puisque le reste
  // après lettrage client EST la part 471 quand la ligne est soldée.
  //
  // Le risque n'était pas cosmétique. Un expert-comptable lisant « crédit
  // 27 115,58 € / Delta 26 982,62 € » y voit un écart de rapprochement de
  // 99,5 %, et part chercher une anomalie qui n'existe pas.
  //
  // LA COLONNE CONTRÔLE croise deux sources indépendantes : ce que la vue
  // calcule comme montant lettré, et la somme des lignes de lettrage
  // rapatriées. Elle doit valoir zéro. Une valeur non nulle signale un
  // rapatriement incomplet — exactement la panne du filtre .in() corrigée le
  // même jour, qui vidait la feuille Affectation sans rien dire.
  const aoa3: (string | number)[][] = [
    ['Date', 'Total Crédit', 'Lettré client', '471_Autres', 'Jamais lettré', 'Contrôle'],
  ]
  const ligneCadrage = (credit: number, lettreVue: number, client: number, autres: number) => ({
    credit:       round2(credit),
    client:       round2(client),
    autres:       round2(autres),
    jamaisLettre: round2(credit - lettreVue),
    controle:     round2(lettreVue - client - autres),
  })

  for (const [date, v] of [...jourMap.entries()].sort()) {
    const c = ligneCadrage(v.totalCredit, v.totalLettreVue, v.totalLettreRealise, v.totalAutres)
    aoa3.push([fmtDate(date), c.credit, c.client, c.autres, c.jamaisLettre, c.controle])
  }

  const somme = (f: (v: { totalCredit: number; totalLettreVue: number; totalLettreRealise: number; totalAutres: number }) => number) =>
    [...jourMap.values()].reduce((s, v) => s + f(v), 0)
  const g = ligneCadrage(somme(v => v.totalCredit), somme(v => v.totalLettreVue), somme(v => v.totalLettreRealise), somme(v => v.totalAutres))
  aoa3.push(['TOTAL', g.credit, g.client, g.autres, g.jamaisLettre, g.controle])

  const ws3 = XLSX.utils.aoa_to_sheet(aoa3)
  ws3['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]
  styleHeaderRow(ws3, 6)

  XLSX.utils.book_append_sheet(wb, ws1, 'Affectation')
  XLSX.utils.book_append_sheet(wb, ws2, 'Lignes bancaires')
  XLSX.utils.book_append_sheet(wb, ws3, 'Cadrage')

  XLSX.writeFile(wb, `${nomFichier ?? `export_lettrage_${dateDebut}_${dateFin}`}.xlsx`)
}

function styleHeaderRow(ws: XLSX.WorkSheet, nbCols: number) {
  for (let c = 0; c < nbCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) continue
    ws[addr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0F172A' } },
      alignment: { horizontal: 'left' },
    }
  }
}
