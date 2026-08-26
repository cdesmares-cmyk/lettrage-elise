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
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

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

export function CerfaDeclaration({ ligne, declarationId, montantEchu, montantAEchoir, montantTotal, onBack }: Props) {
  const { profil, utilisateur } = useAuth()
  const [org, setOrg]           = useState<OrgCerfa | null>(null)
  const [signataire, setSignataire] = useState('')
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [saving, setSaving]     = useState(false)

  // Inject print CSS — seul le div.cerfa-printable est visible à l'impression
  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'cerfa-print-css'
    s.innerHTML = `@media print{body *{visibility:hidden!important}.cerfa-printable,.cerfa-printable *{visibility:visible!important}.cerfa-printable{position:fixed;left:0;top:0;width:100%;background:#fff;padding:12mm 18mm;box-sizing:border-box;font-family:'Times New Roman',serif;font-size:11pt}}`
    document.head.appendChild(s)
    return () => { document.getElementById('cerfa-print-css')?.remove() }
  }, [])

  useEffect(() => {
    if (!profil?.organisation_id) return
    Promise.all([
      db.from('organisations').select('raison_sociale, forme_juridique, siret, adresse, ville, code_postal').eq('id', profil.organisation_id).single(),
      db.from('utilisateurs').select('nom, prenom').eq('id', utilisateur?.id).single(),
    ]).then(([orgR, usrR]: [{ data: OrgCerfa | null }, { data: { nom: string | null; prenom: string | null } | null }]) => {
      if (orgR.data) setOrg(orgR.data)
      if (usrR.data) setSignataire([usrR.data.prenom, usrR.data.nom].filter(Boolean).join(' '))
    })
  }, [profil?.organisation_id, utilisateur?.id])

  useEffect(() => {
    if (!declarationId) return
    db.from('declarations_versions').select('id, version_number, date_edition').eq('declaration_id', declarationId).order('version_number', { ascending: false })
      .then(({ data }: { data: VersionRow[] | null }) => setVersions(data ?? []))
  }, [declarationId])

  async function handleTelecharger() {
    if (!declarationId) { toast.error('Sauvegardez d\'abord la déclaration avant de générer le PDF'); return }
    setSaving(true)
    try {
      const versionNumber = (versions[0]?.version_number ?? 0) + 1
      const snapshot = {
        version: versionNumber, date: new Date().toISOString(),
        creancier: org, signataire,
        debiteur: { nom: ligne.nom, siret: ligne.siretClient },
        jugement: { type: ligne.typeJugement, date: ligne.dateJugement, tribunal: ligne.tribunal },
        montant_echu: montantEchu, montant_a_echoir: montantAEchoir, montant_total: montantTotal,
      }
      const { error } = await db.from('declarations_versions').insert({ declaration_id: declarationId, version_number: versionNumber, snapshot })
      if (error) throw error
      setVersions(prev => [{ id: crypto.randomUUID(), version_number: versionNumber, date_edition: new Date().toISOString() }, ...prev])
      window.print()
    } catch { toast.error('Erreur lors de la génération') } finally { setSaving(false) }
  }

  const totalTtc = montantEchu + montantAEchoir
  const lbl = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-0.5'
  const val = 'text-sm text-gray-900 border-b border-gray-200 pb-1 mb-2'

  const creancierLines = [
    org?.raison_sociale && org?.forme_juridique ? `${org.forme_juridique} ${org.raison_sociale}` : org?.raison_sociale ?? '—',
    org?.adresse ?? '',
    [org?.code_postal, org?.ville].filter(Boolean).join(' '),
    org?.siret ? `SIRET : ${org.siret}` : '',
  ].filter(Boolean)

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

        {/* Créancier + Mandataire du créancier */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-[10px] font-bold text-gray-900 uppercase mb-2 pb-1 border-b border-gray-200">Créancier</p>
            {creancierLines.map((l, i) => <p key={i} className="text-sm text-gray-800 leading-relaxed">{l}</p>)}
          </div>
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-[10px] font-bold text-gray-900 uppercase mb-2 pb-1 border-b border-gray-200">Mandataire du créancier</p>
            <p className="text-xs text-gray-400 italic">À noter à la main</p>
          </div>
        </div>

        {/* Débiteur + Procédure */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-[10px] font-bold text-gray-900 uppercase mb-2 pb-1 border-b border-gray-200">Débiteur</p>
            <span className={lbl}>Dénomination</span>
            <p className={val}>{ligne.nom}</p>
            {ligne.siretClient && <><span className={lbl}>SIRET</span><p className={val}>{ligne.siretClient}</p></>}
            {ligne.tribunal && <><span className={lbl}>Tribunal</span><p className="text-sm text-gray-800">{ligne.tribunal}</p></>}
          </div>
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-[10px] font-bold text-gray-900 uppercase mb-2 pb-1 border-b border-gray-200">Procédure</p>
            <span className={lbl}>Nature du jugement</span>
            <p className={val}>{ligne.typeJugement ?? '—'}</p>
            <span className={lbl}>Date du jugement</span>
            <p className="text-sm text-gray-800">{fmtDate(ligne.dateJugement)}</p>
          </div>
        </div>

        {/* Créance déclarée */}
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <div className="px-3 py-2 text-center" style={{ background: '#0E1A2B' }}>
            <p className="text-[11px] font-bold text-white uppercase tracking-wide">Créance déclarée</p>
            <p className="text-[10px] text-white/50 italic">Le décompte et la liste des pièces sont à joindre en annexe</p>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 text-left text-[10px] font-semibold text-gray-500 w-1/3"></th>
                <th className="border border-gray-200 px-3 py-2 text-center text-[10px] font-semibold text-gray-700">Créance chirographaire<br/><span className="font-normal text-gray-400">(sans privilège)</span></th>
                <th className="border border-gray-200 px-3 py-2 text-center text-[10px] font-semibold text-gray-700">Créance privilégiée</th>
                <th className="border border-gray-200 px-3 py-2 text-center text-[10px] font-semibold text-gray-700">Observations</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-3 py-2.5 font-semibold text-gray-800 bg-gray-50 text-[11px]">Montant échu</td>
                <td className="border border-gray-200 px-3 py-2.5 text-right font-mono text-gray-900">{fmtD(montantEchu)}</td>
                <td className="border border-gray-200 px-3 py-2.5"></td>
                <td className="border border-gray-200 px-3 py-2.5 text-[10px] text-gray-400">Factures échues au {todayFr()}</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-3 py-2.5 font-semibold text-gray-800 bg-gray-50 text-[11px]">Montant à échoir</td>
                <td className="border border-gray-200 px-3 py-2.5 text-right font-mono text-gray-900">{fmtD(montantAEchoir)}</td>
                <td className="border border-gray-200 px-3 py-2.5"></td>
                <td className="border border-gray-200 px-3 py-2.5 text-[10px] text-gray-400">Factures à échéance future</td>
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
          <div className="space-y-2 text-sm">
            <div><span className={lbl}>Fait à</span><p className={val}>{[org?.ville, org?.code_postal].filter(Boolean).join(' – ') || '—'}</p></div>
            <div><span className={lbl}>Le</span><p className={val}>{todayFr()}</p></div>
            <div><span className={lbl}>Nom et qualité du signataire</span><p className={val}>{signataire || '—'}</p></div>
            <p className="text-xs text-gray-600 pt-1">
              requiert l'admission de sa créance pour un montant total de{' '}
              <span className="font-bold text-gray-900">{fmtD(montantTotal || totalTtc)}</span> T.T.C.
            </p>
            <p className="text-[10px] text-gray-400 italic">Certifié sincère — SIGNATURE</p>
          </div>
          <div className="border border-gray-300 rounded-lg p-3 min-h-[100px]">
            <p className="text-[10px] font-bold text-gray-900 uppercase mb-2 pb-1 border-b border-gray-200">Représentant des créanciers</p>
            <p className="text-xs text-gray-400 italic">À compléter — coordonnées du mandataire judiciaire</p>
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {saving ? 'Génération…' : `Télécharger PDF${versions.length > 0 ? ` (v${(versions[0]?.version_number ?? 0) + 1})` : ''}`}
        </button>
      </div>

    </div>
  )
}
