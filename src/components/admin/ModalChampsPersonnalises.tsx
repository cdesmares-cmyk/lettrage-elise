import { useState } from 'react'
import { useRefValeurs } from '../../hooks/useRefValeurs'
import { ModalBase } from './ModalBase'
import { IcSliders } from '../Icones'

function BlocRef({ titre, categorie, placeholder, description }: {
  titre: string
  categorie: 'commercial' | 'operateur' | 'plateforme' | 'format_facture'
  placeholder?: string
  description?: string
}) {
  const { valeurs, chargement, ajouter, desactiver } = useRefValeurs(categorie)
  const [saisie, setSaisie] = useState('')

  async function handleAjouter() {
    const ok = await ajouter(saisie)
    if (ok) setSaisie('')
  }

  return (
    <div className="border border-gray-100 rounded-xl px-4 py-4">
      <p className="text-xs font-bold text-gray-700 mb-1">{titre}</p>
      {description && <p className="text-[11px] text-gray-400 mb-3">{description}</p>}
      <div className="flex flex-wrap gap-1 mb-3 min-h-[24px]">
        {valeurs.length === 0 && <span className="text-[11px] text-gray-400">Aucune valeur</span>}
        {valeurs.map(v => (
          <span key={v} className="flex items-center gap-0.5 text-[11px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">
            {v}
            <button
              onClick={() => desactiver(v)}
              disabled={chargement}
              className="text-gray-400 hover:text-red-500 transition-colors ml-0.5 text-[10px] leading-none"
              title="Désactiver"
            >×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={saisie}
          onChange={e => setSaisie(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAjouter()}
          placeholder={placeholder ?? 'Nouvelle valeur…'}
          className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1.5 text-[11px] outline-none focus:border-ockham-teal transition-colors"
        />
        <button
          onClick={handleAjouter}
          disabled={!saisie.trim() || chargement}
          className="flex-shrink-0 text-[11px] font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 px-2.5 py-1.5 rounded transition-colors"
        >+ Ajouter</button>
      </div>
    </div>
  )
}

export function ModalChampsPersonnalises({ onClose }: { onClose: () => void }) {
  return (
    <ModalBase titre="Champs personnalisés" onClose={onClose} largeur="max-w-2xl" icon={<IcSliders size={14} />}>
      <div className="px-6 py-5 space-y-6">

        {/* Listes de référence */}
        <div>
          <p className="text-xs text-gray-400 mb-4">Valeurs disponibles dans les menus déroulants des fiches client.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BlocRef titre="Opérateurs" categorie="operateur" />
            <BlocRef titre="Plateformes d'envoi" categorie="plateforme" />
          </div>
        </div>

        {/* Détection automatique des factures */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-gray-700">Détection automatique des numéros de facture</p>
            <span className="text-[10px] font-semibold bg-ockham-teal/10 text-ockham-teal px-1.5 py-0.5 rounded">Navigateur de factures</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-4">
            Saisissez un exemple de numéro de facture réel. Le motif de détection est calculé automatiquement
            et appliqué sur les libellés bancaires lors du lettrage.
            Ajoutez autant d'exemples que vous avez de formats différents.
          </p>
          <BlocRef
            titre="Exemples de numéros de facture"
            categorie="format_facture"
            placeholder="Ex : FAC-2026-001234 ou 2026040000"
          />
        </div>

      </div>
    </ModalBase>
  )
}
