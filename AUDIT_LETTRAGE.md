# Audit — Page Lettrage
> Généré le 2026-06-06. Périmètre : fonctionnalités, code, base de données.

---

## 1. Vue d'ensemble

La page Lettrage est le cœur opérationnel de l'app. Elle permet d'associer des crédits bancaires à des factures clients. Elle est composée de :

- Une **liste gauche** des lignes bancaires (avec filtres, recherche, pagination)
- Un **panneau droit** contextuel (formulaire de lettrage, dispatch 411/471, requalification 471)
- Une **barre de résumé** en haut (KPIs : non-lettrés, montant restant, progression)
- Plusieurs **modales** : Historique, Correction/Remboursement, Extraction XLS, Navigateur de factures, Remises

---

## 2. Guide utilisateur — Fonctionnalités avec cause / conséquence

### 2.1 Filtres et navigation

| Action | Cause | Conséquence | Où retrouver |
|--------|-------|-------------|--------------|
| Cliquer sur un filtre (`À lettrer`, `Partielles`, `Lettrées`, `Compte`, `Autres Virements`) | Recharge la liste avec le statut correspondant | Seules les lignes bancaires du statut sélectionné apparaissent | Liste de gauche |
| Saisir dans la barre de recherche | Recherche dans libellé, détail, infos complémentaires (debounce 350ms) | La liste se filtre en temps réel | Liste de gauche |
| Saisir une plage de dates (Du / Au) | Filtre par `date_operation` | Seules les lignes dans la période apparaissent | Liste de gauche |
| Naviguer entre les pages (pagination) | Charge la page suivante depuis Supabase | 50 lignes par page | Bas de la liste gauche |
| Cliquer sur le bouton `Historique` | Ouvre la modale historique | Affiche les 200 derniers lettrages, recherchables | Modale en overlay |

### 2.2 Lettrage standard (vue `À lettrer` / `Partielles`)

| Action | Cause | Conséquence | Où retrouver |
|--------|-------|-------------|--------------|
| Cliquer sur une ligne bancaire (crédit) | Sélectionne la ligne, charge ses lettrages existants | Le panneau droit s'ouvre avec le montant disponible | Panneau droit |
| Saisir un numéro de facture dans le champ | Recherche en live dans `v_factures_avec_reste_du` (debounce 400ms) | Le nom du client et le restant dû s'affichent sous le champ | Panneau droit |
| Cliquer sur `Navigateur de factures` | Ouvre la modale de recherche intelligente | L'IA propose des factures par : n° détecté dans le libellé, client reconnu via SEPA, historique similaire | Modale navigateur |
| Sélectionner des factures dans le navigateur puis `Injecter` | Transfert les factures sélectionnées dans le formulaire | Les lignes apparaissent pré-remplies dans le panneau droit | Panneau droit |
| Choisir la classe `CHQ` ou `LCR` dans le dropdown | Change le mode de saisie | Affiche un sélecteur de remises au lieu du champ numéro de facture | Panneau droit |
| Cliquer sur `Valider le lettrage` | INSERT dans la table `lettrages` | La ligne bancaire se met à jour (restant diminue, statut change) ; la facture aussi | Vue `Lettrées` ou `Partielles` selon le restant |

### 2.3 Affectation en compte (vue `Compte`)

#### Compte 411 Client (pseudo-facture)

| Action | Cause | Conséquence | Où retrouver |
|--------|-------|-------------|--------------|
| Choisir `411 - Client` dans le dropdown | Change le mode de saisie vers autocomplete client | Propose les clients existants | Panneau droit |
| Sélectionner un client et valider (`Affecter au Compte Client`) | UPSERT d'une pseudo-facture `411_CLIENT` + INSERT lettrage | La ligne bancaire est lettrée ; une entrée `411_CLIENT` apparaît dans l'onglet Compte | Onglet `Compte` → section "Compte 411" |
| Cliquer sur un compte 411 dans l'onglet Compte | Sélectionne la pseudo-facture | Le panneau Dispatch 411 s'ouvre à droite | Panneau droit |
| Saisir les vraies factures et valider le dispatch | RPC `dispatch_411` : INSERT corrections (−) + INSERT vrais lettrages | Le compte 411 est soldé ; les vraies factures sont lettrées | Vue `Lettrées` pour les factures, compte 411 disparaît |

