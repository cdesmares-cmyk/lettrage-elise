// Fil de commentaires internes — utilisable dans tous les contextes (client, facture, relance…)
import { useState, useRef, useCallback, type ChangeEvent, type KeyboardEvent } from 'react'
import { useCommentaires } from '../../hooks/useCommentaires'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { IcX } from '../Icones'
import type { Commentaire, ContexteCommentaire, MembreOrg } from '../../types/commentaire'

// ── Helpers ───────────────────────────────────────────────────────────────

function tempsRelatif(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'maintenant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h}h`
  const j = Math.floor(h / 24)
  return j === 1 ? 'hier' : `il y a ${j}j`
}

function tokenMembre(m: MembreOrg): string { return m.prenom ?? m.nom }

function normaliserRecherche(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function renderCorps(texte: string, membres: MembreOrg[]) {
  const parts = texte.split(/(@[^\s@,.:;!?]+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const slug = normaliserRecherche(part.slice(1))
      const m = membres.find(x =>
        normaliserRecherche(x.prenom ?? '') === slug || normaliserRecherche(x.nom) === slug
      )
      if (m) return <span key={i} style={{ color: m.couleur }} className="font-semibold">{part}</span>
    }
    return <span key={i}>{part}</span>
  })
}

function detecterMention(texte: string, cursor: number): { debut: number; query: string } | null {
  const avant = texte.slice(0, cursor)
  const match = avant.match(/(?:^|[\s\n])(@[^\s@]*)$/)
  if (!match) return null
  const debut = avant.lastIndexOf('@')
  return { debut, query: match[1].slice(1) }
}

// ── Avatar ────────────────────────────────────────────────────────────────

function Avatar({ initiales, couleur, size = 28 }: { initiales: string; couleur: string; size?: number }) {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-semibold select-none"
      style={{ width: size, height: size, background: couleur, fontSize: Math.round(size * 0.38) }}
    >
      {initiales}
    </div>
  )
}

// ── Bulle commentaire ─────────────────────────────────────────────────────

interface BulleProps {
  c: Commentaire
  membres: MembreOrg[]
  moiId: string
  reponseActive: string | null
  onRepondre: (id: string, nomAuteur: string) => void
  onModifier: (id: string, texte: string, mentions: string[]) => Promise<boolean>
  onSupprimer: (id: string) => Promise<boolean>
}

