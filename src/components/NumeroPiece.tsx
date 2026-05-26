import { useState } from 'react'
import toast from 'react-hot-toast'

interface Props {
  numero: string
  className?: string
}

export function NumeroPiece({ numero, className = '' }: Props) {
  const [copied, setCopied] = useState(false)

  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(numero).then(() => {
      setCopied(true)
      toast.success(`Copié : ${numero}`, { duration: 1500 })
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <span className={`inline-flex items-center gap-1 group ${className}`}>
      <span className="cursor-copy select-none" onClick={copy} title="Cliquer pour copier">
        {numero}
      </span>
      <button
        onClick={copy}
        title="Copier le numéro"
        className={`inline-flex items-center justify-center w-4 h-4 rounded transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 ${
          copied ? 'text-emerald-500' : 'text-gray-300 hover:text-ockham-teal'
        }`}
      >
        {copied ? (
          <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3 3 7-7" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" stroke="currentColor" strokeWidth={1.8}>
            <rect x="5" y="5" width="8" height="8" rx="1.5" />
            <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </span>
  )
}