#### Compte 411 Attente (client non identifié)

| Action | Cause | Conséquence | Où retrouver |
|--------|-------|-------------|--------------|
| Choisir `411 - Attente` et valider (`Affecter au 411 Attente`) | UPDATE `en_attente_471 = true` sur la ligne bancaire + INSERT lettrage temporaire | La ligne passe en statut `en_attente_471` | Onglet `Compte` → section "Compte 411 Attente" |
| Cliquer sur une ligne 411 Attente | Sélectionne la ligne | Le panneau Dispatch 411 Attente s'ouvre | Panneau droit |
| Saisir les vraies factures et valider | INSERT lettrages + UPDATE `en_attente_471 = false` | La ligne sort de l'onglet Compte, les factures sont lettrées | Vue `Lettrées` |

### 2.4 Virements 471 non-clients (vue `Autres Virements`)

| Action | Cause | Conséquence | Où retrouver |
|--------|-------|-------------|--------------|
| Cliquer sur une ligne dans `Autres Virements` | Sélectionne la ligne 471 | Le panneau Requalification 471 s'ouvre | Panneau droit |
| Saisir les factures de remplacement et valider | INSERT corrections (−montant pour chaque lettrage 471 existant) + INSERT vrais lettrages | Le virement 471 est requalifié ; les factures sont lettrées | Vue `Lettrées` |

### 2.5 Opérations manuelles (bouton `Correction`)

#### Onglet Correction

| Action | Cause | Conséquence | Où retrouver |
|--------|-------|-------------|--------------|
| Ouvrir le module Correction | Clic sur `Correction` dans la barre de résumé | La modale s'ouvre avec deux sections | Modale |
| Cliquer `Identifier vos factures` | Minimise la modale + navigue vers Compte Client | Un chip amber apparaît en bas à droite | Partout dans l'app |
| Cliquer le chip amber | Restaure la modale avec l'état préservé + navigue vers Lettrage | La modale se rouvre, les données saisies sont intactes | Page Lettrage |
| Saisir les factures à corriger (haut) + factures de remplacement (bas) et valider | INSERT lettrages négatifs (délettrage) + INSERT nouveaux lettrages | Les factures sont re-lettrées ; l'historique trace l'opération | Vue `Lettrées` + Historique |

#### Onglet Remboursement

| Action | Cause | Conséquence | Où retrouver |
|--------|-------|-------------|--------------|
| Saisir un numéro de facture et valider | INSERT lettrage avec montant négatif + mode `remboursement` | Le restant dû de la facture augmente (délettrage partiel ou total) | Vue `Lettrées` → restant change |

### 2.6 Remises CHQ / LCR

| Action | Cause | Conséquence | Où retrouver |
|--------|-------|-------------|--------------|
| Ouvrir les remises | Clic badge `Remises` dans la barre de résumé | Modale avec liste des remises en attente / encaissées | Modale |
| Créer une remise | RPC `creer_remise_atomique` | Une remise est créée avec ses lettrages associés | Onglet `À encaisser` |
| Encaisser une remise | UPDATE statut remise + UPDATE ligne bancaire | La remise passe en `Encaissé`, la ligne bancaire est lettrée | Onglet `Encaissé` |

### 2.7 Extraction XLS

| Action | Cause | Conséquence | Où retrouver |
|--------|-------|-------------|--------------|
| Ouvrir l'extraction | Clic `Extraction` en haut à droite | Modale avec filtres période et client | Modale |
| Valider l'extraction | Requête + génération XLS | Téléchargement automatique du fichier | Téléchargements du navigateur |

---

## 3. Audit technique — Code et cohérence

### 3.1 Code mort confirmé

