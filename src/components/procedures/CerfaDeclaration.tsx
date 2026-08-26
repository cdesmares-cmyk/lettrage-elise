import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import type { ProcedureLigne } from '../../hooks/useProcedures'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const fmtD = (n: number) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''

const todayFr = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

interface OrgCerfa {
  raison_sociale: string | null
  forme_juridique: string | null
  siret: string | null
  adresse: string | null
  ville: string | null
  code_postal: string | null
}

interface VersionRow { id: string; version_number: number; date_edition: string }

interface Props {
  ligne: ProcedureLigne
  declarationId: string | null
  montantEchu: number
  montantAEchoir: number
  montantTotal: number
  onBack: () => void
}

export function CerfaDeclaration({ ligne, declarationId, montantEchu, montantAEchoir, onBack }: Props) {
  const { profil, utilisateur } = useAuth()
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [saving, setSaving] = useState(false)

  // Créancier (pré-rempli depuis org)
  const [eNom, setENom]         = useState('')
  const [eAdresse, setEAdresse] = useState('')
  const [eVilleCP, setEVilleCP] = useState('')
  const [eSiret, setESiret]     = useState('')
  const [eMandataire, setEMandataire] = useState('')

  // Débiteur / procédure (pré-rempli depuis ligne)
  const [eDebiteurNom, setEDebiteurNom]       = useState(ligne.nom)
  const [eDebiteurSiret, setEDebiteurSiret]   = useState(ligne.siretClient ?? '')
  const [eTribunal, setETribunal]             = useState(ligne.tribunal ?? '')
  const [eTypeJugement, setETypeJugement]     = useState(ligne.typeJugement ?? '')
  const [eDateJugement, setEDateJugement]     = useState(fmtDate(ligne.dateJugement))

  // Montants et observations
  const [eMontantEchuStr, setEMontantEchuStr]       = useState(() => montantEchu.toFixed(2).replace('.', ','))
  const [eMontantAEchoirStr, setEMontantAEchoirStr] = useState(() => montantAEchoir.toFixed(2).replace('.', ','))
  const [eObsEchu, setEObsEchu]     = useState('')
  const [eObsAEchoir, setEObsAEchoir] = useState('')

  // Conclusion
  const [eFaitA, setEFaitA]           = useState('')
  const [eDate, setEDate]             = useState(todayFr())
  const [eSignataire, setESignataire] = useState('')
  const [eRepresentant, setERepresentant] = useState('')

  const totalTtc = (parseFloat(eMontantEchuStr.replace(',', '.')) || 0)
                 + (parseFloat(eMontantAEchoirStr.replace(',', '.')) || 0)

  // CSS print : supprime header/footer navigateur + uniformise la police
  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'cerfa-print-css'
    s.innerHTML = `
      @page { margin: 0; size: A4 portrait; }
      @media print {
        body * { visibility: hidden !important; }
        .cerfa-printable, .cerfa-printable * { visibility: visible !important; }
        .cerfa-printable {
          position: fixed; left: 0; top: 0; width: 100%;
          background: #fff !important;
          padding: 10mm 15mm;
          box-sizing: border-box;
          font-family: Calibri, Arial, sans-serif !important;
          font-size: 10pt;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        .cerfa-printable input,
        .cerfa-printable textarea {
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 0 !important;
          resize: none !important;
          outline: none !important;
          font-family: Calibri, Arial, sans-serif !important;
          font-size: inherit !important;
          color: #111 !important;
          box-shadow: none !important;
          -webkit-appearance: none !important;
          appearance: none !important;
        }
        .cerfa-creance-header {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `
    document.head.appendChild(s)
    return () => { document.getElementById('cerfa-print-css')?.remove() }
  }, [])

  // Charger org + signataire
  useEffect(() => {
    if (!profil?.organisation_id) return
    Promise.all([
      db.from('organisations').select('raison_sociale, forme_juridique, siret, adresse, ville, code_postal').eq('id', profil.organisation_id).single(),
      db.from('utilisateurs').select('nom, prenom').eq('id', utilisateur?.id).single(),
    ]).then(([orgR, usrR]: [{ data: OrgCerfa | null }, { data: { nom: string | null; prenom: string | null } | null }]) => {
      if (orgR.data) {
        const o = orgR.data
        const nomFJ = o.forme_juridique && o.raison_sociale
          ? `${o.forme_juridique} ${o.raison_sociale}`
          : o.raison_sociale ?? ''
        setENom(nomFJ)
        setEAdresse(o.adresse ?? '')
        setEVilleCP([o.code_postal, o.ville].filter(Boolean).join(' '))
        setESiret(o.siret ?? '')
        setEFaitA([o.ville, o.code_postal].filter(Boolean).join(' – '))
      }
      if (usrR.data) setESignataire([usrR.data.prenom, usrR.data.nom].filter(Boolean).join(' '))
    })
  }, [profil?.organisation_id, utilisateur?.id])

  // Charger versions
  useEffect(() => {
    if (!declarationId) return
    db.from('declarations_versions').select('id, version_number, date_edition')
      .eq('declaration_id', declarationId).order('version_number', { ascending: false })
      .then(({ data }: { data: VersionRow[] | null }) => setVersions(data ?? []))
  }, [declarationId])

  async function handleTelecharger() {
    if (!declarationId) { toast.error('Sauvegardez d\'abord la déclaration avant de générer le PDF'); return }
    setSaving(true)
    try {
      const versionNumber = (versions[0]?.version_number ?? 0) + 1
      const snapshot = {
        version: versionNumber, date: new Date().toISOString(),
        creancier: { nom: eNom, adresse: eAdresse, villeCP: eVilleCP, siret: eSiret },
        mandataire: eMandataire, signataire: eSignataire,
        debiteur: { nom: eDebiteurNom, siret: eDebiteurSiret, tribunal: eTribunal },
        jugement: { type: eTypeJugement, date: eDateJugement },
        montant_echu: eMontantEchuStr, montant_a_echoir: eMontantAEchoirStr, montant_total: totalTtc,
        obs_echu: eObsEchu, obs_a_echoir: eObsAEchoir,
        representant: eRepresentant,
      }
      const { error } = await db.from('declarations_versions').insert({ declaration_id: declarationId, version_number: versionNumber, snapshot })
      if (error) throw error
      setVersions(prev => [{ id: crypto.randomUUID(), version_number: versionNumber, date_edition: new Date().toISOString() }, ...prev])
      window.print()
    } catch { toast.error('Erreur lors de la génération') } finally { setSaving(false) }
  }

  const lbl = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-0.5'
  const inp = 'w-full text-sm text-gray-900 border-b border-gray-200 pb-0.5 mb-2 outline-none bg-transparent focus:border-ockham-teal transition-colors'
  const ta  = 'w-full text-xs text-gray-800 border border-gray-200 rounded p-2 outline-none bg-white focus:border-ockham-teal resize-none transition-colors'

  return (
    <div className="space-y-5">

      {/* ── CERFA imprimable ── */}
      <div className="cerfa-printable border border-gray-200 rounded-xl p-6 space-y-4 bg-white">

        {/* En-tête */}
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900" style={{ fontFamily: 'serif' }}>Déclaration de créances</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">à adresser au représentant des créanciers, mandataire judiciaire</p>
          </div>
          <span className="text-[11px] text-gray-400 border border-gray-200 rounded px-2 py-0.5">N° 10021*01</span>
        </div>

        {/* Créancier + Mandataire */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-[10px] font-bold text-gray-900 uppercase mb-2 pb-1 border-b border-gray-200">Créancier</p>
            <input className={inp} value={eNom} onChange={e => setENom(e.target.value)} placeholder="Forme juridique + Raison sociale" />
            <input className={inp} value={eAdresse} onChange={e => setEAdresse(e.target.value)} placeholder="Adresse" />
            <input className={inp} value={eVilleCP} onChange={e => setEVilleCP(e.target.value)} placeholder="Code postal Ville" />
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500 shrink-0">SIRET :</span>
              <input
                className="flex-1 text-sm text-gray-900 border-b border-gray-200 pb-0.5 outline-none bg-transparent focus:border-ockham-teal transition-colors"
                value={eSiret} onChange={e => setESiret(e.target.value)} placeholder="—"
              />
            </div>
          </div>
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-[10px] font-bold text-gray-900 uppercase mb-2 pb-1 border-b border-gray-200">Mandataire du créancier</p>
            <textarea className={ta} rows={4} value={eMandataire} onChange={e => setEMandataire(e.target.value)} placeholder="Nom, coordonnées du mandataire du créancier…" />
          </div>
        </div>

        {/* Débiteur + Procédure */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-[10px] font-bold text-gray-900 uppercase mb-2 pb-1 border-b border-gray-200">Débiteur</p>
            <span className={lbl}>Dénomination</span>
            <input className={inp} value={eDebiteurNom} onChange={e => setEDebiteurNom(e.target.value)} />
            <span className={lbl}>SIRET</span>
            <input className={inp} value={eDebiteurSiret} onChange={e => setEDebiteurSiret(e.target.value)} />
            <span className={lbl}>Tribunal</span>
            <input className="w-full text-sm text-gray-800 border-b border-gray-200 pb-0.5 outline-none bg-transparent focus:border-ockham-teal transition-colors" value={eTribunal} onChange={e => setETribunal(e.target.value)} />
          </div>
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-[10px] font-bold text-gray-900 uppercase mb-2 pb-1 border-b border-gray-200">Procédure</p>
            <span className={lbl}>Nature du jugement</span>
            <input className={inp} value={eTypeJugement} onChange={e => setETypeJugement(e.target.value)} />
            <span className={lbl}>Date du jugement</span>
            <input className="w-full text-sm text-gray-800 border-b border-gray-200 pb-0.5 outline-none bg-transparent focus:border-ockham-teal transition-colors" value={eDateJugement} onChange={e => setEDateJugement(e.target.value)} />
          </div>
        </div>

        {/* Créance déclarée */}
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <div className="cerfa-creance-header px-3 py-2 text-center" style={{ background: '#0E1A2B' }}>
            <p className="text-[11px] font-bold text-white uppercase tracking-wide">Créance déclarée</p>
            <p className="text-[10px] text-white/50 italic">Le décompte et la liste des pièces sont à joindre en annexe</p>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 text-left text-[10px] font-semibold text-gray-500 w-1/4"></th>
                <th className="border border-gray-200 px-3 py-2 text-center text-[10px] font-semibold text-gray-700">Créance chirographaire<br /><span className="font-normal text-gray-400">(sans privilège)</span></th>
                <th className="border border-gray-200 px-3 py-2 text-center text-[10px] font-semibold text-gray-700">Créance privilégiée</th>
                <th className="border border-gray-200 px-3 py-2 text-center text-[10px] font-semibold text-gray-700">Observations</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-3 py-2.5 font-semibold text-gray-800 bg-gray-50 text-[11px]">Montant échu</td>
                <td className="border border-gray-200 px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <input type="text" className="text-sm font-mono text-gray-900 text-right outline-none bg-transparent w-20" value={eMontantEchuStr} onChange={e => setEMontantEchuStr(e.target.value)} />
                    <span className="text-sm text-gray-600 shrink-0">€</span>
                  </div>
                </td>
                <td className="border border-gray-200 px-3 py-2.5"></td>
                <td className="border border-gray-200 px-2 py-1.5">
                  <input className="w-full text-[10px] text-gray-600 outline-none bg-transparent" value={eObsEchu} onChange={e => setEObsEchu(e.target.value)} placeholder="Observations…" />
                </td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-3 py-2.5 font-semibold text-gray-800 bg-gray-50 text-[11px]">Montant à échoir</td>
                <td className="border border-gray-200 px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <input type="text" className="text-sm font-mono text-gray-900 text-right outline-none bg-transparent w-20" value={eMontantAEchoirStr} onChange={e => setEMontantAEchoirStr(e.target.value)} />
                    <span className="text-sm text-gray-600 shrink-0">€</span>
                  </div>
                </td>
                <td className="border border-gray-200 px-3 py-2.5"></td>
                <td className="border border-gray-200 px-2 py-1.5">
                  <input className="w-full text-[10px] text-gray-600 outline-none bg-transparent" value={eObsAEchoir} onChange={e => setEObsAEchoir(e.target.value)} placeholder="Observations…" />
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-3 py-2.5 font-bold text-gray-900 text-[11px]">Total T.T.C.</td>
                <td className="border border-gray-200 px-3 py-2.5 text-right font-bold text-gray-900">{fmtD(totalTtc)}</td>
                <td className="border border-gray-200 px-3 py-2.5"></td>
                <td className="border border-gray-200 px-3 py-2.5"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Fait à + Représentant */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 text-sm">
            <div>
              <span className={lbl}>Fait à</span>
              <input className={inp} value={eFaitA} onChange={e => setEFaitA(e.target.value)} />
            </div>
            <div>
              <span className={lbl}>Le</span>
              <input className={inp} value={eDate} onChange={e => setEDate(e.target.value)} />
            </div>
            <div>
              <span className={lbl}>Nom et qualité du signataire</span>
              <input className={inp} value={eSignataire} onChange={e => setESignataire(e.target.value)} />
            </div>
            <p className="text-xs text-gray-600 pt-0.5">
              requiert l'admission de sa créance pour un montant total de{' '}
              <span className="font-bold text-gray-900">{fmtD(totalTtc)}</span> T.T.C.
            </p>
            <p className="text-[10px] text-gray-400 italic">Certifié sincère — SIGNATURE</p>
            <div className="border border-gray-300 rounded mt-1" style={{ height: 90 }} />
          </div>
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-[10px] font-bold text-gray-900 uppercase mb-2 pb-1 border-b border-gray-200">Représentant des créanciers</p>
            <textarea className={ta} rows={6} value={eRepresentant} onChange={e => setERepresentant(e.target.value)} placeholder="Coordonnées du mandataire judiciaire…" />
          </div>
        </div>

      </div>

      {/* Historique versions */}
      {versions.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Historique des éditions</p>
          <div className="space-y-1">
            {versions.map(v => (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                <span className="text-[10px] font-bold text-ockham-teal bg-ockham-teal/10 px-2 py-0.5 rounded-full">v{v.version_number}</span>
                <span className="text-xs text-gray-600">{new Date(v.date_edition).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
        <button onClick={onBack} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer">
          ← Retour suivi
        </button>
        <button
          onClick={handleTelecharger}
          disabled={saving || !declarationId}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          style={{ background: '#0E1A2B' }}
          title={!declarationId ? 'Sauvegardez d\'abord la déclaration' : ''}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          {saving ? 'Génération…' : `Télécharger PDF${versions.length > 0 ? ` (v${(versions[0]?.version_number ?? 0) + 1})` : ''}`}
        </button>
      </div>

    </div>
  )
}
