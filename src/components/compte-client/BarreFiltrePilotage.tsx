// La barre de filtre de pilotage : cibler un pool de clients, et voir ce qu'il
// represente.
//
// DEUX MOITIES, ET C'EST VOULU.
//   Le CONTEXTE  — les criteres : quels clients, dans quel etat.
//   L'OBJECTIF   — le compteur : combien de clients, de factures, d'euros.
//
// Les deux doivent etre cote a cote. On bouge les criteres jusqu'a ce que le
// compteur affiche une charge de travail realiste pour la matinee : c'est ca,
// piloter un temps de travail. Un filtre sans compteur ne dit pas si la liste
// qu'il produit est exploitable.
//
// Le panneau est replie par defaut. Sept criteres etales en permanence
// encombreraient une barre d'outils qui porte deja la vue, la recherche et le
// commercial.
import { useState } from 'react'
import {
  FILTRE_VIDE,
  nbCriteresActifs,
  type FiltrePilotage,
} from '../../lib/pilotageRelances'

interface Props {
  filtre: FiltrePilotage
  setFiltre: (maj: FiltrePilotage | ((f: FiltrePilotage) => FiltrePilotage)) => void
  reinitialiser: () => void
  /** Le compteur, calculé sur la liste déjà filtrée. */
  nbClients: number
  nbFactures: number
  encours: number
}

const NIVEAUX = [0, 1, 2, 3] as const

function fmtEuros(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

// Au niveau module : defini dans le parent, il serait remonte a chaque frappe
// et le champ perdrait le focus.
function ChampNombre({ label, suffixe, value, onChange, placeholder }: {
  label: string; suffixe?: string; value: string
  onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs tabular-nums outline-none focus:border-ockham-teal"
        />
        {suffixe && <span className="text-[10px] text-gray-400">{suffixe}</span>}
      </span>
    </label>
  )
}

/** Raccourcis de plage : une année ou les douze derniers mois en un clic. */
function raccourcisAnnees(): { label: string; debut: string; fin: string }[] {
  const annee = new Date().getFullYear()
  const douzeMois = new Date()
  douzeMois.setFullYear(douzeMois.getFullYear() - 1)
  return [
    { label: String(annee),     debut: `${annee}-01-01`,     fin: `${annee}-12-31` },
    { label: String(annee - 1), debut: `${annee - 1}-01-01`, fin: `${annee - 1}-12-31` },
    { label: String(annee - 2), debut: `${annee - 2}-01-01`, fin: `${annee - 2}-12-31` },
    { label: '12 derniers mois', debut: douzeMois.toISOString().slice(0, 10), fin: '' },
  ]
}

export function BarreFiltrePilotage({
  filtre, setFiltre, reinitialiser, nbClients, nbFactures, encours,
}: Props) {
  const [ouvert, setOuvert] = useState(false)
  const nbActifs = nbCriteresActifs(filtre)
  const actif = nbActifs > 0

  function basculerNiveau(n: number) {
    setFiltre(f => ({
      ...f,
      niveaux: f.niveaux.includes(n) ? f.niveaux.filter(x => x !== n) : [...f.niveaux, n],
    }))
  }

  function majChamp<K extends keyof FiltrePilotage>(cle: K, v: FiltrePilotage[K]) {
    setFiltre(f => ({ ...f, [cle]: v }))
  }

  const plageActive = raccourcisAnnees().find(
    r => r.debut === filtre.dateEmissionDebut && r.fin === filtre.dateEmissionFin
  )

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setOuvert(o => !o)}
          className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
            actif
              ? 'border-ockham-teal text-ockham-teal bg-ockham-teal-muted'
              : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
          }`}
        >
          Filtres
          {actif && (
            <span className="bg-ockham-teal text-white text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
              {nbActifs}
            </span>
          )}
          <span className={`text-[9px] transition-transform ${ouvert ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {/* L'objectif : ce que le pool represente. Visible en permanence des
            qu'un critere est pose, sinon il n'apporte rien. */}
        {actif && (
          <div className="flex items-center gap-3 text-xs">
            <span className="font-bold text-ockham-navy tabular-nums">{nbClients}</span>
            <span className="text-gray-400">client{nbClients > 1 ? 's' : ''}</span>
            <span className="text-gray-200">·</span>
            <span className="font-bold text-ockham-navy tabular-nums">{nbFactures}</span>
            <span className="text-gray-400">facture{nbFactures > 1 ? 's' : ''}</span>
            <span className="text-gray-200">·</span>
            <span className="font-bold text-ockham-navy tabular-nums">{fmtEuros(encours)}</span>
          </div>
        )}

        {actif && (
          <button
            onClick={reinitialiser}
            className="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {ouvert && (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Niveau de relance
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {NIVEAUX.map(n => (
                <button
                  key={n}
                  onClick={() => basculerNiveau(n)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    filtre.niveaux.includes(n)
                      ? 'border-ockham-teal bg-ockham-teal text-white'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  N{n}
                </button>
              ))}
              <span className="text-gray-200 mx-1">|</span>
              <button
                onClick={() => majChamp('jamaisRelance', !filtre.jamaisRelance)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                  filtre.jamaisRelance
                    ? 'border-ockham-copper bg-ockham-copper text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                Jamais relancé
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
              Les niveaux et « jamais relancé » se combinent. Le niveau ne concerne que les clients
              ayant des factures échues : les autres n'en ont pas.
            </p>
          </div>

          <div className="flex items-end gap-4 flex-wrap">
            <ChampNombre
              label="Dernière relance"
              suffixe="jours ou plus"
              placeholder="30"
              value={filtre.joursDerniereRelanceMin}
              onChange={v => majChamp('joursDerniereRelanceMin', v)}
            />
            <ChampNombre
              label="Factures"
              suffixe="au minimum"
              placeholder="3"
              value={filtre.nbFacturesMin}
              onChange={v => majChamp('nbFacturesMin', v)}
            />
            <ChampNombre
              label="Encours"
              suffixe="€ au minimum"
              placeholder="5000"
              value={filtre.encoursMin}
              onChange={v => majChamp('encoursMin', v)}
            />
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Contient des factures émises entre
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={filtre.dateEmissionDebut}
                onChange={e => majChamp('dateEmissionDebut', e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-ockham-teal"
              />
              <span className="text-[10px] text-gray-400">et</span>
              <input
                type="date"
                value={filtre.dateEmissionFin}
                onChange={e => majChamp('dateEmissionFin', e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-ockham-teal"
              />
              <span className="text-gray-200 mx-1">|</span>
              {raccourcisAnnees().map(r => (
                <button
                  key={r.label}
                  onClick={() => setFiltre(f => ({
                    ...f, dateEmissionDebut: r.debut, dateEmissionFin: r.fin,
                  }))}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    plageActive?.label === r.label
                      ? 'border-ockham-teal bg-ockham-teal-muted text-ockham-teal-dark'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filtre.exclureGelesEtAttente}
                onChange={e => majChamp('exclureGelesEtAttente', e.target.checked)}
                className="accent-ockham-teal"
              />
              <span className="text-[11px] font-semibold text-gray-600">
                Exclure les clients gelés et mis en pause
              </span>
            </label>
            <button
              onClick={() => setFiltre(FILTRE_VIDE)}
              className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              Tout effacer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