| Fichier | Élément | Problème |
|---------|---------|---------|
| `useDispatch411.ts` | `debounceRefs` (ligne ~44) | Déclaré, jamais utilisé. La recherche dans ce hook n'est pas deboncée. À supprimer. |
| `useLettrageForm.ts` | `creditDisponible` redéfini (~ligne 211) | Déjà calculé plus haut (~ligne 106), redéfini inutilement en dessous. |
| `useRequalification471.ts` | `null as string \| null` (~ligne 122) | Cast superflu, `null` est déjà du bon type. |

### 3.2 Duplications de logique

La fonction `chercherInfoFacture()` (recherche d'une facture par numéro via `v_factures_avec_reste_du`) est recopiée dans **5 fichiers** :
- `useLettrageForm.ts`
- `useDispatch411.ts`
- `useDispatch471.ts`
- `useRequalification471.ts`
- `ModalRemises.tsx`

**Recommandation** : extraire en hook partagé `useChercherFacture(key, numero, setLigne)`.

### 3.3 Messages d'erreur incorrects

| Fichier | Message actuel | Problème |
|---------|---------------|---------|
| `useDispatch471.ts` (~ligne 129) | `"Erreur lors du dispatch 411 Attente"` | Confusant — c'est un dispatch 411 Attente, pas 471. À corriger en `"Erreur lors de l'affectation de la ligne en attente"` |

### 3.4 Typage incomplet (RPCs non-typés)

| RPC | Fichier | Workaround actuel |
|-----|---------|-------------------|
| `dispatch_411` | `useDispatch411.ts` | Cast `as never` |
| `fn_upsert_libelle_sepa` | `useLettrageForm.ts` | `@ts-expect-error` |
| `creer_remise_atomique` | `useRemises.ts` | Cast `any` |

Ces RPCs ne sont pas dans les types générés Supabase. À régénérer ou à typer manuellement.

### 3.5 Gestion d'erreur absente

- `useNavigateurFactures.ts` : aucun `try/catch` sur les 6 appels Supabase. Si une requête échoue, l'utilisateur voit une liste vide sans message.
- `useLettrageForm.ts` : si `fn_upsert_libelle_sepa` échoue, l'erreur est ignorée silencieusement (le lettrage est quand même créé, mais l'apprentissage SEPA est perdu).

### 3.6 Tolérance numérique incohérente

| Contexte | Tolérance | Fichier |
|----------|-----------|---------|
| Seuil "considéré lettré" | 0.005 € | Partout dans les hooks |
| Validation LCR (écart accepté) | 0.05 € | `ModalRemises.tsx` |
| Warning LCR (écart signalé) | 0.005 € | `ModalRemises.tsx` |

Les 0.005 € sont codés en dur à ~15 endroits. Si on veut changer le seuil un jour, c'est une recherche-remplace dans tout le codebase.

**Recommandation** : une constante `TOLERANCE_CENT = 0.005` dans `lib/constantes.ts`.

### 3.7 Pas de contrôle de concurrence

Si deux opérateurs lettre la même ligne bancaire simultanément, le second écrase silencieusement le premier. Pas de lock, pas de version, pas de détection de conflit.

### 3.8 Vérification live des factures : timing fragile

