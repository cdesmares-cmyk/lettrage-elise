import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { ModalBase } from './ModalBase'
import { IcUsers, IcEdit } from '../Icones'

type Role = 'admin' | 'responsable_poste_client' | 'commercial'

interface Utilisateur {
  id: string
  email: string
  prenom: string
  nom: string
  initiales: string
  role: Role
}

const LABELS_ROLE: Record<Role, string> = {
  admin: 'Administrateur',
  responsable_poste_client: 'Credit Manager',
  commercial: 'Commercial',
}

const BADGE_ROLE: Record<Role, string> = {
  admin: 'bg-red-50 border border-red-200 text-red-700',
  responsable_poste_client: 'bg-violet-50 border border-violet-200 text-violet-700',
  commercial: 'bg-amber-50 border border-amber-200 text-amber-700',
}

const DOT_ROLE: Record<Role, string> = {
  admin: 'bg-red-500',
  responsable_poste_client: 'bg-violet-600',
  commercial: 'bg-amber-500',
}

async function callAdminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx) {
      try {
        const detail = await ctx.json() as { error?: string }
        if (detail?.error) throw new Error(detail.error)
      } catch (e) {
        if (e instanceof Error && e.message !== error.message) throw e
      }
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data
}

function computeInitiales(prenom: string, nom: string): string {
  const p = prenom.trim()
  const n = nom.trim()
  if (p && n) return (p[0]! + n.slice(0, 2)).toUpperCase()
  if (n) return n.slice(0, 3).toUpperCase()
  if (p) return p.slice(0, 3).toUpperCase()
  return '?'
}

