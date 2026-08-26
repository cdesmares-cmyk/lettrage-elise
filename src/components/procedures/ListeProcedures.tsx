import { useState, useRef, useEffect, useMemo } from 'react'
import type { ProcedureLigne } from '../../hooks/useProcedures'
import { Pagination } from '../Pagination'

// ─── Couleurs et labels — identiques à PanneauOptions.tsx ────────────────────
const STATUT: Record<string, { label: string; badge: string }> = {
  liquidation:  { label: 'Liquidation judiciaire',  badge: 'bg-red-50 text-red-700 border-red-200' },
  redressement: { label: 'Redressement judiciaire', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  sauvegarde:   { label: 'Sauvegarde',              badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  cloture:      { label: 'Clôture',                 badge: 'bg-gray-50 text-gray-500 border-gray-200' },
  radiation:    { label: 'Radiation',               badge: 'bg-gray-50 text-gray-500 border-gray-200' },
}

const PAGE_SIZE = 25

function IcBadge({ type }: { type: string }) {
  const cls = 'flex-shrink-0'
  if (type === 'liquidation')
    return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
  if (type === 'redressement')
    return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  if (type === 'sauvegarde')
    return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  if (type === 'cloture')
    return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  return null
}

function BadgeDeclaration({ statut, encours }: { statut: string | null; encours: number }) {
  if (encours < 0.01) return <span className="text-xs text-gray-300">—</span>
  if (!statut || statut === 'brouillon')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600 border border-red-100">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        À déclarer
      </span>
    )
  if (statut === 'declaree' || statut === 'acceptee')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-ockham-teal-muted text-ockham-teal-dark border border-ockham-teal/25">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        {statut === 'acceptee' ? 'Acceptée' : 'Déclarée'}
      </span>
    )
  if (statut === 'rejetee')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-100">Rejetée</span>
  return null
}

const fmtEuros = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

type ColSort = 'codeClient' | 'nom' | 'encours' | 'typeProcedure' | 'joursDepuis' | 'declarationStatut'

function trier(lignes: ProcedureLigne[], col: ColSort | null, dir: 'asc' | 'desc'): ProcedureLigne[] {
  if (!col) return lignes
  const mult = dir === 'asc' ? 1 : -1
  return [...lignes].sort((a, b) => {
    switch (col) {
      case 'codeClient':        return mult * a.codeClient.localeCompare(b.codeClient, 'fr')
      case 'nom':               return mult * a.nom.localeCompare(b.nom, 'fr')
      case 'encours':           return mult * (a.encours - b.encours)
      case 'typeProcedure':     return mult * a.typeProcedure.localeCompare(b.typeProcedure, 'fr')
      case 'joursDepuis':       return mult * (a.joursDepuis - b.joursDepuis)
      case 'declarationStatut': return mult * (a.declarationStatut ?? '').localeCompare(b.declarationStatut ?? '', 'fr')
      default: return 0
    }
  })
}

interface Props {
  lignes: ProcedureLigne[]
  chargement: boolean
  onOuvrirDetail: (l: ProcedureLigne) => void
}

