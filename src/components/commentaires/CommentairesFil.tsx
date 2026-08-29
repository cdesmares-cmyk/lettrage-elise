// Fil de commentaires internes — client, facture, relance…
import { useState, useRef, useCallback, type ChangeEvent, type KeyboardEvent } from 'react'
import { useCommentaires } from '../../hooks/useCommentaires'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import type { Commentaire, ContexteCommentaire, MembreOrg } from '../../types/commentaire'
import type { FactureDetail } from '../../types/client'

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

function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function renderCorps(texte: string, membres: MembreOrg[], facturesActives: FactureDetail[]) {
  const parts = texte.split(/(@[^\s@,.:;!?]+|#[^\s#,.:;!?]+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const slug = normaliser(part.slice(1))
      const m = membres.find(x => normaliser(x.prenom ?? '') === slug || normaliser(x.nom) === slug)
      if (m) return <span key={i} style={{ color: m.couleur }} className="font-semibold">{part}</span>
    }
    if (part.startsWith('#')) {
      const piece = part.slice(1)
      const f = facturesActives.find(x => x.numero_piece === piece)
      if (f) {
        return (
          <a key={i} href={`/compte-client?client=${f.code_client}`} target="_blank" rel="noopener noreferrer"
            className="text-[#3BA89F] font-mono font-medium text-[11px] bg-[#3BA89F]/10 px-1 rounded hover:underline cursor-pointer">
            {part}
          </a>
        )
      }
      return <span key={i} className="text-[#3BA89F] font-mono font-medium text-[11px] bg-[#3BA89F]/10 px-1 rounded">{part}</span>
    }
    return <span key={i}>{part}</span>
  })
}

function detecterMention(texte: string, cursor: number) {
  const avant = texte.slice(0, cursor)
  const match = avant.match(/(?:^|[\s\n])(@[^\s@]*)$/)
  if (!match) return null
  return { debut: avant.lastIndexOf('@'), query: match[1].slice(1) }
}

