import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

export type RoleContact = 'comptabilite' | 'relance' | 'direction' | 'terrain' | 'autre'

export interface Contact {
  id: string
  code_client: string
  prenom: string | null
  nom: string
  email: string
  telephone: string | null
  role_contact: RoleContact
  actif: boolean
}

export function useContacts(codeClient: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [chargement, setChargement] = useState(false)

  useEffect(() => {
    if (!codeClient) { setContacts([]); return }
    setChargement(true)
    supabase
      .from('contacts_client')
      .select('id, code_client, prenom, nom, email, telephone, role_contact, actif')
      .eq('code_client', codeClient)
      .eq('actif', true)
      .order('nom')
      .then(({ data }) => {
        setContacts((data ?? []) as Contact[])
        setChargement(false)
      })
  }, [codeClient])

  async function ajouter(data: Omit<Contact, 'id' | 'code_client' | 'actif'>) {
    if (!codeClient) return false
    const { data: row, error } = await supabase
      .from('contacts_client')
      .insert({ ...data, code_client: codeClient, actif: true } as never)
      .select('id, code_client, prenom, nom, email, telephone, role_contact, actif')
      .single()
    if (error || !row) { toast.error('Erreur ajout contact'); return false }
    setContacts(prev => [...prev, row as Contact].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')))
    toast.success('Contact ajouté')
    return true
  }

  async function modifier(id: string, data: Omit<Contact, 'id' | 'code_client' | 'actif'>) {
    const { error } = await supabase.from('contacts_client').update(data as never).eq('id', id)
    if (error) { toast.error('Erreur modification contact'); return false }
    setContacts(prev =>
      prev.map(c => c.id === id ? { ...c, ...data } : c)
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    )
    toast.success('Contact modifié')
    return true
  }

  async function desactiver(id: string) {
    const { error } = await supabase.from('contacts_client').update({ actif: false } as never).eq('id', id)
    if (error) { toast.error('Erreur suppression contact'); return false }
    setContacts(prev => prev.filter(c => c.id !== id))
    toast.success('Contact supprimé')
    return true
  }

  return { contacts, chargement, ajouter, modifier, desactiver }
}
