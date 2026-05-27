// Modal admin — gestion des scénarios de relance (CRUD + palette de balises)
import { useState, useRef } from 'react'
import { useScenariosRelance, type ScenarioRelance } from '../../hooks/useScenariosRelance'
import { IcFileText, IcTrash, IcEdit } from '../Icones'

interface Props { onClose: () => void }

const BALISES = ['[Nom client]', '[Code client]', '[Montant dû]', '[Tableau Factures]', '[Date du jour]']

const NIVEAUX = [
  { val: 1, label: 'Niveau 1 — Doux' },
  { val: 2, label: 'Niveau 2 — Ferme' },
  { val: 3, label: 'Niveau 3 — Urgent' },
]

const VIDE: Omit<ScenarioRelance, 'id'> = { nom: '', niveau: 1, objet: '', corps_texte: '' }

export function ModalScenariosRelance({ onClose }: Props) {
  const { scenarios, chargement, creer, modifier, supprimer } = useScenariosRelance()
  const [selId, setSelId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<Omit<ScenarioRelance, 'id'>>(VIDE)
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const corpsRef = useRef<HTMLTextAreaElement>(null)
  const objetRef = useRef<HTMLInputElement>(null)

  function selectionner(s: ScenarioRelance) {
    setSelId(s.id)
    setForm({ nom: s.nom, niveau: s.niveau, objet: s.objet, corps_texte: s.corps_texte })
    setConfirmDel(false)
  }

  function nouveau() {
    setSelId('new')
    setForm(VIDE)
    setConfirmDel(false)
  }

  function insererBalise(balise: string) {
    const el = corpsRef.current
    if (!el) return
    const s = el.selectionStart
    const e = el.selectionEnd
    const next = form.corps_texte.slice(0, s) + balise + form.corps_texte.slice(e)
    setForm(f => ({ ...f, corps_texte: next }))
    setTimeout(() => { el.selectionStart = el.selectionEnd = s + balise.length; el.focus() }, 0)
  }

  function insererBaliaseObjet(balise: string) {
    const el = objetRef.current
    if (!el) return
    const s = el.selectionStart ?? form.objet.length
    const e = el.selectionEnd ?? form.objet.length
    const next = form.objet.slice(0, s) + balise + form.objet.slice(e)
    setForm(f => ({ ...f, objet: next }))
    setTimeout(() => { el.selectionStart = el.selectionEnd = s + balise.length; el.focus() }, 0)
  }

  async function handleSave() {
    if (!form.nom.trim() || !form.objet.trim() || !form.corps_texte.trim()) return
    setSaving(true)
    let ok = false
    if (selId === 'new') ok = await creer(form)
    else if (selId) ok = await modifier(selId, form)
    setSaving(false)
    if (ok) setSelId(null)
  }

  async function handleDelete() {
    if (!selId || selId === 'new') return
    setSaving(true)
    const ok = await supprimer(selId)
    setSaving(false)
    if (ok) { setSelId(null); setConfirmDel(false) }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              <IcFileText size={15} className="text-ockham-teal" />
              <h3 className="text-base font-bold text-gray-900">Scénarios de relance</h3>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors">✕</button>
          </div>

          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Liste */}
            <div className="w-56 border-r border-gray-100 flex flex-col flex-shrink-0">
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {chargement ? (
                  <p className="text-xs text-gray-400 text-center py-4">Chargement…</p>
                ) : scenarios.map(s => (
                  <button
                    key={s.id}
                    onClick={() => selectionner(s)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${selId === s.id ? 'bg-ockham-teal-muted text-ockham-teal font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                  >
                    <div className="font-medium truncate">{s.nom}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Niveau {s.niveau}</div>
                  </button>
                ))}
              </div>
              <div className="p-3 border-t border-gray-100">
                <button
                  onClick={nouveau}
                  className={`w-full text-xs font-semibold py-2 rounded-lg border transition-colors ${selId === 'new' ? 'bg-ockham-teal-muted border-ockham-teal/30 text-ockham-teal' : 'border-dashed border-gray-300 text-gray-500 hover:border-ockham-teal/40 hover:text-ockham-teal'}`}
                >
                  + Ajouter un scénario
                </button>
              </div>
            </div>

            {/* Formulaire d'édition */}
            {selId ? (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

                {/* Nom + Niveau */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Nom du scénario</label>
                    <input
                      value={form.nom}
                      onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                      placeholder="Ex : Relance douce"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Niveau indicatif</label>
                    <select
                      value={form.niveau}
                      onChange={e => setForm(f => ({ ...f, niveau: Number(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal cursor-pointer"
                    >
                      {NIVEAUX.map(n => <option key={n.val} value={n.val}>{n.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Objet */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Objet</label>
                    <div className="flex gap-1">
                      {BALISES.filter(b => b !== '[Tableau Factures]').map(b => (
                        <button key={b} onClick={() => insererBaliaseObjet(b)}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-ockham-teal-muted text-ockham-teal border border-ockham-teal/20 hover:bg-ockham-teal/10 transition-colors"
                        >{b}</button>
                      ))}
                    </div>
                  </div>
                  <input
                    ref={objetRef}
                    value={form.objet}
                    onChange={e => setForm(f => ({ ...f, objet: e.target.value }))}
                    placeholder="Objet de l'email…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal"
                  />
                </div>

                {/* Corps */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Corps du message</label>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {BALISES.map(b => (
                        <button key={b} onClick={() => insererBalise(b)}
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
                            b === '[Tableau Factures]'
                              ? 'bg-ockham-navy text-ockham-teal border-ockham-teal/30 hover:bg-ockham-navy/80'
                              : 'bg-ockham-teal-muted text-ockham-teal border-ockham-teal/20 hover:bg-ockham-teal/10'
                          }`}
                        >{b}</button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    ref={corpsRef}
                    value={form.corps_texte}
                    onChange={e => setForm(f => ({ ...f, corps_texte: e.target.value }))}
                    rows={12}
                    placeholder="Rédigez votre message… utilisez les balises ci-dessus pour personnaliser."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-ockham-teal resize-none font-sans leading-relaxed"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-1">
                  {selId !== 'new' && !confirmDel && (
                    <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors">
                      <IcTrash size={12} /> Supprimer
                    </button>
                  )}
                  {confirmDel && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 font-semibold">Confirmer la suppression ?</span>
                      <button onClick={handleDelete} disabled={saving} className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors disabled:opacity-40">Oui</button>
                      <button onClick={() => setConfirmDel(false)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 transition-colors">Non</button>
                    </div>
                  )}
                  {!confirmDel && <span />}
                  <div className="flex gap-2">
                    <button onClick={() => setSelId(null)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2 transition-colors">Annuler</button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !form.nom.trim() || !form.objet.trim() || !form.corps_texte.trim()}
                      className="flex items-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      <IcEdit size={12} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-8">
                <div>
                  <div className="mb-3 opacity-20 text-gray-400"><IcFileText size={36} /></div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Sélectionnez un scénario</p>
                  <p className="text-xs text-gray-400">Choisissez un scénario dans la liste ou créez-en un nouveau</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
