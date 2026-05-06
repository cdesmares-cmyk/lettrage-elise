// Bannière d'accueil contextuelle style JARVIS (Iron Man) — stats en temps réel
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Stats {
  nbImpayees: number | null
  dernierImport: string | null
}

interface RowImportDate { cree_le: string }

function getPrenom(email: string): string {
  const partie = email.split('@')[0]
  const mots = partie.split(/[._-]/)
  const prenom = mots[0] ?? partie
  return prenom.charAt(0).toUpperCase() + prenom.slice(1)
}

function getFormuleAccueil(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

export function BanniereJarvis() {
  const { utilisateur } = useAuth()
  const [stats, setStats] = useState<Stats>({ nbImpayees: null, dernierImport: null })

  useEffect(() => {
    async function chargerStats() {
      const [{ count }, resImport] = await Promise.all([
        supabase
          .from('v_factures_avec_reste_du')
          .select('*', { count: 'exact', head: true })
          .in('statut_paiement', ['impaye', 'partiel']),
        supabase
          .from('imports')
          .select('cree_le')
          .order('cree_le', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      const dernierImport = resImport.data as unknown as RowImportDate | null
      const dernier = dernierImport?.cree_le
        ? new Date(dernierImport.cree_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
        : null
      setStats({ nbImpayees: count ?? 0, dernierImport: dernier })
    }
    chargerStats()
  }, [])

  const prenom = utilisateur?.email ? getPrenom(utilisateur.email) : ''
  const formule = getFormuleAccueil()

  return (
    <div className="relative flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-xl px-6 py-4 mb-7 overflow-hidden">
      {/* Barre latérale dégradée */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-sky-400 to-blue-600 rounded-l-xl" />

      {/* Indicateur pulsant */}
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-400" />
      </span>

      {/* Texte */}
      <div className="flex-1 min-w-0">
        <p className="text-sky-400 text-[11px] font-semibold tracking-widest uppercase mb-0.5">
          J.A.R.V.I.S — Système opérationnel
        </p>
        <p className="text-slate-200 text-sm">
          {formule}{prenom && <>, <strong className="text-white font-semibold">{prenom}</strong></>}.{' '}
          {stats.dernierImport
            ? <>Dernier import le <strong className="text-white">{stats.dernierImport}</strong>.</>
            : 'Aucun import enregistré pour le moment.'
          }
          {stats.nbImpayees !== null && stats.nbImpayees > 0 && (
            <>{' '}<strong className="text-white">{stats.nbImpayees} facture{stats.nbImpayees > 1 ? 's' : ''}</strong> en attente de lettrage.</>
          )}
          {stats.nbImpayees === 0 && <>{' '}Aucune facture en attente — tout est à jour.</>}
        </p>
      </div>

      {/* Stat rapide */}
      {stats.nbImpayees !== null && (
        <div className="flex-shrink-0 text-right">
          <p className="text-white text-2xl font-bold tabular-nums leading-none">{stats.nbImpayees}</p>
          <p className="text-slate-500 text-[10px] font-medium uppercase tracking-wide mt-0.5">À lettrer</p>
        </div>
      )}
    </div>
  )
}
