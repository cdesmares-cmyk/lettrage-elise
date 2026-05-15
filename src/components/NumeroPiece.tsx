import { useState } from 'react'

interface Props {
  numero: string
  className?: string
}

export function NumeroPiece({ numero, className = '' }: Props) {
  const [copied, setCopied] = useState(false)

  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(numero)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <span
      onClick={copy}
      title="Cliquer pour copier"
      className={`cursor-copy select-none transition-colors ${copied ? '!text-emerald-500' : ''} ${className}`}
    >
      {numero}
    </span>
  )
}