export function ListeProcedures({ lignes, chargement, onOuvrirDetail }: Props) {
  const [colSort, setColSort]           = useState<ColSort | null>(null)
  const [dirSort, setDirSort]           = useState<'asc' | 'desc'>('asc')
  const [typesExclus, setTypesExclus]   = useState<Set<string>>(new Set())
  const [filtreOuvert, setFiltreOuvert] = useState(false)
  const [page, setPage]                 = useState(0)
  const refFiltre = useRef<HTMLDivElement>(null)

  const typesDisponibles = useMemo(() => [...new Set(lignes.map(l => l.typeProcedure))], [lignes])

  // Reset page quand tri, filtre ou données changent
  useEffect(() => { setPage(0) }, [colSort, dirSort, typesExclus, lignes])

  useEffect(() => {
    if (!filtreOuvert) return
    function onClic(e: MouseEvent) {
      if (refFiltre.current && !refFiltre.current.contains(e.target as Node)) setFiltreOuvert(false)
    }
    document.addEventListener('mousedown', onClic)
    return () => document.removeEventListener('mousedown', onClic)
  }, [filtreOuvert])

  function handleSort(col: ColSort) {
    if (colSort === col) {
      if (dirSort === 'asc') setDirSort('desc')
      else { setColSort(null); setDirSort('asc') }
    } else {
      setColSort(col); setDirSort('asc')
    }
  }

  function toggleType(type: string) {
    setTypesExclus(prev => {
      const s = new Set(prev)
      if (s.has(type)) s.delete(type)
      else s.add(type)
      return s
    })
  }

  const filtreActif   = typesExclus.size > 0
  const lignesFiltres = filtreActif ? lignes.filter(l => !typesExclus.has(l.typeProcedure)) : lignes
  const lignesTri     = trier(lignesFiltres, colSort, dirSort)
  const nbPages       = Math.ceil(lignesTri.length / PAGE_SIZE)
  const lignesPage    = lignesTri.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const thSort = (col: ColSort, label: string, align: 'left' | 'right' | 'center' = 'left') => {
    const actif = colSort === col
    const fleche = actif ? (dirSort === 'asc' ? ' ↑' : ' ↓') : ' ↕'
    return (
      <th
        onClick={() => handleSort(col)}
        className={`px-4 py-3 text-[11px] font-semibold cursor-pointer select-none text-${align}`}
        style={{ color: actif ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)' }}
      >
        {label}
        <span style={{ fontSize: 9, opacity: actif ? 1 : 0.35, marginLeft: 2 }}>{fleche}</span>
      </th>
    )
  }

  if (chargement) {
    return (
      <div>
        <div className="px-4 py-2.5 border-b border-gray-50">
          <div className="h-7 w-40 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="h-10" style={{ background: '#0E1A2B' }} />
        {[1, 2, 3].map(i => <div key={i} className="h-12 border-b border-gray-50 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div>

      {/* Barre d'outils — filtre type */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50">
        <div ref={refFiltre} className="relative">
          <button
            onClick={() => setFiltreOuvert(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              filtreActif
                ? 'bg-ockham-teal/10 text-ockham-teal border-ockham-teal/25'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Type de procédure
            {filtreActif && (
              <span className="font-bold text-[10px]">
                · {typesDisponibles.length - typesExclus.size}/{typesDisponibles.length}
              </span>
            )}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points={filtreOuvert ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}/>
            </svg>
          </button>

          {filtreOuvert && (
            <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-[240px] py-1.5">
              <div className="flex items-center gap-2 px-3 pb-1.5 mb-0.5 border-b border-gray-50">
                <button onClick={() => setTypesExclus(new Set())} className="text-[11px] font-semibold text-ockham-teal hover:underline cursor-pointer">
                  Tout cocher
                </button>
                <span className="text-gray-200 text-xs">·</span>
                <button onClick={() => setTypesExclus(new Set(typesDisponibles))} className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 hover:underline cursor-pointer">
                  Tout décocher
                </button>
              </div>
              {typesDisponibles.map(type => {
                const st = STATUT[type]
                return (
                  <label key={type} className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={!typesExclus.has(type)} onChange={() => toggleType(type)} className="accent-ockham-teal flex-shrink-0" />
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${st?.badge ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      <IcBadge type={type} />
                      {st?.label ?? type}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tableau */}
      {lignesTri.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2">
          <p className="text-sm text-gray-300">
            {filtreActif && typesExclus.size === typesDisponibles.length
              ? 'Aucun type sélectionné'
              : 'Aucune procédure enregistrée'}
          </p>
          {filtreActif && typesExclus.size === typesDisponibles.length && (
            <button onClick={() => setTypesExclus(new Set())} className="text-xs text-ockham-teal hover:underline cursor-pointer">
              Tout afficher
            </button>
          )}
        </div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#0E1A2B' }}>
                {thSort('codeClient',        'Code client',         'left')}
                {thSort('nom',               'Nom',                 'left')}
                {thSort('encours',           'Encours',             'right')}
                {thSort('typeProcedure',     'Type de procédure',   'left')}
                {thSort('joursDepuis',       'Jours depuis BODACC', 'center')}
                {thSort('declarationStatut', 'Déclaration',         'center')}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lignesPage.map(l => {
                const st = STATUT[l.typeProcedure]
                return (
                  <tr key={l.alerteId} onClick={() => onOuvrirDetail(l)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[11px] text-gray-400">{l.codeClient}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-gray-800">{l.nom}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {l.encours >= 0.01
                        ? <span className="font-bold text-ockham-copper">{fmtEuros(l.encours)}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${st?.badge ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        <IcBadge type={l.typeProcedure} />
                        {st?.label ?? l.typeProcedure}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-sm font-semibold text-gray-700">{l.joursDepuis} j</span>
                      <div className="text-[10px] text-gray-400 mt-0.5">{fmtDate(l.dateParution)}</div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <BadgeDeclaration statut={l.declarationStatut} encours={l.encours} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={page} total={nbPages} onChange={setPage} />
        </>
      )}

    </div>
  )
}