export function ModalGestionRessources({ onClose }: { onClose: () => void }) {
  const { utilisateur } = useAuth()
  const [users, setUsers] = useState<Utilisateur[]>([])
  const [filtre, setFiltre] = useState<Role | 'all'>('all')
  const [filtreOuvert, setFiltreOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editOuvert, setEditOuvert] = useState(false)
  const [editPrenom, setEditPrenom] = useState('')
  const [editNom, setEditNom] = useState('')
  const [editRole, setEditRole] = useState<Role>('responsable_poste_client')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [invitePrenom, setInvitePrenom] = useState('')
  const [inviteNom, setInviteNom] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('responsable_poste_client')
  const [chargement, setChargement] = useState(false)
  const filtreRef = useRef<HTMLDivElement>(null)

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('utilisateurs')
      .select('id, email, prenom, nom, initiales, role')
      .order('nom')
    setUsers((data as unknown as Utilisateur[]) ?? [])
  }, [])

  useEffect(() => { charger() }, [charger])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (filtreRef.current && !filtreRef.current.contains(e.target as Node)) setFiltreOuvert(false)
    }
    if (filtreOuvert) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [filtreOuvert])

  function selectionner(u: Utilisateur) {
    if (u.id === utilisateur?.id) return
    if (selectedId === u.id) {
      setSelectedId(null); setEditOuvert(false); setConfirmDelete(false)
    } else {
      setSelectedId(u.id); setEditOuvert(false); setConfirmDelete(false)
      setEditPrenom(u.prenom); setEditNom(u.nom); setEditRole(u.role)
    }
  }

  function ouvrirEdition() {
    if (!selectedId) return
    setEditOuvert(true)
    setConfirmDelete(false)
  }

  function fermerEdition() {
    setEditOuvert(false)
    setConfirmDelete(false)
    setSelectedId(null)
  }

  async function handleSauvegarder() {
    if (!selectedId) return
    setChargement(true)
    try {
      await callAdminUsers({ action: 'update_user', user_id: selectedId, prenom: editPrenom.trim(), nom: editNom.trim(), role: editRole })
      toast.success('Utilisateur mis à jour')
      fermerEdition()
      await charger()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur mise à jour')
    } finally {
      setChargement(false)
    }
  }

  async function handleSupprimer() {
    if (!selectedId) return
    setChargement(true)
    try {
      await callAdminUsers({ action: 'delete', user_id: selectedId })
      toast.success('Utilisateur supprimé')
      fermerEdition()
      await charger()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suppression')
    } finally {
      setChargement(false)
    }
  }

  async function handleResetMdp() {
    const u = users.find(x => x.id === selectedId)
    if (!u) return
    const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: 'https://app.ockham-finance.com' })
    if (error) toast.error(error.message)
    else toast.success(`Email de réinitialisation envoyé à ${u.email}`)
  }

  async function handleInviter() {
    if (!inviteEmail.trim()) return
    setChargement(true)
    try {
      const nom = inviteNom.trim() || inviteEmail.split('@')[0]
      await callAdminUsers({ action: 'invite', email: inviteEmail.trim(), prenom: invitePrenom.trim(), nom, role: inviteRole })
      toast.success(`Invitation envoyée à ${inviteEmail.trim()}`)
      setInvitePrenom(''); setInviteNom(''); setInviteEmail('')
      setShowInvite(false)
      await charger()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur invitation')
    } finally {
      setChargement(false)
    }
  }

  const usersAffiches = users.filter(u => {
    const matchRole = filtre === 'all' || u.role === filtre
    const q = recherche.toLowerCase()
    const matchSearch = !q || u.prenom.toLowerCase().includes(q) || u.nom.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    return matchRole && matchSearch
  })

  const comptesParRole: Record<Role | 'all', number> = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    responsable_poste_client: users.filter(u => u.role === 'responsable_poste_client').length,
    commercial: users.filter(u => u.role === 'commercial').length,
  }

  const selectedUser = users.find(u => u.id === selectedId)
  const initiales = selectedUser ? computeInitiales(editPrenom, editNom) || selectedUser.initiales : ''

  const FILTRES: Array<{ value: Role | 'all'; label: string }> = [
    { value: 'all', label: 'Tous les rôles' },
    { value: 'admin', label: 'Administrateur' },
    { value: 'responsable_poste_client', label: 'Credit Manager' },
    { value: 'commercial', label: 'Commercial' },
  ]

  return (
    <ModalBase titre="Gestion des ressources" onClose={onClose} largeur="max-w-4xl" icon={<IcUsers size={14} />}>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-gray-100 bg-gray-50/70">

        {/* Filtre déroulant */}
        <div className="relative" ref={filtreRef}>
          <button
            onClick={() => setFiltreOuvert(v => !v)}
            className={`flex items-center gap-2 px-3 h-8 rounded-lg border text-[12.5px] font-medium transition-colors ${filtreOuvert || filtre !== 'all' ? 'border-ockham-teal text-ockham-teal-dark bg-ockham-teal-muted' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            {filtre === 'all' ? 'Tous les rôles' : LABELS_ROLE[filtre as Role]}
            <svg className={`w-3 h-3 text-gray-400 transition-transform ${filtreOuvert ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6"/></svg>
          </button>
          {filtreOuvert && (
            <div className="absolute left-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1.5 animate-slide-up">
              {FILTRES.map(f => (
                <button key={f.value} onClick={() => { setFiltre(f.value); setFiltreOuvert(false) }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] font-medium text-left transition-colors ${filtre === f.value ? 'bg-ockham-teal-muted text-ockham-teal-dark' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <div className="flex items-center gap-2">
                    {f.value !== 'all' && <span className={`w-2 h-2 rounded-full ${DOT_ROLE[f.value as Role]}`} />}
                    {f.label}
                  </div>
                  <span className="text-[11px] text-gray-400 font-semibold">{comptesParRole[f.value]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recherche */}
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            type="text"
            value={recherche}
            onChange={e => { setRecherche(e.target.value); setSelectedId(null); setEditOuvert(false) }}
            placeholder="Prénom, nom ou email…"
            className="w-full h-8 pl-8 pr-3 border border-gray-200 rounded-lg text-[12.5px] outline-none focus:border-ockham-teal transition-colors bg-white"
          />
        </div>

        {/* Bouton Modifier */}
        <button
          onClick={ouvrirEdition}
          disabled={!selectedId}
          className={`flex items-center gap-1.5 px-3 h-8 rounded-lg border text-[12.5px] font-semibold transition-colors ${
            selectedId && editOuvert ? 'bg-ockham-navy border-ockham-navy text-white'
            : selectedId ? 'border-ockham-navy text-ockham-navy hover:bg-ockham-navy hover:text-white'
            : 'border-gray-200 text-gray-300 cursor-not-allowed bg-white'
          }`}
        >
          <IcEdit size={13} />
          Modifier
        </button>
      </div>

      {/* Compteur */}
      <div className="px-5 py-1.5 text-[11.5px] text-gray-400 border-b border-gray-100">
        <strong className="text-gray-600">{usersAffiches.length}</strong> utilisateur{usersAffiches.length !== 1 ? 's' : ''}
        {selectedId && !editOuvert && <span className="ml-2 text-ockham-teal font-medium">· Cliquez sur Modifier pour éditer</span>}
      </div>

      {/* ── Table ── */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 260px)' }}>
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col style={{ width: '36px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '130px' }} />
            <col />
            <col style={{ width: '155px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 sticky top-0 z-10">
              {['', 'Prénom', 'Nom', 'Email', 'Rôle'].map((h, i) => (
                <th key={i} className="px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-400 border-b border-gray-100">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usersAffiches.map(u => (
              <>
                <tr
                  key={u.id}
                  onClick={() => selectionner(u)}
                  className={`border-b border-gray-50 transition-colors ${
                    u.id === utilisateur?.id ? 'cursor-default' : 'cursor-pointer'
                  } ${selectedId === u.id ? 'bg-ockham-teal-muted border-l-2 border-ockham-teal' : u.id !== utilisateur?.id ? 'hover:bg-gray-50' : ''}`}
                >
                  <td className="px-3 py-2.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${u.id === utilisateur?.id ? 'bg-ockham-teal-muted text-ockham-teal-dark' : 'bg-gray-100 text-gray-500'}`}>
                      {u.initiales || u.email.slice(0, 2).toUpperCase()}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] font-semibold text-gray-800 truncate">
                    {u.prenom || <span className="text-gray-300 font-normal italic">—</span>}
                    {u.id === utilisateur?.id && <span className="ml-2 text-[9px] font-bold text-ockham-teal bg-ockham-teal/10 px-1.5 py-0.5 rounded">vous</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] font-semibold text-gray-800 truncate">{u.nom || <span className="text-gray-300 font-normal italic">—</span>}</td>
                  <td className="px-3 py-2.5 text-[12px] text-gray-500 truncate">{u.email}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2 py-0.5 rounded ${BADGE_ROLE[u.role]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${DOT_ROLE[u.role]}`} />
                      {LABELS_ROLE[u.role]}
                    </span>
                  </td>
                </tr>

                {/* Panneau d'édition inline */}
                {selectedId === u.id && editOuvert && (
                  <tr key={`edit-${u.id}`} className="border-b border-ockham-teal/20">
                    <td colSpan={5} className="bg-ockham-teal-muted border-t-2 border-ockham-teal p-0">
                      <div className="px-4 py-3 animate-fade-up">
                        <p className="text-[10.5px] font-bold text-ockham-teal-dark uppercase tracking-wider mb-3">
                          Modification — {initiales}
                        </p>
                        {/* Champs — même layout que le formulaire d'invitation */}
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={editPrenom}
                            onChange={e => setEditPrenom(e.target.value)}
                            placeholder="Prénom"
                            autoFocus
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal transition-colors bg-white"
                          />
                          <input
                            type="text"
                            value={editNom}
                            onChange={e => setEditNom(e.target.value)}
                            placeholder="Nom"
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal transition-colors bg-white"
                          />
                        </div>
                        <div className="flex gap-2 mb-3">
                          <input
                            type="email"
                            value={u.email}
                            readOnly
                            tabIndex={-1}
                            className="flex-1 border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-default"
                          />
                          <select
                            value={editRole}
                            onChange={e => setEditRole(e.target.value as Role)}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal bg-white transition-colors"
                          >
                            <option value="responsable_poste_client">Credit Manager</option>
                            <option value="commercial">Commercial</option>
                            <option value="admin">Administrateur</option>
                          </select>
                        </div>
                        {/* Actions */}
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2">
                            <button onClick={handleSauvegarder} disabled={chargement}
                              className="text-xs font-semibold text-white bg-ockham-navy hover:bg-ockham-navy/90 px-4 py-1.5 rounded-lg disabled:opacity-40 transition-colors">
                              {chargement ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                            <button onClick={fermerEdition}
                              className="text-xs text-gray-500 border border-gray-200 px-3.5 py-1.5 rounded-lg hover:border-gray-300 transition-colors">
                              Annuler
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={handleResetMdp}
                              className="text-xs text-gray-500 border border-gray-200 px-3.5 py-1.5 rounded-lg hover:border-gray-300 transition-colors flex items-center gap-1.5">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                              Renvoyer le mot de passe
                            </button>
                            {confirmDelete ? (
                              <>
                                <button onClick={handleSupprimer} disabled={chargement}
                                  className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                                  Confirmer la suppression
                                </button>
                                <button onClick={() => setConfirmDelete(false)}
                                  className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors">
                                  Annuler
                                </button>
                              </>
                            ) : (
                              <button onClick={() => setConfirmDelete(true)}
                                className="text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                Supprimer
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Formulaire invitation ── */}
      {showInvite && (
        <div className="bg-gray-50 border-t border-gray-200 px-5 py-4">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Nouvel utilisateur</p>
          <div className="flex gap-2 mb-2">
            <input type="text" value={invitePrenom} onChange={e => setInvitePrenom(e.target.value)} placeholder="Prénom" autoFocus
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal transition-colors" />
            <input type="text" value={inviteNom} onChange={e => setInviteNom(e.target.value)} placeholder="Nom"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal transition-colors" />
          </div>
          <div className="flex gap-2 mb-3">
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInviter()} placeholder="prenom.nom@domaine.fr"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal transition-colors" />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal bg-white transition-colors">
              <option value="responsable_poste_client">Credit Manager</option>
              <option value="commercial">Commercial</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowInvite(false); setInvitePrenom(''); setInviteNom(''); setInviteEmail('') }}
              className="text-xs text-gray-500 border border-gray-200 px-3.5 py-2 rounded-lg hover:border-gray-300 transition-colors">Annuler</button>
            <button onClick={handleInviter} disabled={!inviteEmail.trim() || chargement}
              className="text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark px-3.5 py-2 rounded-lg disabled:opacity-40 transition-colors">
              {chargement ? 'Envoi…' : 'Envoyer l\'invitation'}
            </button>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      {!showInvite && (
        <div className="px-5 py-3 flex justify-end border-t border-gray-100">
          <button onClick={() => { setShowInvite(true); setSelectedId(null); setEditOuvert(false) }}
            className="text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
            style={{ background: '#0E1A2B', color: '#4CC5BB' }}>
            + Inviter un utilisateur
          </button>
        </div>
      )}
    </ModalBase>
  )
}
