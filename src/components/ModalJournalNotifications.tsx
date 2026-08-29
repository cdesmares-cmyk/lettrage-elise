// Journal de notifications — historique complet avec recherche, filtre, archivage
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Notification, ContexteCommentaire } from '../types/commentaire'

// ── Helpers ───────────────────────────────────────────────────────────────

const COLS_FULL = 'id, type, contexte, contexte_id, lu_le, archivee_le, cree_le, commentaire_id, commentaires(auteur_id, corps_texte, utilisateurs(nom, prenom))'

type RawNotif = {
  id: string; type: string; contexte: string; contexte_id: string
  lu_le: string | null; archivee_le: string | null; cree_le: string; commentaire_id: string
  commentaires: {
    auteur_id: string; corps_texte: string
    utilisateurs: { nom: string; prenom: string | null } | null
  } | null
}

function mapNotif(r: RawNotif): Notification {
  const u = r.commentaires?.utilisateurs
  const auteur_nom = u ? (u.prenom ? `${u.prenom} ${u.nom}` : u.nom) : 'Inconnu'
  return {
    id: r.id, type: r.type as Notification['type'],
    contexte: r.contexte as Notification['contexte'], contexte_id: r.contexte_id,
    lu_le: r.lu_le, archivee_le: r.archivee_le, cree_le: r.cree_le,
    auteur_nom, corps_extrait: (r.commentaires?.corps_texte ?? '').slice(0, 200),
    commentaire_id: r.commentaire_id,
  }
}