Dans `useLettrageForm.ts`, la vérification live des factures (s'assurer que le restant dû est suffisant) se fait **au moment du clic Valider**, pas en continu. Si une facture est lettrée par un autre opérateur entre la saisie et le clic, l'erreur s'affiche mais aucun retry ni proposition alternative n'est offert.

---

## 4. Audit base de données

### 4.1 Tables directement écrites par le module

| Table | Opérations | Notes |
|-------|-----------|-------|
| `lettrages` | SELECT, INSERT | Cœur du système. Pas de UPDATE ni DELETE (les corrections utilisent des INSERT négatifs) |
| `factures` | SELECT, UPSERT | Upsert uniquement pour les pseudo-factures 411 |
| `lignes_bancaires` | SELECT, UPDATE | Seul champ modifié : `en_attente_471` |
| `libelles_sepa` | SELECT, RPC upsert | Dictionnaire auto-apprenant SEPA |
| `remises` | SELECT, INSERT, UPDATE, DELETE | Module remises CHQ/LCR |

### 4.2 Vues utilisées

| Vue | Utilisée dans | Optimisation |
|-----|--------------|-------------|
| `v_lignes_bancaires_avec_statut` | `useLignesBancaires` | Calcule statut + restant + `est_virement_471` |
| `v_factures_avec_reste_du` | 5 hooks + 1 composant | Optimisée via trigger `sync_reste_du` (migration 008) — O(1) |

### 4.3 RPCs utilisés

| RPC | Appelé depuis | Rôle |
|-----|--------------|------|
| `dispatch_411` | `useDispatch411` | INSERT correction (−) + INSERT vrais lettrages, tout en une transaction |
| `fn_upsert_libelle_sepa` | `useLettrageForm` | Apprentissage automatique du dictionnaire SEPA |
| `creer_remise_atomique` | `useRemises` | Création atomique remise + lettrages |

### 4.4 Trigger critique

`sync_reste_du` (migration 008) : maintient le champ dénormalisé `reste_du` dans `factures` à chaque INSERT/DELETE dans `lettrages`. C'est ce qui permet à `v_factures_avec_reste_du` d'être un simple SELECT sans GROUP BY.

**Point d'attention** : si un INSERT dans `lettrages` échoue après que le trigger ait tourné (cas théorique), `reste_du` pourrait être désynchronisé. En pratique non-bloquant car les INSERT lettrage et trigger sont dans la même transaction.

### 4.5 Évolution du modèle 411/471 (migration 057)

**Avant (056)** : dispatch_411 supprimait (`DELETE`) les lettrages 411 temporaires puis créait les vrais.

**Après (057)** : dispatch_411 crée des **corrections négatives** (INSERT avec montant < 0) au lieu de supprimer. Avantages : traçabilité complète, compatible avec l'audit, pas de perte d'historique.

**Conséquence côté vue** : `v_lignes_bancaires_avec_statut` agrège les montants lettrés en faisant `SUM(montant)` — les négatifs s'annulent naturellement avec les positifs.

---

## 5. Points d'amélioration — Priorités

### Priorité haute (impact fonctionnel)

1. **Supprimer `debounceRefs` dans `useDispatch411.ts`** — code mort, risque de confusion
2. **Corriger le message d'erreur dans `useDispatch471.ts`** — "411 Attente" vs "471"
3. **Ajouter try/catch dans `useNavigateurFactures.ts`** — risque d'écran vide silencieux
4. **Extraire la constante de tolérance** `TOLERANCE_CENT = 0.005` dans un fichier partagé

### Priorité moyenne (qualité code)

5. **Extraire `useChercherFacture()`** — hook partagé pour les 5 occurrences identiques
6. **Typer les RPCs** `dispatch_411`, `fn_upsert_libelle_sepa`, `creer_remise_atomique`
7. **Supprimer le cast superflu** dans `useRequalification471.ts` (ligne ~122)

### Priorité basse (nice to have)

8. **Contrôle de concurrence** — `updated_at` ou version sur `lettrages` pour détecter les conflits multi-opérateurs
9. **Retry sur validation** — si la facture est lettrée entre la saisie et le clic, proposer de recharger plutôt que d'afficher une erreur brute
10. **Brouillon de formulaire** — ne pas perdre les lignes saisies si l'opérateur change de filtre par erreur

---

## 6. Fonctionnalités non exposées / invisibles pour l'opérateur

Ces mécanismes fonctionnent en arrière-plan mais l'opérateur ne les voit pas :

| Mécanisme | Ce qu'il fait | Déclencheur |
|-----------|--------------|-------------|
| Apprentissage SEPA | Associe un libellé bancaire à un code client | Chaque lettrage validé |
| Trigger `sync_reste_du` | Met à jour le restant dû dans `factures` | Chaque INSERT dans `lettrages` |
| Dénormalisation `reste_du` | Stocke le solde directement dans `factures` | Trigger automatique |
| Rafraîchissement silencieux | Recharge la liste sans spinner | Après chaque lettrage réussi |
| Calcul `est_virement_471` | Détecte les lignes avec lettrage code_client='471' | Vue calculée à chaque requête |

---

*Document généré après analyse statique du code source. Ne couvre pas les données réelles en base.*
