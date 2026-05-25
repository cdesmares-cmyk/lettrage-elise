# OCKHAM — Design System

> Référence visuelle pour toutes les pages. Aucune modification sans mise à jour ici.
> Dernière mise à jour : 2026-05-25

---

## Couleurs

| Token           | Valeur      | Usage                                      |
|-----------------|-------------|--------------------------------------------|
| `ockham-teal`   | `#4CC5BB`   | CTA primaire, accents, liens actifs        |
| `ockham-navy`   | `#0E1A2B`   | Sidebar, header, panneau marque connexion  |
| `ockham-navy-2` | `#142840`   | Dégradé navy (gradient connexion)          |
| Fond app        | `#F8FAFC`   | Arrière-plan général des pages             |
| Fond card       | `#FFFFFF`   | Cards, tableaux, modals                    |
| Bordure         | `#E5E7EB`   | Séparateurs, bordures inputs               |
| Texte principal | `#0F172A`   | Corps, titres                              |
| Texte secondaire| `#64748B`   | Labels, descriptions, placeholders         |

**Badges score risque :**
- Rouge (élevé) : fond `#FEE2E2` / texte `#B91C1C`
- Amber (modéré) : fond `#FEF3C7` / texte `#92400E`
- Vert (faible) : fond `#D1FAE5` / texte `#065F46`

**États :**
- Succès : fond `#ECFDF5` / bordure `#A7F3D0` / texte `#065F46`
- Erreur : fond `#FEF2F2` / bordure `#FECACA` / texte `#B91C1C`

---

## Typographie

Police : `system-ui, -apple-system, Segoe UI, sans-serif`

| Rôle               | Taille | Poids | Classe Tailwind           |
|--------------------|--------|-------|---------------------------|
| Titre de page      | 20px   | 700   | `text-xl font-bold`       |
| Titre de section   | 14px   | 600   | `text-sm font-semibold`   |
| Label uppercase    | 11px   | 700   | `text-[11px] font-bold uppercase tracking-wider` |
| Corps              | 14px   | 400   | `text-sm`                 |
| Secondaire         | 12px   | 400   | `text-xs text-gray-400`   |
| Mono (codes, n°)   | 12px   | 400   | `text-xs font-mono`       |

---

## Spacing & Layout

- **Radius cards** : `rounded-2xl` (12px)
- **Radius boutons** : `rounded-lg` (8px)
- **Radius badges** : `rounded-full`
- **Ombre cards** : `shadow-sm` + `border border-gray-100`
- **Padding card** : `p-6` ou `p-8` pour les modals larges
- **Gap entre sections** : `space-y-6`

---

## Composants

### Bouton primaire
```
bg-ockham-teal text-white rounded-lg px-4 py-2.5 text-sm font-semibold
hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors
```

### Bouton secondaire
```
border border-gray-200 text-gray-600 rounded-lg px-4 py-2.5 text-sm
hover:bg-gray-50 transition-colors
```

### Bouton danger
```
text-red-600 hover:bg-red-50 rounded-lg px-4 py-2.5 text-sm transition-colors
```

### Input
```
w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm
text-gray-900 placeholder-gray-300 outline-none
focus:border-ockham-teal focus:ring-2 focus:ring-ockham-teal/10 transition-all
```

### Card
```
bg-white rounded-2xl shadow-sm border border-gray-100 p-6
```

### Badge statut (inline)
```
text-[11px] font-bold px-2.5 py-0.5 rounded-full
```

### Message erreur
```
flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-3.5 py-3
icône ⚠ text-red-400 + texte text-sm text-red-700
```

### Message succès
```
flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-3
icône ✓ text-emerald-500 + texte text-sm text-emerald-700
```

---

## Layout pages internes

- **Sidebar** : fond `ockham-navy`, largeur fixe, onglet actif en `ockham-teal`
- **Contenu** : fond `#F8FAFC`, padding `px-6 py-6` ou `px-8 py-8`
- **En-tête de page** : `flex items-center justify-between mb-5`
  - Gauche : `h1` titre + `p` sous-titre `text-gray-400`
  - Droite : actions principales (bouton CTA)

---

## Page Connexion (acté le 2026-05-25)

- Layout 2 colonnes : panneau navy gauche (brand + stats déco) + panneau blanc droite (formulaire)
- Panneau gauche masqué sous `lg:` (responsive)
- Logo horizontal avec baseline "Recouvrement intelligent"
- Card formulaire sur fond `#F8FAFC` avec `bg-white rounded-2xl shadow-sm border border-gray-100`
- Inputs sur fond blanc (plus lisibles que glass sur dark)
