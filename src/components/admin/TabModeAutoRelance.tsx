// Onglet Mode Auto — paramètres de relance automatique au niveau organisation
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { IcWarning } from '../Icones'
import toast from 'react-hot-toast'
import { exporterRelancesAutoXls, type LigneRelanceAuto } from '../../lib/exportXls'

interface ParamsAuto {
  delai_echeance_jours: number
  delai_declenchement_relance_jours: number
  delai_rerelance_jours: number
  relance_auto_active: boolean
  signature_auto: string | null
  relance_auto_derniere_exec:   string | null
  relance_auto_dernier_statut:  'ok' | 'partiel' | 'erreur' | null
  relance_auto_dernier_message: string | null
}

function tempsRelatif(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const h     = Math.floor(diff / 3_600_000)
  if (h < 1)  return 'il y a moins d\'une heure'
  if (h < 24) return `il y a ${h} heure${h > 1 ? 's' : ''}`
  const j = Math.floor(h / 24)
  if (j === 1) return 'hier'
  return `il y a ${j} jours`
}

export function TabModeAutoRelance() {
  const { profil } = useAuth()
  const [params, setParams] = useState<ParamsAuto>({
    delai_echeance_jours: 30,
    delai_declenchement_relance_jours: 7,
    delai_rerelance_jours: 30,
    relance_auto_active: false,
    signature_auto: null,
    relance_auto_derniere_exec:   null,
    relance_auto_dernier_statut:  null,
    relance_auto_dernier_message: null,
  })
  const [chargement, setChargement] = useState(true)
  const [sauvegarde, setSauvegarde] = useState(false)
  const [exportEnCours, setExportEnCours] = useState(false)

  useEffect(() => {
    if (!profil?.organisation_id) return
    supabase
      .from('organisations')
      .select('delai_echeance_jours, delai_declenchement_relance_jours, delai_rerelance_jours, relance_auto_active, signature_auto, relance_auto_derniere_exec, relance_auto_dernier_statut, relance_auto_dernier_message')
      .eq('id', profil.organisation_id)
      .single()
      .then(({ data }) => {
        if (data) {
          const row = data as ParamsAuto
          setParams({
            delai_echeance_jours: row.delai_echeance_jours ?? 30,
            delai_declenchement_relance_jours: row.delai_declenchement_relance_jours ?? 7,
            delai_rerelance_jours: row.delai_rerelance_jours ?? 30,
            relance_auto_active: row.relance_auto_active ?? false,
            signature_auto: row.signature_auto ?? null,
            relance_auto_derniere_exec:   row.relance_auto_derniere_exec ?? null,
            relance_auto_dernier_statut:  row.relance_auto_dernier_statut ?? null,
            relance_auto_dernier_message: row.relance_auto_dernier_message ?? null,
          })
        }
        setChargement(false)
      })
  }, [profil?.organisation_id])

  async function exporterHistorique() {
    if (!profil?.organisation_id) return
    setExportEnCours(true)
    try {
      const { data: logs } = await supabase
        .from('relances_auto_log')
        .select('resend_id, envoye_le, code_client, contact_email, montant_total, statut')
        .eq('organisation_id', profil.organisation_id)
        .order('envoye_le', { ascending: false })
        .limit(2000)

      const { data: clientsData } = await supabase
        .from('clients')
        .select('code_dso, nom')
        .eq('organisation_id', profil.organisation_id)

      const nomParCode = Object.fromEntries((clientsData ?? []).map(c => [c.code_dso as string, c.nom as string]))

      // Grouper par resend_id — une ligne par email envoyé
      const groupes = (logs ?? []).reduce<Record<string, typeof logs>>((acc, row) => {
        const key = (row.resend_id as string | null) ?? (row as { id?: string }).id ?? String(Math.random())
        if (!acc[key]) acc[key] = []
        acc[key]!.push(row)
        return acc
      }, {})

      const lignes: LigneRelanceAuto[] = Object.values(groupes).map(rows => {
        const first = rows![0]!
        const statut = rows!.some(r => r.statut === 'bounce') ? 'bounce'
          : rows!.some(r => r.statut === 'erreur') ? 'erreur'
          : 'envoye'
        return {
          date: first.envoye_le as string,
          code_client: first.code_client as string,
          nom_client: nomParCode[first.code_client as string] ?? '',
          montant_total: first.montant_total as number | null,
          email_contact: first.contact_email as string | null,
          statut,
          nb_factures: rows!.length,
        }
      }).sort((a, b) => b.date.localeCompare(a.date))

      exporterRelancesAutoXls(lignes)
    } catch {
      toast.error('Erreur lors de l\'export.')
    } finally {
      setExportEnCours(false)
    }
  }

  async function sauvegarder() {
    if (!profil?.organisation_id) return
    setSauvegarde(true)
    try {
      const { error } = await supabase
        .from('organisations')
        .update(params as never)
        .eq('id', profil.organisation_id)
      if (error) throw error
      toast.success('Paramètres enregistrés.')
    } catch {
      toast.error('Erreur lors de la sauvegarde.')
    } finally {
      setSauvegarde(false)
    }
  }

  if (chargement) return <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Chargement…</div>

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
          <IcWarning size={13} className="flex-shrink-0" />
          Mode automatique — activation après configuration du cron
        </p>
        <p className="text-xs text-amber-600 mt-1">
          Les clients en procédure collective et ceux marqués "exclure" sont toujours ignorés.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Délai de paiement par défaut
        </label>
        <div className="flex items-center gap-3">
          <input type="number" min={1} max={120} value={params.delai_echeance_jours}
            onChange={e => setParams(p => ({ ...p, delai_echeance_jours: Math.max(1, parseInt(e.target.value) || 30) }))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal"
          />
          <span className="text-sm text-gray-500">jours net</span>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Terme contractuel pour calculer la date d'échéance si elle n'est pas renseignée sur la facture. Surchargeable par client dans le volet Options.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Délai avant première relance automatique
        </label>
        <div className="flex items-center gap-3">
          <input type="number" min={1} max={60} value={params.delai_declenchement_relance_jours}
            onChange={e => setParams(p => ({ ...p, delai_declenchement_relance_jours: Math.max(1, parseInt(e.target.value) || 7) }))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal"
          />
          <span className="text-sm text-gray-500">jours après échéance</span>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Une facture non réglée déclenche une relance X jours après son échéance calculée.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Délai minimum entre deux relances
        </label>
        <div className="flex items-center gap-3">
          <input type="number" min={7} max={90} value={params.delai_rerelance_jours}
            onChange={e => setParams(p => ({ ...p, delai_rerelance_jours: Math.max(7, parseInt(e.target.value) || 30) }))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal"
          />
          <span className="text-sm text-gray-500">jours (défaut : 30)</span>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Un client ne recevra pas deux relances auto en deçà de ce délai, même si de nouvelles factures sont éligibles.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Signature email automatique
        </label>
        <textarea
          rows={4}
          value={params.signature_auto ?? ''}
          onChange={e => setParams(p => ({ ...p, signature_auto: e.target.value || null }))}
          placeholder="Ex : Cordialement,&#10;Le service comptable&#10;[Nom organisation]"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal resize-none font-sans leading-relaxed"
        />
        <p className="text-[11px] text-gray-400 mt-1.5">
          Insérée après le corps du scénario. La balise [Nom organisation] est disponible.
        </p>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">Activer le mode automatique</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Les relances s'envoient sans intervention manuelle. Désactivable à tout moment.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
            <input type="checkbox" checked={params.relance_auto_active}
              onChange={e => setParams(p => ({ ...p, relance_auto_active: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-checked:bg-ockham-teal rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>
      </div>

      {/* ── Monitoring dernier passage cron ── */}
      <div className="border-t border-gray-100 pt-5 space-y-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Dernier passage cron</p>

        {/* Alerte silence — relance active mais pas de run depuis +25h */}
        {params.relance_auto_active && (
          !params.relance_auto_derniere_exec ||
          Date.now() - new Date(params.relance_auto_derniere_exec).getTime() > 25 * 3_600_000
        ) && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 flex-shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <p className="text-xs font-semibold text-red-700">
                {!params.relance_auto_derniere_exec
                  ? 'Les relances automatiques ne semblent pas encore actives.'
                  : 'Aucune exécution détectée depuis plus de 24h.'}
              </p>
              <p className="text-[11px] text-red-600 mt-0.5">
                Contactez le support OCKHAM pour qu'on vérifie la configuration — <span className="font-semibold">ctournebize@ockham-finance.com</span>
              </p>
            </div>
          </div>
        )}

        {/* Dernier run */}
        {params.relance_auto_derniere_exec ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-gray-700">
                {new Date(params.relance_auto_derniere_exec).toLocaleDateString('fr-FR', {
                  day: '2-digit', month: 'short', year: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })}
                <span className="ml-2 font-normal text-gray-400">
                  ({tempsRelatif(params.relance_auto_derniere_exec)})
                </span>
              </p>
              {params.relance_auto_dernier_message && (
                <p className="text-[11px] text-gray-500">{params.relance_auto_dernier_message}</p>
              )}
            </div>
            {params.relance_auto_dernier_statut && (
              <span className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                params.relance_auto_dernier_statut === 'ok'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : params.relance_auto_dernier_statut === 'partiel'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {params.relance_auto_dernier_statut === 'ok' ? '✓ OK'
                  : params.relance_auto_dernier_statut === 'partiel' ? '⚠ Partiel'
                  : '✕ Erreur'}
              </span>
            )}
          </div>
        ) : !params.relance_auto_active ? (
          <p className="text-[11px] text-gray-400 italic">Mode automatique désactivé — aucun historique.</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button onClick={exporterHistorique} disabled={exportEnCours}
          className="px-4 py-2 text-sm font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {exportEnCours ? 'Export…' : 'Exporter l\'historique'}
        </button>
        <button onClick={sauvegarder} disabled={sauvegarde}
          className="px-4 py-2 text-sm font-semibold bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors">
          {sauvegarde ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
