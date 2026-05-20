import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { ModalBase } from './ModalBase'

type Role = 'admin' | 'responsable_poste_client' | 'commercial'

interface Utilisateur {
  id: string
  email: string
  nom_affiche: string
  role: Role
}

const LABELS_ROLE: Record<Role, string> = {
  admin: 'Administrateur',
  responsable_poste_client: 'Crédit manager',
  commercial: 'Commercial',
}

const BADGE_ROLE: Record<Role, string> = {
  admin: 'bg-red-50 border-red-200 text-red-700',
  responsable_poste_client: 'bg-violet-50 border-violet-200 text-violet-700',
  commercial: 'bg-amber-50 border-amber-200 text-amber-700',
}

async function callAdminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export function ModalGestionRessources({ onClose }: { onClose: () => void }) {
  const { utilisateur } = useAuth()
  const [users, setUsers] = useState<Utilisateur[]>([])
  const [chargement, setChargement] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNom, setInviteNom] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('responsable_poste_client')
  const [showInvite, setShowInvite] = useState(false)
  const [editRole, setEditRole] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('utilisateurs')
      .select('id, email, nom_affiche, role')
      .order('nom_affiche')
    setUsers((data as unknown as Utilisateur[]) ?? [])
  }, [])

  useEffect(() => { charger() }, [charger])

  async function handleInviter() {
    if (!inviteEmail.trim()) return
    setChargement(true)
    try {
      await callAdminUsers({ action: 'invite', email: inviteEmail.trim(), role: inviteRole, nom_affiche: inviteNom.trim() || undefined })
      toast.success(`Invitation envoyée à ${inviteEmail.trim()}`)
      setInviteEmail('')
      setInviteNom('')
      setShowInvite(false)
      await charger()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'invitation')
    } finally {
      setChargement(false)
    }
  }

  async function handleSupprimer(userId: string) {
    setChargement(true)
    try {
      await callAdminUsers({ action: 'delete', user_id: userId })
      toast.success('Utilisateur supprimé')
      setConfirmDelete(null)
      await charger()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setChargement(false)
    }
  }

  async function handleChangerRole(userId: string, role: Role) {
    setChargement(true)
    try {
      await callAdminUsers({ action: 'update_role', user_id: userId, role })
      toast.success('Rôle mis à jour')
      setEditRole(null)
      await charger()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du changement de rôle')
    } finally {
      setChargement(false)
    }
  }

  async function handleResetMdp(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://app.ockham-finance.com',
    })
    if (error) toast.error(error.message)
    else toast.success(`Email de réinitialisation envoyé à ${email}`)
  }

  return (
    <ModalBase titre="Gestion des ressources" onClose={onClose} largeur="max-w-2xl">
      <div className="px-6 py-5 space-y-5">

        {/* Bouton inviter */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{users.length} utilisateur{users.length !== 1 ? 's' : ''}</p>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark px-3.5 py-2 rounded-lg transition-colors"
          >+ Inviter un utilisateur</button>
        </div>

        {/* Formulaire invitation */}
        {showInvite && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-gray-700">Nouvel utilisateur</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteNom}
                onChange={e => setInviteNom(e.target.value)}
                placeholder="Prénom Nom"
                autoFocus
                className="w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal transition-colors"
              />
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInviter()}
                placeholder="prenom.nom@domaine.fr"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal transition-colors"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as Role)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal bg-white transition-colors"
              >
                <option value="responsable_poste_client">Crédit manager</option>
                <option value="commercial">Commercial</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleInviter}
                disabled={!inviteEmail.trim() || chargement}
                className="text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark px-3.5 py-2 rounded-lg disabled:opacity-40 transition-colors"
              >{chargement ? '⏳ Envoi…' : 'Envoyer l\'invitation'}</button>
              <button
                onClick={() => { setShowInvite(false); setInviteEmail('') }}
                className="text-xs text-gray-500 border border-gray-200 px-3.5 py-2 rounded-lg transition-colors hover:border-gray-300"
              >Annuler</button>
            </div>
          </div>
        )}

        {/* Liste utilisateurs */}
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className={`border rounded-xl px-4 py-3 ${u.id === utilisateur?.id ? 'border-ockham-teal/40 bg-ockham-teal-muted' : 'border-gray-100 bg-white'}`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #4CC5BB 0%, #0E1A2B 100%)' }}>
                  {u.nom_affiche.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{u.nom_affiche}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
                {/* Badge rôle */}
                {editRole === u.id ? (
                  <select
                    defaultValue={u.role}
                    onChange={e => handleChangerRole(u.id, e.target.value as Role)}
                    disabled={chargement}
                    className="text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-ockham-teal bg-white"
                    autoFocus
                    onBlur={() => setEditRole(null)}
                  >
                    <option value="responsable_poste_client">Crédit manager</option>
                    <option value="commercial">Commercial</option>
                    <option value="admin">Administrateur</option>
                  </select>
                ) : (
                  <button
                    onClick={() => u.id !== utilisateur?.id && setEditRole(u.id)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${BADGE_ROLE[u.role]} ${u.id !== utilisateur?.id ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                    title={u.id !== utilisateur?.id ? 'Cliquer pour modifier le rôle' : ''}
                  >
                    {LABELS_ROLE[u.role]}
                  </button>
                )}
                {/* Actions */}
                {u.id !== utilisateur?.id && (
                  <div className="flex items-center gap-1 ml-1">
                    <button
                      onClick={() => handleResetMdp(u.email)}
                      className="text-[11px] text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 px-2.5 py-1 rounded transition-colors"
                      title="Envoyer un email de réinitialisation du mot de passe"
                    >↺ Mdp</button>
                    {confirmDelete === u.id ? (
                      <>
                        <button onClick={() => handleSupprimer(u.id)} disabled={chargement} className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded disabled:opacity-50">Oui</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-[11px] text-gray-400 border border-gray-200 px-2.5 py-1 rounded">Non</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(u.id)} className="text-[11px] text-red-400 hover:text-red-600 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded transition-colors">Supprimer</button>
                    )}
                  </div>
                )}
                {u.id === utilisateur?.id && (
                  <span className="text-[10px] text-gray-400 italic ml-1">vous</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalBase>
  )
}
