import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useRole } from '../../contexts/RoleContext'
import toast from 'react-hot-toast'
import { ModalBase } from './ModalBase'
import { IcBuilding } from '../Icones'

interface Props {
  onClose: () => void
}

interface OrgLegal {
  raison_sociale: string | null
  forme_juridique: string | null
  siren: string | null
  siret: string | null
  tva_number: string | null
  adresse: string | null
  ville: string | null
  code_postal: string | null
}

const VIDE: OrgLegal = { raison_sociale: null, forme_juridique: null, siren: null, siret: null, tva_number: null, adresse: null, ville: null, code_postal: null }

export function ModalMonEntreprise({ onClose }: Props) {
  const { profil } = useAuth()
  const { isAdmin } = useRole()
  const [data, setData] = useState<OrgLegal>(VIDE)
  const [form, setForm] = useState<OrgLegal>(VIDE)
  const [edition, setEdition] = useState(false)
  const [sauvegarde, setSauvegarde] = useState(false)

  useEffect(() => {
    if (!profil?.organisation_id) return
    supabase
      .from('organisations')
      .select('raison_sociale, forme_juridique, siren, siret, tva_number, adresse, ville, code_postal')
      .eq('id', profil.organisation_id)
      .single()
      .then(({ data: row }) => {
        if (row) {
          const d = row as OrgLegal
          setData(d)
          setForm(d)
        }
      })
  }, [profil?.organisation_id])

  function entrerEdition() {
    setForm(data)
    setEdition(true)
  }

  function annuler() {
    setForm(data)
    setEdition(false)
  }

  async function sauvegarder() {
    if (!profil?.organisation_id) return
    setSauvegarde(true)
    try {
      const { error } = await supabase
        .from('organisations')
        .update({
          raison_sociale: form.raison_sociale || null,
          forme_juridique: form.forme_juridique || null,
          siren: form.siren || null,
          siret: form.siret || null,
          tva_number: form.tva_number || null,
          adresse: form.adresse || null,
          ville: form.ville || null,
          code_postal: form.code_postal || null,
        } as never)
        .eq('id', profil.organisation_id)
      if (error) throw error
      setData(form)
      setEdition(false)
      toast.success('Informations enregistrées.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.')
    } finally {
      setSauvegarde(false)
    }
  }

  const champs: { label: string; key: keyof OrgLegal }[] = [
    { label: 'Raison Sociale', key: 'raison_sociale' },
    { label: 'Forme Juridique', key: 'forme_juridique' },
    { label: 'SIREN', key: 'siren' },
    { label: 'SIRET', key: 'siret' },
    { label: 'N° TVA intracommunautaire', key: 'tva_number' },
    { label: 'Adresse', key: 'adresse' },
    { label: 'Ville', key: 'ville' },
    { label: 'Code postal', key: 'code_postal' },
  ]

  return (
    <ModalBase titre="Mon entreprise" onClose={onClose} largeur="max-w-lg" icon={<IcBuilding size={14} />}>
      <div className="px-6 py-5 space-y-4">
        <div className="space-y-3">
          {champs.map(({ label, key }) => (
            <div key={key}>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
                {label}
              </label>
              {edition ? (
                <input
                  type="text"
                  value={form[key] ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`—`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal bg-white transition-colors"
                />
              ) : (
                <p className="text-sm text-gray-800 px-3 py-2 bg-gray-50 rounded-lg min-h-[36px] flex items-center">
                  {data[key] ?? <span className="text-gray-300">—</span>}
                </p>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            {edition ? (
              <>
                <button
                  onClick={annuler}
                  disabled={sauvegarde}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-40 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={sauvegarder}
                  disabled={sauvegarde}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors"
                  style={{ background: sauvegarde ? '#3BA89F' : '#4CC5BB' }}
                >
                  {sauvegarde ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </>
            ) : (
              <button
                onClick={entrerEdition}
                className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors"
                style={{ background: 'rgba(76,197,187,0.10)', color: '#3BA89F' }}
              >
                Modifier
              </button>
            )}
          </div>
        )}
      </div>
    </ModalBase>
  )
}
