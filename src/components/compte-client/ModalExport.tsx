// Modal d'export XLS — Classique (factures) ou Grand Livre (chronologique avec solde)
import { useState } from 'react'
import { IcDownload } from '../Icones'
import type { CompteClient, FactureDetail } from '../../types/client'
import { exporterXls, exporterGrandLivreXls, type LigneGrandLivre } from '../../lib/exportXls'
import { supabase } from '../../lib/supabase'

interface Props {
  ouvert: boolean
  clients: CompteClient[]
  getFactures: (codes: string | string[]) => FactureDetail[]
  chargerFactures: (codes: string | string[]) => Promise<void>
  onFermer: () => void
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function anneeDebut(y: number) { return `${y}-01-01` }
function anneeFin(y: number)   { return `${y}-12-31` }

export function ModalExport({ ouvert, clients, getFactures, chargerFactures, onFermer }: Props) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const il12Mois = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1).toISOString().split('T')[0]

  const [typeExport, setTypeExport] = useState<'classique' | 'grandlivre'>('classique')
  const [selection, setSelection] = useState<'toutes' | string>('toutes')
  const [dateDebut, setDateDebut] = useState(anneeDebut(now.getFullYear()))
  const [dateFin, setDateFin] = useState(today)
  const [chargement, setChargement] = useState(false)

  if (!ouvert) return null

  const annees = [now.getFullYear() - 1, now.getFullYear()]

  // Export classique — comportement inchangé
  async function handleExportClassique() {
    setChargement(true)
    let factures: FactureDetail[]
    if (selection === 'toutes') {
      const codes = clients.map(c => c.code_dso)
      await chargerFactures(codes)
      factures = getFactures(codes)
    } else {
      await chargerFactures(selection)
      factures = getFactures(selection)
    }
    setChargement(false)
    if (!factures.length) return
    const nom = selection === 'toutes' ? 'tous_clients' : (clients.find(c => c.code_dso === selection)?.nom ?? selection).replace(/\s+/g, '_')
    exporterXls(factures, `extraction_${nom}_${today}`)
    onFermer()
  }

  // Export Grand Livre — requête chronologique par client
  async function handleExportGrandLivre() {
    if (!selection || selection === 'toutes') return
    setChargement(true)

    const client = clients.find(c => c.code_dso === selection)
    if (!client) { setChargement(false); return }

    // Solde d'ouverture : mouvements avant dateDebut
    const [factAvant, lettAvant] = await Promise.all([
      supabase.from('factures').select('montant_ttc').eq('code_client', selection).lt('date_emission', dateDebut),
      supabase.from('lettrages').select('montant').eq('code_client', selection).lt('date_lettrage', dateDebut),
    ])
    const debitAvant  = ((factAvant.data ?? []) as { montant_ttc: number }[]).reduce((s, f) => s + (f.montant_ttc ?? 0), 0)
    const creditAvant = ((lettAvant.data ?? []) as { montant: number }[]).reduce((s, l) => s + (l.montant ?? 0), 0)
    const soldeOuverture = Math.round((debitAvant - creditAvant) * 100) / 100

    // Factures de la période
    const { data: factData } = await supabase
      .from('factures')
      .select('numero_piece, date_emission, montant_ttc, est_avoir')
      .eq('code_client', selection)
      .gte('date_emission', dateDebut)
      .lte('date_emission', dateFin)
      .order('date_emission', { ascending: true })

    // Lettrages de la période
    const { data: lettData } = await supabase
      .from('lettrages')
      .select('date_lettrage, id_ligne_bancaire, numero_facture, montant, mode')
      .eq('code_client', selection)
      .gte('date_lettrage', dateDebut)
      .lte('date_lettrage', dateFin)
      .order('date_lettrage', { ascending: true })

    // Libellés + dates bancaires pour les id réels (sans -C)
    const lettrages = (lettData ?? []) as { date_lettrage: string; id_ligne_bancaire: string | null; numero_facture: string | null; montant: number; mode: string }[]
    const idsReels = [...new Set(
      lettrages.map(l => l.id_ligne_bancaire)
        .filter((id): id is string => !!id && !id.endsWith('-C'))
    )]
    let bancaireMap: Record<string, { libelle: string; date_operation: string }> = {}
    if (idsReels.length) {
      const { data: bData } = await supabase
        .from('lignes_bancaires')
        .select('id_operation, libelle, date_operation')
        .in('id_operation', idsReels)
      for (const b of (bData ?? []) as { id_operation: string; libelle: string; date_operation: string }[]) {
        bancaireMap[b.id_operation] = { libelle: b.libelle, date_operation: b.date_operation }
      }
    }

    // Référence lettre A/B/C... par ligne bancaire unique (ordre chronologique d'apparition)
    function toLetter(n: number): string {
      if (n < 26) return String.fromCharCode(65 + n)
      return String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(65 + (n % 26))
    }
    const refMap: Record<string, string> = {}
    let refIdx = 0
    for (const l of lettrages) {
      const idBase = l.id_ligne_bancaire?.replace(/-C$/, '') ?? null
      if (idBase && !(idBase in refMap)) refMap[idBase] = toLetter(refIdx++)
    }
    // Facture → ensemble de lettres des virements qui l'ont lettrée dans la période
    const factureRefs = new Map<string, Set<string>>()
    for (const l of lettrages) {
      if (!l.numero_facture) continue
      const idBase = l.id_ligne_bancaire?.replace(/-C$/, '') ?? null
      const lettre = idBase ? refMap[idBase] : null
      if (!lettre) continue
      if (!factureRefs.has(l.numero_facture)) factureRefs.set(l.numero_facture, new Set())
      factureRefs.get(l.numero_facture)!.add(lettre)
    }

    // Construction des lignes avec solde cumulé
    type RawLigne = { _date: string; _ordre: number } & LigneGrandLivre
    const rows: RawLigne[] = []

    for (const f of (factData ?? []) as { numero_piece: string; date_emission: string; montant_ttc: number; est_avoir: boolean }[]) {
      const isAvoir = f.est_avoir || f.montant_ttc < 0
      const refLettres = [...(factureRefs.get(f.numero_piece) ?? [])].join('/')
      rows.push({
        _date: f.date_emission,
        _ordre: 0,
        date: fmtDate(f.date_emission),
        type: isAvoir ? 'Avoir' : 'Facture',
        ref_paiement: '',
        libelle: isAvoir ? 'Avoir' : 'Facture',
        numero_piece: f.numero_piece,
        ref: refLettres,
        debit: isAvoir ? null : f.montant_ttc,
        credit: isAvoir ? Math.abs(f.montant_ttc) : null,
        solde: 0,
      })
    }

    for (const l of lettrages) {
      const isCorrection = !l.id_ligne_bancaire || l.id_ligne_bancaire.endsWith('-C')
      const idBase = l.id_ligne_bancaire?.replace(/-C$/, '') ?? null
      const bancaire = idBase ? bancaireMap[idBase] : null
      const dateAffichee = (!isCorrection && bancaire) ? bancaire.date_operation : l.date_lettrage
      const libelle = isCorrection
        ? (bancaire ? `Correction (${bancaire.libelle})` : 'Correction manuelle')
        : (bancaire?.libelle ?? l.id_ligne_bancaire ?? '')
      const lettre = idBase ? (refMap[idBase] ?? '') : ''

      rows.push({
        _date: dateAffichee,
        _ordre: 1,
        date: fmtDate(dateAffichee),
        type: isCorrection ? 'Correction' : 'Règlement',
        ref_paiement: l.id_ligne_bancaire ?? '',
        libelle,
        numero_piece: l.numero_facture ?? '',
        ref: lettre,
        debit: l.montant < 0 ? Math.abs(l.montant) : null,
        credit: l.montant > 0 ? l.montant : null,
        solde: 0,
      })
    }

    // Tri chronologique (date puis factures avant lettrages le même jour)
    rows.sort((a, b) => a._date.localeCompare(b._date) || a._ordre - b._ordre)

    // Calcul du solde cumulé
    let solde = soldeOuverture
    for (const r of rows) {
      solde += (r.debit ?? 0) - (r.credit ?? 0)
      solde = Math.round(solde * 100) / 100
      r.solde = solde
    }

    setChargement(false)
    const nomFichier = `grand_livre_${client.nom.replace(/\s+/g, '_')}_${dateDebut}_${dateFin}`
    exporterGrandLivreXls(
      client.nom,
      client.code_dso,
      fmtDate(dateDebut),
      fmtDate(dateFin),
      soldeOuverture,
      rows,
      nomFichier
    )
    onFermer()
  }

  const peutExporterGL = selection !== 'toutes' && !!dateDebut && !!dateFin

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><IcDownload size={13} className="text-gray-500" /> Extraction XLS</h3>
            <p className="text-xs text-gray-400 mt-0.5">Fichier Excel — Calibri 12, montants numériques</p>
          </div>
          <button onClick={onFermer} className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Type d'export */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Type d'export</p>
            <div className="grid grid-cols-2 gap-2">
              {(['classique', 'grandlivre'] as const).map(t => (
                <label key={t} className={`flex items-center gap-2.5 p-3 border rounded-lg cursor-pointer transition-colors ${typeExport === t ? 'border-ockham-teal/50 bg-ockham-teal-muted' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="radio" name="type" value={t} checked={typeExport === t} onChange={() => setTypeExport(t)} className="accent-ockham-teal" />
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{t === 'classique' ? 'Classique' : 'Grand Livre'}</p>
                    <p className="text-[10px] text-gray-400">{t === 'classique' ? 'Factures & encours' : 'Chronologique + solde'}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Périmètre client */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Client</p>
            {typeExport === 'classique' && (
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors mb-2">
                <input type="radio" name="scope" value="toutes" checked={selection === 'toutes'} onChange={() => setSelection('toutes')} className="accent-ockham-teal" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Tous les clients</p>
                  <p className="text-xs text-gray-400">{clients.reduce((s, c) => s + c.nb_factures_total, 0)} factures — vue filtrée actuelle</p>
                </div>
              </label>
            )}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                {clients.map(c => (
                  <label key={c.code_dso} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input type="radio" name="scope" value={c.code_dso} checked={selection === c.code_dso} onChange={() => setSelection(c.code_dso)} className="accent-ockham-teal flex-shrink-0" />
                    <div className="flex-1 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-ockham-teal">{c.code_dso}</span>
                        <span className="ml-2 text-xs text-gray-700">{c.nom}</span>
                      </div>
                      <span className="text-[10px] text-gray-400">{c.nb_factures_total} fac.</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            {typeExport === 'grandlivre' && selection === 'toutes' && (
              <p className="text-[11px] text-amber-600 mt-1.5">Sélectionnez un client pour le Grand Livre</p>
            )}
          </div>

          {/* Période — Grand Livre uniquement */}
          {typeExport === 'grandlivre' && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Période</p>
              <div className="flex gap-2 mb-2">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-400 block mb-1">Du</label>
                  <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-ockham-teal" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-400 block mb-1">Au</label>
                  <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-ockham-teal" />
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {annees.map(y => (
                  <button key={y} onClick={() => { setDateDebut(anneeDebut(y)); setDateFin(anneeFin(y)) }}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded border border-gray-200 hover:border-ockham-teal/40 hover:text-ockham-teal text-gray-500 transition-colors">
                    {y}
                  </button>
                ))}
                <button onClick={() => { setDateDebut(il12Mois); setDateFin(today) }}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded border border-gray-200 hover:border-ockham-teal/40 hover:text-ockham-teal text-gray-500 transition-colors">
                  12 mois
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onFermer} disabled={chargement} className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40">
            Annuler
          </button>
          <button
            onClick={typeExport === 'classique' ? handleExportClassique : handleExportGrandLivre}
            disabled={chargement || (typeExport === 'grandlivre' && !peutExporterGL)}
            className="flex-[2] flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            {chargement ? '…' : <><IcDownload size={13} className="inline-block mr-1.5" />Télécharger XLSX</>}
          </button>
        </div>
      </div>
    </div>
  )
}