function detecterCommande(texte: string, cursor: number) {
  const avant = texte.slice(0, cursor)
  const match = avant.match(/(?:^|[\s\n])(\/[^\s/]*)$/)
  if (!match) return null
  return { debut: avant.lastIndexOf('/'), query: match[1].slice(1) }
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

// ── Zone de saisie ────────────────────────────────────────────────────────

interface ZoneSaisieProps {
  membres: MembreOrg[]
  facturesActives: FactureDetail[]
  onEnvoyer: (texte: string, mentions: string[], reponseA?: string | null) => Promise<boolean>
  reponseA?: string | null
  onAnnuler?: () => void
  envoi: boolean
  placeholder?: string
}

function ZoneSaisie({ membres, facturesActives, onEnvoyer, reponseA, onAnnuler, envoi, placeholder }: ZoneSaisieProps) {
  const [texte, setTexte]               = useState('')
  const [mentions, setMentions]         = useState<string[]>([])
  const [mentionInfo, setMentionInfo]   = useState<{ debut: number; query: string } | null>(null)
  const [commandeInfo, setCommandeInfo] = useState<{ debut: number; query: string } | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  const membresFiltres = mentionInfo
    ? membres.filter(m => {
        const q = normaliser(mentionInfo.query)
        return normaliser(m.prenom ?? '').startsWith(q) || normaliser(m.nom).startsWith(q) ||
               `${normaliser(m.prenom ?? '')} ${normaliser(m.nom)}`.includes(q)
      }).slice(0, 5)
    : []

  const facturesFiltrees = commandeInfo
    ? facturesActives.filter(f => {
        const q = normaliser(commandeInfo.query)
        return normaliser(f.numero_piece).includes(q) ||
               normaliser(f.nom_client ?? '').includes(q) ||
               normaliser(f.code_client).includes(q)
      }).slice(0, 6)
    : []

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    const cursor = e.target.selectionStart ?? val.length
    setTexte(val)
    setMentionInfo(detecterMention(val, cursor))
    setCommandeInfo(detecterCommande(val, cursor))
  }

  function insererMembre(m: MembreOrg) {
    if (!mentionInfo || !ref.current) return
    const token = `@${tokenMembre(m)} `
    const avant = texte.slice(0, mentionInfo.debut) + token
    const apres = texte.slice(ref.current.selectionStart ?? texte.length)
    setTexte(avant + apres)
    setMentions(prev => prev.includes(m.id) ? prev : [...prev, m.id])
    setMentionInfo(null)
    setTimeout(() => { ref.current?.focus(); ref.current?.setSelectionRange(avant.length, avant.length) }, 0)
  }

  function insererFacture(f: FactureDetail) {
    if (!commandeInfo || !ref.current) return
    const token = `#${f.numero_piece} `
    const avant = texte.slice(0, commandeInfo.debut) + token
    const apres = texte.slice(ref.current.selectionStart ?? texte.length)
    setTexte(avant + apres)
    setCommandeInfo(null)
    setTimeout(() => { ref.current?.focus(); ref.current?.setSelectionRange(avant.length, avant.length) }, 0)
  }

  async function handleEnvoyer() {
    const t = texte.trim()
    if (!t || envoi) return
    const ok = await onEnvoyer(t, mentions, reponseA)
    if (ok) { setTexte(''); setMentions([]); setMentionInfo(null); setCommandeInfo(null) }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleEnvoyer() }
    if (e.key === 'Escape') { setMentionInfo(null); setCommandeInfo(null); onAnnuler?.() }
  }

  return (
    <div>
      <div className="relative">
        <textarea
          ref={ref}
          className="w-full text-xs border border-gray-200 rounded-lg p-2.5 resize-none focus:outline-none focus:border-[#4CC5BB] transition-colors placeholder-gray-300"
          rows={2}
          placeholder={placeholder ?? 'Ajouter un commentaire… (@membre · /facture · Ctrl+Entrée)'}
          value={texte}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        {mentionInfo && membresFiltres.length > 0 && (() => {
          const haut = !!ref.current && ref.current.getBoundingClientRect().bottom > window.innerHeight - 220
          return (
            <div className={`absolute ${haut ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden`}>
              {membresFiltres.map(m => (
                <button key={m.id} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-left transition-colors"
                  onMouseDown={e => { e.preventDefault(); insererMembre(m) }}>
                  <Avatar initiales={m.initiales} couleur={m.couleur} size={20} />
                  <span className="text-xs text-gray-700">{m.prenom ? `${m.prenom} ${m.nom}` : m.nom}</span>
                </button>
              ))}
            </div>
          )
        })()}
        {commandeInfo && facturesFiltrees.length > 0 && (() => {
          const haut = !!ref.current && ref.current.getBoundingClientRect().bottom > window.innerHeight - 260
          return (
            <div className={`absolute ${haut ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden`}>
              <p className="px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Factures impayées</p>
              {facturesFiltrees.map(f => (
                <button key={f.numero_piece} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-left transition-colors"
                  onMouseDown={e => { e.preventDefault(); insererFacture(f) }}>
                  <span className="font-mono text-[11px] text-[#3BA89F] font-semibold flex-shrink-0">{f.numero_piece}</span>
                  <span className="text-[11px] text-gray-500 truncate flex-1">{f.nom_client}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    {f.montant_ttc?.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                  </span>
                </button>
              ))}
            </div>
          )
        })()}
      </div>
      <div className="flex items-center justify-end gap-3 mt-1.5">
        {onAnnuler && (
          <button onClick={onAnnuler} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">Annuler</button>
        )}
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

// ── Bulle commentaire ─────────────────────────────────────────────────────

interface BulleProps {
  c: Commentaire
  membres: MembreOrg[]
  facturesActives: FactureDetail[]
  moiId: string
  repondantAId: string | null
  envoyer: (texte: string, mentions: string[], reponseA?: string | null) => Promise<boolean>
  envoi: boolean
  onOuvrirReponse: (id: string) => void
  onFermerReponse: () => void
  onModifier: (id: string, texte: string) => Promise<boolean>
  onSupprimer: (id: string) => Promise<boolean>
}

function Bulle({ c, membres, facturesActives, moiId, repondantAId, envoyer, envoi,
                 onOuvrirReponse, onFermerReponse, onModifier, onSupprimer }: BulleProps) {
  const [editing, setEditing]     = useState(false)
  const [texteEdit, setTexteEdit] = useState(c.corps_texte)
  const [expanded, setExpanded]   = useState(true)
  const estMoi        = c.auteur_id === moiId
  const estEnReponse  = repondantAId === c.id
  const m             = membres.find(x => x.id === c.auteur_id)
  const initiales     = m?.initiales ?? c.auteur_nom.slice(0, 2).toUpperCase()
  const couleur       = m?.couleur   ?? '#888'
  const nbReponses    = c.reponses?.length ?? 0

  async function validerEdition() {
    const ok = await onModifier(c.id, texteEdit.trim())
    if (ok) setEditing(false)
  }

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
            <textarea className="w-full text-xs border border-[#4CC5BB] rounded-md p-2 resize-none focus:outline-none" rows={2}
              value={texteEdit} onChange={e => setTexteEdit(e.target.value)} />
            <div className="flex gap-3 mt-1">
              <button onClick={validerEdition} className="text-[11px] text-[#3BA89F] font-medium hover:underline cursor-pointer">Enregistrer</button>
              <button onClick={() => setEditing(false)} className="text-[11px] text-gray-400 hover:underline cursor-pointer">Annuler</button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
            {renderCorps(c.corps_texte, membres, facturesActives)}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-1">
          <button onClick={() => estEnReponse ? onFermerReponse() : onOuvrirReponse(c.id)}
            className="text-[10px] text-gray-400 hover:text-[#3BA89F] cursor-pointer transition-colors">
            {estEnReponse ? 'Annuler' : 'Répondre'}
          </button>
          {estMoi && !editing && (
            <>
              <button onClick={() => { setEditing(true); setTexteEdit(c.corps_texte) }}
                className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">Modifier</button>
              <button onClick={() => onSupprimer(c.id)}
                className="text-[10px] text-gray-400 hover:text-red-500 cursor-pointer transition-colors">Supprimer</button>
            </>
          )}
          {nbReponses > 0 && (
            <button onClick={() => setExpanded(e => !e)}
              className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors ml-1">
              {expanded ? '▲ Masquer' : `▶ ${nbReponses} réponse${nbReponses > 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        {/* Zone de réponse inline — directement sous le commentaire ciblé */}
        {estEnReponse && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <ZoneSaisie
              membres={membres}
              facturesActives={facturesActives}
              onEnvoyer={async (texte, ments) => {
                const ok = await envoyer(texte, ments, c.id)
                if (ok) onFermerReponse()
                return ok
              }}
              onAnnuler={onFermerReponse}
              reponseA={c.id}
              envoi={envoi}
              placeholder={`Répondre à ${c.auteur_nom}…`}
            />
          </div>
        )}

        {/* Réponses imbriquées */}
        {nbReponses > 0 && expanded && (
          <div className={`mt-2 pl-3 flex flex-col gap-2.5 transition-colors ${
            estEnReponse ? 'border-l-[3px] border-[#4CC5BB]' : 'border-l-2 border-gray-100'
          }`}>
            {c.reponses!.map(r => (
              <Bulle key={r.id} c={r} membres={membres} facturesActives={facturesActives}
                moiId={moiId} repondantAId={repondantAId} envoyer={envoyer} envoi={envoi}
                onOuvrirReponse={() => onOuvrirReponse(c.id)}
                onFermerReponse={onFermerReponse}
                onModifier={onModifier} onSupprimer={onSupprimer}
              />
            ))}
          </div>
        )}
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
  const { membresOrg, facturesActives } = useAppData()
  const { utilisateur } = useAuth()
  const [repondantAId, setRepondantAId] = useState<string | null>(null)

  const handleEnvoyer = useCallback(
    (texte: string, mentions: string[], reponseA?: string | null) => envoyer(texte, mentions, reponseA),
    [envoyer]
  )

  if (chargement && commentaires.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Chargement…</div>
  }

  return (
    <>
      {/* Fil scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {commentaires.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-3">Aucun commentaire pour l'instant.</p>
        ) : (
          commentaires.map(c => (
            <Bulle
              key={c.id}
              c={c}
              membres={membresOrg}
              facturesActives={facturesActives}
              moiId={utilisateur?.id ?? ''}
              repondantAId={repondantAId}
              envoyer={handleEnvoyer}
              envoi={envoi}
              onOuvrirReponse={setRepondantAId}
              onFermerReponse={() => setRepondantAId(null)}
              onModifier={modifier}
              onSupprimer={supprimer}
            />
          ))
        )}
      </div>
      {/* Zone nouveau commentaire (racine) — toujours visible en bas */}
      <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4">
        <ZoneSaisie
          membres={membresOrg}
          facturesActives={facturesActives}
          onEnvoyer={handleEnvoyer}
          envoi={envoi}
        />
      </div>
    </>
  )
}
