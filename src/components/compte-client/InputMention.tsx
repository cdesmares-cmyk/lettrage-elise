import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

export interface Membre {
  id:     string
  nom:    string
  prenom: string
  email:  string
}

interface Props {
  value:            string
  onChange:         (v: string) => void
  invites:          Membre[]
  onInvitesChange:  (m: Membre[]) => void
  placeholder?:     string
}

export function InputMention({ value, onChange, invites, onInvitesChange, placeholder }: Props) {
  const [membres,  setMembres]  = useState<Membre[]>([])
  const [query,    setQuery]    = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.rpc('get_membres_org').then(({ data }) => {
      setMembres((data as Membre[] | null) ?? [])
    })
  }, [])

  function detectQuery(text: string, cursor: number) {
    const before = text.slice(0, cursor)
    const match  = before.match(/@([\wÀ-ž]{0,25})$/)
    setQuery(match ? match[1] : null)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value)
    detectQuery(e.target.value, e.target.selectionStart)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab' && query !== null && filtered.length > 0) {
      e.preventDefault()
      selectionnerMembre(filtered[0])
    }
  }

  function handleKeyUp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') { setQuery(null); return }
    detectQuery(e.currentTarget.value, e.currentTarget.selectionStart)
  }

  function selectionnerMembre(m: Membre) {
    const ta = textareaRef.current
    if (!ta) return
    const cursor = ta.selectionStart
    const text   = ta.value
    const before = text.slice(0, cursor)
    const after  = text.slice(cursor)
    const prenom = m.prenom || m.nom.split(' ')[0]
    const newBefore = before.replace(/@([\wÀ-ž]{0,25})$/, `@${prenom} `)
    onChange(newBefore + after)
    if (!invites.find(i => i.id === m.id)) onInvitesChange([...invites, m])
    setQuery(null)
    setTimeout(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = newBefore.length
    }, 0)
  }

  const filtered = query !== null
    ? membres.filter(m => {
        const name = `${m.prenom} ${m.nom}`.toLowerCase()
        return name.includes(query.toLowerCase()) && !invites.find(i => i.id === m.id)
      }).slice(0, 5)
    : []

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        placeholder={placeholder}
        rows={2}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none outline-none focus:border-ockham-teal transition-colors"
      />

      {/* Dropdown @mention */}
      {query !== null && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
          {filtered.map(m => (
            <button
              key={m.id}
              onMouseDown={() => selectionnerMembre(m)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-ockham-teal/10 text-ockham-teal text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {((m.prenom || m.nom)[0] ?? '?').toUpperCase()}
              </span>
              <span className="text-sm font-medium text-gray-700">{m.prenom} {m.nom}</span>
              <span className="text-[11px] text-gray-400 ml-auto truncate max-w-[160px]">{m.email}</span>
            </button>
          ))}
          <p className="text-[9px] text-gray-300 px-3 py-1 border-t border-gray-100">Tapez @ pour mentionner un collègue et l'inviter</p>
        </div>
      )}

      {/* Chips invités */}
      {invites.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {invites.map(m => (
            <span key={m.id} className="flex items-center gap-1 bg-ockham-teal/10 border border-ockham-teal/20 text-ockham-teal text-[11px] font-semibold px-2 py-0.5 rounded-full">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              {m.prenom || m.nom}
              <button
                onClick={() => onInvitesChange(invites.filter(i => i.id !== m.id))}
                className="text-ockham-teal/50 hover:text-ockham-teal ml-0.5 leading-none"
              >×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
