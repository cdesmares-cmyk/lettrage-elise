// Composant pagination partagé : centré, 5 pages max, flèches gauche/droite
interface Props {
  page: number
  total: number
  onChange: (p: number) => void
}

function fenetre(page: number, total: number): number[] {
  const MAX = 5
  if (total <= MAX) return Array.from({ length: total }, (_, i) => i)
  let start = Math.max(0, page - 2)
  const end = Math.min(total - 1, start + MAX - 1)
  start = Math.max(0, end - MAX + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

export function Pagination({ page, total, onChange }: Props) {
  if (total <= 1) return null
  const pages = fenetre(page, total)

  return (
    <div className="flex items-center justify-center gap-1 px-4 py-3 border-t border-gray-100 bg-gray-50">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        className="w-7 h-7 flex items-center justify-center text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        ‹
      </button>
      {pages[0] > 0 && (
        <>
          <button onClick={() => onChange(0)} className="w-7 h-7 flex items-center justify-center text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">1</button>
          {pages[0] > 1 && <span className="text-xs text-gray-300 px-0.5">…</span>}
        </>
      )}
      {pages.map(i => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={`w-7 h-7 flex items-center justify-center text-xs font-medium rounded border transition-colors ${
            i === page ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600'
          }`}
        >
          {i + 1}
        </button>
      ))}
      {pages[pages.length - 1] < total - 1 && (
        <>
          {pages[pages.length - 1] < total - 2 && <span className="text-xs text-gray-300 px-0.5">…</span>}
          <button onClick={() => onChange(total - 1)} className="w-7 h-7 flex items-center justify-center text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">{total}</button>
        </>
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === total - 1}
        className="w-7 h-7 flex items-center justify-center text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        ›
      </button>
    </div>
  )
}
