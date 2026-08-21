import { useMemo } from 'react'
import { etatVue, SEUIL_SANS_SUITE_DEFAUT } from '../../hooks/useRelances'
import type { Relance } from '../../hooks/useRelances'

function fmtEuros(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`
  if (n >= 10_000) return `${Math.round(n / 1_000)} k€`
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function fmtPct(n: number) {
  return `${Math.round(n)} %`
}

interface Props {
  relances: Relance[]
  filtreOp: string
  chargement?: boolean
  seuilSansSuite?: number
  facturesMapRelancesRelances: Map<string, { reste_du: number; montant_ttc: number }>
}

export function BarreKpisRelances({ relances, filtreOp, chargement, seuilSansSuite = SEUIL_SANS_SUITE_DEFAUT, facturesMapRelancesRelances }: Props) {

  const kpis = useMemo(() => {
    const base = relances.filter(r =>
      !r.archivee &&
      r.statut !== 'brouillon' &&
      r.envoyee_le != null &&
      (filtreOp === 'tous' || r.operateur_id === filtreOp)
    )

    // Déduplication par client — on garde la relance la plus récente par code_client
    const parClient = new Map<string, Relance>()
    for (const r of base) {
      const existing = parClient.get(r.code_client)
      if (!existing || r.envoyee_le! > existing.envoyee_le!) parClient.set(r.code_client, r)
    }
    const dedup = [...parClient.values()]

    const soldeCourant = (r: Relance) =>
      (r.factures_ids ?? []).reduce((s, id) => s + (facturesMapRelances.get(id)?.reste_du ?? 0), 0)

    const enCours    = dedup.filter(r => etatVue(r, facturesMapRelances, seuilSansSuite) === 'en_cours')
    const payees     = dedup.filter(r => etatVue(r, facturesMapRelances, seuilSansSuite) === 'payee')
    const sansSuite  = dedup.filter(r => etatVue(r, facturesMapRelances, seuilSansSuite) === 'sans_suite')

    const montantEnCours   = enCours.reduce((s, r) => s + soldeCourant(r), 0)
    const montantSansSuite = sansSuite.reduce((s, r) => s + soldeCourant(r), 0)

    // Montant encaissé = ce qui a été réglé depuis l'envoi (snapshot − reste actuel)
    const montantEncaisse = payees.reduce((s, r) => s + Math.max(0, r.solde_snapshot - soldeCourant(r)), 0)

    // Taux de recouvrement = encaissé / (encaissé + en cours + sans suite)
    const totalMasse = montantEncaisse + montantEnCours + montantSansSuite
    const tauxRecouvrement = totalMasse > 0 ? (montantEncaisse / totalMasse) * 100 : 0

    return { enCours, payees, sansSuite, montantEnCours, montantSansSuite, montantEncaisse, tauxRecouvrement }
  }, [relances, filtreOp, facturesMapRelances, seuilSansSuite])

  const cls = chargement ? 'opacity-40 pointer-events-none' : ''

  return (
    <div className={`grid grid-cols-3 gap-3 ${cls}`}>

      {/* En cours — teal */}
      <div className="bg-white rounded-xl px-5 py-4 shadow-sm" style={{ border: '1px solid #CFEDE9', borderLeftWidth: 3, borderLeftColor: '#4CC5BB' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">En cours</p>
        <p className="font-extrabold tabular-nums leading-tight" style={{ fontSize: 26, color: '#3BA89F' }}>
          {fmtEuros(kpis.montantEnCours)}
        </p>
        <p className="text-[11px] text-gray-400 mt-1.5">
          {kpis.enCours.length} client{kpis.enCours.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Payées — vert */}
      <div className="bg-white rounded-xl px-5 py-4 shadow-sm" style={{ border: '1px solid #D1FAE5', borderLeftWidth: 3, borderLeftColor: '#10B981' }}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Payées</p>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#D1FAE5', color: '#059669' }}>
            {fmtPct(kpis.tauxRecouvrement)}
          </span>
        </div>
        <p className="font-extrabold tabular-nums leading-tight" style={{ fontSize: 26, color: '#059669' }}>
          {fmtEuros(kpis.montantEncaisse)}
        </p>
        <p className="text-[11px] text-gray-400 mt-1.5">
          {kpis.payees.length} client{kpis.payees.length !== 1 ? 's' : ''} · taux recouvrement
        </p>
      </div>

      {/* Sans suite — cuivre */}
      <div className="bg-white rounded-xl px-5 py-4 shadow-sm" style={{ border: '1px solid #F5E9D8', borderLeftWidth: 3, borderLeftColor: '#C07840' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Sans suite</p>
        <p className="font-extrabold tabular-nums leading-tight" style={{ fontSize: 26, color: '#C07840' }}>
          {fmtEuros(kpis.montantSansSuite)}
        </p>
        <p className="text-[11px] text-gray-400 mt-1.5">
          {kpis.sansSuite.length} client{kpis.sansSuite.length !== 1 ? 's' : ''} sans réponse
        </p>
      </div>

    </div>
  )
}