function Bulle({ c, membres, moiId, reponseActive, onRepondre, onModifier, onSupprimer }: BulleProps) {
  const [editing, setEditing]     = useState(false)
  const [texteEdit, setTexteEdit] = useState(c.corps_texte)
  const [expanded, setExpanded]   = useState(true)
  const estMoi  = c.auteur_id === moiId
  const estActif = reponseActive === c.id
  const m       = membres.find(x => x.id === c.auteur_id)
  const initiales = m?.initiales ?? c.auteur_nom.slice(0, 2).toUpperCase()
  const couleur   = m?.couleur   ?? '#888'

  async function validerEdition() {
    const ok = await onModifier(c.id, texteEdit.trim(), c.mentions)
    if (ok) setEditing(false)
  }

  const nbReponses = c.reponses?.length ?? 0

  return (
    <div className="flex gap-2">
      <Avatar initiales={initiales} couleur={couleur} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-800">{c.auteur_nom}</span>
          <span className="text-[10px] text-gray-400">{tempsRelatif(c.cree_le)}</span>
        </div>

        {editing ? (
          <div className="mt-1">
            <textarea
              className="w-full text-xs border border-[#4CC5BB] rounded-md p-2 resize-none focus:outline-none"
              rows={2}
              value={texteEdit}
              onChange={e => setTexteEdit(e.target.value)}
            />
            <div className="flex gap-3 mt-1">
              <button onClick={validerEdition} className="text-[11px] text-[#3BA89F] font-medium hover:underline cursor-pointer">Enregistrer</button>
              <button onClick={() => setEditing(false)} className="text-[11px] text-gray-400 hover:underline cursor-pointer">Annuler</button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
            {renderCorps(c.corps_texte, membres)}
          </p>
        )}

        <div className="flex gap-3 mt-1">
          <button onClick={() => onRepondre(c.id, c.auteur_nom)} className="text-[10px] text-gray-400 hover:text-[#3BA89F] cursor-pointer transition-colors">Répondre</button>
          {estMoi && !editing && (
            <>
              <button onClick={() => { setEditing(true); setTexteEdit(c.corps_texte) }} className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">Modifier</button>
              <button onClick={() => onSupprimer(c.id)} className="text-[10px] text-gray-400 hover:text-red-500 cursor-pointer transition-colors">Supprimer</button>
            </>
          )}
          {nbReponses > 0 && (
            <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors ml-1">
              {expanded ? `▲ Masquer` : `▶ ${nbReponses} réponse${nbReponses > 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        {nbReponses > 0 && expanded && (
          <div className={`mt-2 pl-3 transition-colors flex flex-col gap-2.5 ${
            estActif ? 'border-l-[3px] border-[#4CC5BB]' : 'border-l-2 border-gray-100'
          }`}>
            {c.reponses!.map(r => (
              <Bulle
                key={r.id}
                c={r}
                membres={membres}
                moiId={moiId}
                reponseActive={reponseActive}
                onRepondre={(_id, nom) => onRepondre(c.id, nom)}
                onModifier={onModifier}
                onSupprimer={onSupprimer}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Zone de saisie ────────────────────────────────────────────────────────

interface ZoneSaisieProps {
  membres: MembreOrg[]
  onEnvoyer: (texte: string, mentions: string[], reponseA?: string | null) => Promise<boolean>
  reponseA: string | null
  nomReponseA: string
  onAnnulerReponse: () => void
  envoi: boolean
}

function ZoneSaisie({ membres, onEnvoyer, reponseA, nomReponseA, onAnnulerReponse, envoi }: ZoneSaisieProps) {
  const [texte, setTexte]               = useState('')
  const [mentions, setMentions]         = useState<string[]>([])
  const [mentionInfo, setMentionInfo]   = useState<{ debut: number; query: string } | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  const membresFiltres = mentionInfo
    ? membres.filter(m => {
        const q  = normaliserRecherche(mentionInfo.query)
        const p  = normaliserRecherche(m.prenom ?? '')
        const n  = normaliserRecherche(m.nom)
        return p.startsWith(q) || n.startsWith(q) || `${p} ${n}`.includes(q) || `${n} ${p}`.includes(q)
      }).slice(0, 5)
    : []

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setTexte(val)
    setMentionInfo(detecterMention(val, e.target.selectionStart ?? val.length))
  }

  function insererMention(m: MembreOrg) {
    if (!mentionInfo || !ref.current) return
    const token = `@${tokenMembre(m)}`
    const avant = texte.slice(0, mentionInfo.debut) + token + ' '
    const apres = texte.slice(ref.current.selectionStart ?? texte.length)
    const nouveau = avant + apres
    setTexte(nouveau)
    setMentions(prev => prev.includes(m.id) ? prev : [...prev, m.id])
    setMentionInfo(null)
    setTimeout(() => { ref.current?.focus(); ref.current?.setSelectionRange(avant.length, avant.length) }, 0)
  }

  async function handleEnvoyer() {
    const t = texte.trim()
    if (!t || envoi) return
    const ok = await onEnvoyer(t, mentions, reponseA)
    if (ok) { setTexte(''); setMentions([]); setMentionInfo(null) }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleEnvoyer() }
    if (e.key === 'Escape') setMentionInfo(null)
  }

  return (
    <div>
      {reponseA && (
        <div className="flex items-center gap-2 mb-2 text-[11px] text-gray-500 bg-gray-50 rounded-md px-2.5 py-1.5">
          <span>Répondre à <strong className="text-gray-700">{nomReponseA}</strong></span>
          <button onClick={onAnnulerReponse} className="ml-auto text-gray-400 hover:text-gray-600 cursor-pointer"><IcX size={10} /></button>
        </div>
      )}
      <div className="relative">
        <textarea
          ref={ref}
          className="w-full text-xs border border-gray-200 rounded-lg p-2.5 resize-none focus:outline-none focus:border-[#4CC5BB] transition-colors placeholder-gray-300"
          rows={2}
          placeholder="Ajouter un commentaire… (@membre · Ctrl+Entrée pour envoyer)"
          value={texte}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        {/* Dropdown @mention — s'ouvre vers le bas */}
        {mentionInfo && membresFiltres.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
            {membresFiltres.map(m => (
              <button
                key={m.id}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-left transition-colors"
                onMouseDown={e => { e.preventDefault(); insererMention(m) }}
              >
                <Avatar initiales={m.initiales} couleur={m.couleur} size={20} />
                <span className="text-xs text-gray-700">{m.prenom ? `${m.prenom} ${m.nom}` : m.nom}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end mt-1.5">
        <button
          onClick={handleEnvoyer}
          disabled={!texte.trim() || envoi}
          className="px-3 py-1.5 text-xs font-medium bg-[#0E1A2B] text-white rounded-lg disabled:opacity-40 hover:bg-[#1a2d47] transition-colors cursor-pointer"
        >
          {envoi ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────

export interface CommentairesFilProps {
  contexte: ContexteCommentaire
  contexteId: string
}

export function CommentairesFil({ contexte, contexteId }: CommentairesFilProps) {
  const { commentaires, chargement, envoi, envoyer, modifier, supprimer } = useCommentaires(contexte, contexteId)
  const { membresOrg } = useAppData()
  const { utilisateur } = useAuth()
  const [reponseA, setReponseA]       = useState<string | null>(null)
  const [nomReponseA, setNomReponseA] = useState('')

  const handleEnvoyer = useCallback(
    (texte: string, mentions: string[], reponseAId?: string | null) =>
      envoyer(texte, mentions, reponseAId),
    [envoyer]
  )

  function handleRepondre(id: string, nomAuteur: string) {
    setReponseA(id)
    setNomReponseA(nomAuteur)
  }

  if (chargement && commentaires.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Chargement…</div>
  }

  return (
    <>
      {/* Fil scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {commentaires.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-3">Aucun commentaire pour l'instant.</p>
        ) : (
          commentaires.map(c => (
            <Bulle
              key={c.id}
              c={c}
              membres={membresOrg}
              moiId={utilisateur?.id ?? ''}
              reponseActive={reponseA}
              onRepondre={handleRepondre}
              onModifier={modifier}
              onSupprimer={supprimer}
            />
          ))
        )}
      </div>
      {/* Zone saisie — fixe en bas, hors du scroll */}
      <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4">
        <ZoneSaisie
          membres={membresOrg}
          onEnvoyer={handleEnvoyer}
          reponseA={reponseA}
          nomReponseA={nomReponseA}
          onAnnulerReponse={() => { setReponseA(null); setNomReponseA('') }}
          envoi={envoi}
        />
      </div>
    </>
  )
}
