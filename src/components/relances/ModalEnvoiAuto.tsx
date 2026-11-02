// Détail d'un envoi du robot.
//
// Le journal stocke `corps_html`, c'est-à-dire l'email exactement tel qu'il est
// parti. On le montre : savoir qu'une relance a été envoyée vaut moins que
// pouvoir relire ce que le client a reçu, surtout quand il rappelle pour en
// discuter.
import { useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useState, useEffect } from 'react'
import { IcLoader, IcX } from '../Icones'
import type { EnvoiAuto } from '../../hooks/useRelances'

interface Props {
  envoi: EnvoiAuto | null
  nomClient: string
  onFermer: () => void
}

function euros(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function dateHeure(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function ModalEnvoiAuto({ envoi, nomClient, onFermer }: Props) {
  // Indexé par clé d'envoi plutôt qu'une valeur unique : l'effet n'écrit alors
  // qu'au retour de la requête, jamais pendant le rendu. Et rouvrir un envoi
  // déjà consulté est instantané.
  const [corpsParCle, setCorpsParCle] = useState<Map<string, string | null>>(new Map())

  const cleRecherche = envoi?.cle ?? null

  // Le corps de l'email n'est pas chargé avec la liste : c'est du HTML complet,
  // inutile de le tirer pour des centaines d'envois qu'on n'ouvrira pas.
  useEffect(() => {
    if (!envoi || corpsParCle.has(envoi.cle)) return
    const requete = envoi.cle.includes('|')
      ? supabase.from('relances_auto_log').select('corps_html')
          .eq('code_client', envoi.code_client).eq('envoye_le', envoi.envoye_le).limit(1)
      : supabase.from('relances_auto_log').select('corps_html')
          .eq('resend_id', envoi.cle).limit(1)
    requete.then(({ data }) => {
      const row = (data ?? [])[0] as { corps_html: string | null } | undefined
      setCorpsParCle(prev => new Map(prev).set(envoi.cle, row?.corps_html ?? null))
    })
  }, [cleRecherche, envoi, corpsParCle])

  const corps      = cleRecherche ? corpsParCle.get(cleRecherche) ?? null : null
  const chargement = !!cleRecherche && !corpsParCle.has(cleRecherche)

  const statutLabel = useMemo(() => {
    if (!envoi) return ''
    return envoi.statut === 'envoye' ? 'Envoyé'
      : envoi.statut === 'bounce'    ? 'Rebond — le client n\'a rien reçu'
      : 'Erreur à l\'envoi'
  }, [envoi])

  if (!envoi) return null

  const statutStyle = envoi.statut === 'envoye' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : envoi.statut === 'bounce'                 ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">

        <div className="px-6 py-4 flex items-center justify-between" style={{ background: '#0E1A2B' }}>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">{nomClient}</h2>
            <p className="text-[11px] text-white/50 mt-0.5">
              Relance automatique · {dateHeure(envoi.envoye_le)}
            </p>
          </div>
          <button onClick={onFermer}
                  className="w-7 h-7 rounded-full border border-white/20 text-white/60 hover:bg-white/10 hover:text-white flex items-center justify-center flex-shrink-0">
            <IcX size={12} />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 grid grid-cols-3 gap-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Destinataire</p>
            <p className="text-xs text-gray-700 break-all">{envoi.contact_email ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Montant réclamé</p>
            <p className="text-sm font-bold text-gray-800 tabular-nums">{euros(envoi.montant_total)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Statut</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statutStyle}`}>
              {statutLabel}
            </span>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Factures relancées · {envoi.numeros.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {envoi.numeros.map(n => (
              <span key={n} className="text-[11px] font-mono font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                {n}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Message reçu par le client
          </p>
          {chargement ? (
            <div className="flex items-center gap-2 py-10 justify-center text-sm text-gray-400">
              <IcLoader size={14} /> Chargement du message…
            </div>
          ) : corps ? (
            // Le HTML vient de notre propre fonction d'envoi, pas d'une saisie
            // utilisateur : il est construit par buildHtml dans relance-auto.
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/40"
                 dangerouslySetInnerHTML={{ __html: corps }} />
          ) : (
            <p className="text-xs text-gray-400 py-8 text-center">
              Le corps du message n'a pas été conservé pour cet envoi.
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button onClick={onFermer}
                  className="w-full text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 py-2.5 rounded-lg transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