function tempsRelatif(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'maintenant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h}h`
  const j = Math.floor(h / 24)
  if (j < 30) return j === 1 ? 'hier' : `il y a ${j}j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const LIBELLES_CONTEXTE: Record<string, string> = {
  client: 'Client', facture: 'Facture', relance: 'Relance', procedure: 'Procédure',
}

const FILTRES_CONTEXTE: { val: ContexteCommentaire | 'tous'; label: string }[] = [
  { val: 'tous',      label: 'Tous' },
  { val: 'client',    label: 'Client' },
  { val: 'facture',   label: 'Facture' },
  { val: 'relance',   label: 'Relance' },
  { val: 'procedure', label: 'Procédure' },
]

// ── Composant principal ───────────────────────────────────────────────────

interface Props { onFermer: () => void }

export function ModalJournalNotifications({ onFermer }: Props) {
  const { utilisateur } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [chargement, setChargement] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [filtreContexte, setFiltreContexte] = useState<ContexteCommentaire | 'tous'>('tous')

  const charger = useCallback(async () => {
    if (!utilisateur) return
    setChargement(true)
    const { data } = await supabase
      .from('notifications')
      .select(COLS_FULL)
      .order('cree_le', { ascending: false })
      .limit(200)
    setNotifications((data ?? []).map(r => mapNotif(r as unknown as RawNotif)))
    setChargement(false)
  }, [utilisateur])

  useEffect(() => { charger() }, [charger])

  // Fermer sur Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFermer])

  const notifsFiltrees = notifications.filter(n => {
    if (filtreContexte !== 'tous' && n.contexte !== filtreContexte) return false
    if (!recherche.trim()) return true
    const q = normaliser(recherche)
    return normaliser(n.corps_extrait).includes(q) || normaliser(n.auteur_nom).includes(q)
  })

  const nonArchiveesLues = notifications.filter(n => n.lu_le && !n.archivee_le).length

  function handleNaviguer(n: Notification) {
    onFermer()
    if (n.contexte === 'client') navigate(`/compte-client?client=${n.contexte_id}&onglet=commentaires`)
    else if (n.contexte === 'facture') navigate(`/compte-client?facture=${n.contexte_id}`)
    else if (n.contexte === 'relance') navigate('/relances')
    else if (n.contexte === 'procedure') navigate('/procedures')
  }

  async function archiverUne(id: string) {
    const ts = new Date().toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ archivee_le: ts } as never)
      .eq('id', id)
      .is('archivee_le', null)
    if (!error) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, archivee_le: ts } : n))
    }
  }

  async function archiverToutesLues() {
    const ts = new Date().toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ archivee_le: ts } as never)
      .not('lu_le', 'is', null)
      .is('archivee_le', null)
    if (!error) {
      setNotifications(prev => prev.map(n =>
        n.lu_le && !n.archivee_le ? { ...n, archivee_le: ts } : n
      ))
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onFermer} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
        <div className="pointer-events-auto w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-ockham-navy flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4CC5BB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              <p className="text-sm font-bold text-white">Journal de notifications</p>
            </div>
            <button onClick={onFermer}
              className="w-7 h-7 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-slate-300 text-sm flex items-center justify-center transition-colors cursor-pointer">
              ✕
            </button>
          </div>

          {/* Barre filtres */}
          <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0 space-y-2.5">
            {/* Recherche */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Rechercher dans les notifications…"
                value={recherche}
                onChange={e => setRecherche(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#4CC5BB] transition-colors"
              />
            </div>

            {/* Filtres contexte + action batch */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-1.5 flex-wrap">
                {FILTRES_CONTEXTE.map(f => (
                  <button
                    key={f.val}
                    onClick={() => setFiltreContexte(f.val)}
                    className={`px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-colors cursor-pointer ${
                      filtreContexte === f.val
                        ? 'bg-ockham-teal text-white border-ockham-teal'
                        : 'text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {nonArchiveesLues > 0 && (
                <button
                  onClick={archiverToutesLues}
                  className="text-[10px] text-gray-400 hover:text-gray-600 whitespace-nowrap transition-colors cursor-pointer flex-shrink-0"
                >
                  Archiver les lues ({nonArchiveesLues})
                </button>
              )}
            </div>
          </div>

          {/* Liste */}
          <div className="flex-1 overflow-y-auto">
            {chargement ? (
              <div className="flex items-center justify-center py-12 text-xs text-gray-400">Chargement…</div>
            ) : notifsFiltrees.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-xs text-gray-400">
                {recherche || filtreContexte !== 'tous' ? 'Aucun résultat.' : 'Aucune notification.'}
              </div>
            ) : (
              notifsFiltrees.map(n => {
                const estArchivee = !!n.archivee_le
                const estLue = !!n.lu_le

                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-5 py-3 border-b border-gray-50 last:border-0 transition-colors ${
                      estArchivee ? 'opacity-40' : estLue ? 'hover:bg-gray-50' : 'bg-ockham-teal/[0.03] hover:bg-ockham-teal/[0.06]'
                    }`}
                  >
                    {/* Indicateur lu/non-lu */}
                    <div className="flex-shrink-0 mt-1.5">
                      {!estLue && !estArchivee
                        ? <span className="block w-1.5 h-1.5 rounded-full bg-ockham-teal" />
                        : <span className="block w-1.5 h-1.5" />
                      }
                    </div>

                    {/* Contenu cliquable */}
                    <button
                      onClick={() => handleNaviguer(n)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-[10px] font-bold text-ockham-teal uppercase tracking-wide">
                          {LIBELLES_CONTEXTE[n.contexte] ?? n.contexte}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {n.type === 'mention' ? '• @mention' : '• réponse'}
                        </span>
                        {estArchivee && (
                          <span className="text-[9px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            Archivé
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] leading-relaxed line-clamp-2 ${estArchivee ? 'text-gray-400' : 'text-gray-700'}`}>
                        {n.corps_extrait}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        <strong className="text-gray-500">{n.auteur_nom}</strong> · {tempsRelatif(n.cree_le)}
                      </p>
                    </button>

                    {/* Action archiver */}
                    {!estArchivee && (
                      <button
                        onClick={() => archiverUne(n.id)}
                        title="Archiver"
                        className="flex-shrink-0 mt-0.5 text-gray-300 hover:text-gray-500 transition-colors cursor-pointer"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/>
                          <line x1="10" y1="12" x2="14" y2="12"/>
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Footer stats */}
          <div className="px-5 py-2.5 border-t border-gray-100 flex-shrink-0 bg-gray-50">
            <p className="text-[10px] text-gray-400">
              {notifsFiltrees.length} notification{notifsFiltrees.length > 1 ? 's' : ''}
              {filtreContexte !== 'tous' || recherche ? ' (filtrées)' : ''}
              {' · '}{notifications.filter(n => !!n.archivee_le).length} archivée{notifications.filter(n => !!n.archivee_le).length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
