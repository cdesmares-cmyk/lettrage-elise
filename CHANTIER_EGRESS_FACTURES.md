# Chantier EGRESS — Refactoring du chargement des factures

**Créé le** : 2026-07-29  
**Statut** : En attente d'exécution  
**Priorité** : Avant intégration du client n°2

---

## Contexte

### Problème
Supabase EGRESS dépassé (6.47 GB / 5 GB mensuel) depuis la correction de pagination du 2026-07-21.  
Avant cette correction : timeout à ~3 000 lignes → ~180 KB/poll.  
Après cette correction : 54 961 factures chargées → ~3.3 MB/poll.  
Avec un timer à 60s et l'app ouverte ~2h/jour : **~6 GB/mois**.

### Correctif immédiat appliqué (2026-07-29)
- `AppDataContext` : timer 60s → **300s**, focus cooldown 30s → **120s**
- `useDetectionListe` : `.limit(500)` sur fRows, `.limit(200)` sur fNums, passe 2 plafonnée à 15 lignes
- Gain estimé : **~75% de réduction EGRESS** — donne plusieurs mois de marge sur le plan actuel

### Limites du correctif immédiat
Le correctif ralentit la fréquence de poll mais ne change pas l'architecture.  
Avec 10 nouveaux clients multi-tenant, chacun avec leur historique, le volume de factures par organisation va croître. Le plan gratuit (5 GB/mois) ne tiendra pas à cette échelle même avec le polling réduit.

---

## Diagnostic technique

### Consommateurs de `facturesActives` (AppDataContext)

**Catégorie A — Agrégats globaux** (calculs sur toutes les factures) :
| Fichier | Usage |
|---|---|
| `useComptesClients.ts` | KPIs encours total, nb impayées, avoirs, 411, creditParClient, nbPiecesParClient |
| `useDashboard.ts` | Calculs dashboard (filtre hors 411_ et avoirs) |
| `ListePriorites.tsx` | Top 10 clients avec factures impayées pour score de priorité |
| `KpisRelances.tsx` | Total euros des relances actives |
| `BarreKpisRelances.tsx` | Map factures → montants par relance |
| `PipelineRelances.tsx` | Stats pipeline relances |
| `TableauRelances.tsx` | Map globale numero_piece → facture pour affichage |

**Catégorie B — Factures d'un client spécifique** (candidats on-demand) :
| Fichier | Usage |
|---|---|
| `useFacturesClient.ts` | `getFactures(codes)` — filtre par code_client |
| `PageCompteClient.tsx` | KPIs dynamiques par plage de dates + facture 411 active |
| `ModalClientTdb.tsx` | Factures d'un client pour modal tableau de bord |
| `ModalCompositionRelance.tsx` | Factures impayées d'un client pour composer une relance |
| `ModalRelanceMasse.tsx` | Factures impayées par client pour relances en masse |

**Catégorie C — Cas spéciaux** :
| Fichier | Usage |
|---|---|
| `PageLettrage.tsx` | Comptes 411_ actifs uniquement (pool très petit, ~quelques dizaines) |

---

## Plan de migration en 4 phases

### Phase 0 — Réduction du polling *(FAIT — 2026-07-29)*
Timer 60s → 300s. Focus cooldown 30s → 120s.  
**Gain : ~75% EGRESS. Donne ~3-4 mois de marge.**

---

### Phase 1 — Arrêter de re-poller les factures
**Risque : faible | Durée estimée : 1h | À faire : dès que possible**

**Ce qui change :**  
Les factures sont chargées **une seule fois** au login. Le cycle de poll à 300s continue uniquement pour les clients et les méta-données de l'organisation. Les factures ne sont plus rechargées automatiquement.

**Pourquoi c'est safe :**  
Les mises à jour locales optimistes couvrent déjà 100% des mutations utilisateur :
- `mettreAJourResteDuLocal` → après un lettrage
- `mettreAJourStatutLocal` → après un changement de statut
- `supprimerFactureLocale` → après suppression

Le polling ne sert qu'à resynchroniser si quelque chose change en dehors de la session — cas quasi inexistant en usage mono-opérateur.

**Régression possible :**  
Si deux opérateurs travaillent en parallèle, le second ne voit pas les mises à jour du premier sans rafraîchir. Mitigation : bouton "Rafraîchir" visible + rechargement au retour sur l'onglet (focus event, déjà en place).

**Gain EGRESS :** supprime les ~95% de rechargements résiduels liés au polling.

---

### Phase 2 — Déporter les KPIs globaux en SQL
**Risque : faible | Durée estimée : 2-3h | À faire : avant client n°2**

**Observation clé :**  
`v_comptes_clients` expose déjà `encours_total` et `nb_impayees` **par client**.  
Les KPIs globaux de `useComptesClients` (encours somme nette, total TTC, avoirs) sont un simple `SUM()` sur ce qui est déjà en mémoire dans les clients — inutile de charger 54 961 factures pour ça.

**Ce qui change :**
- `useComptesClients.kpis` : recalculé depuis les données clients (déjà en mémoire) plutôt que depuis les factures
- `useDashboard` : agrégats lus depuis les données clients
- `ListePriorites`, `KpisRelances`, `BarreKpisRelances`, `PipelineRelances` : une RPC ou vue SQL retourne les agrégats nécessaires pour les relances actives

**Régression possible :**  
Écarts de calcul si les agrégats SQL ne correspondent pas exactement aux calculs JS actuels. À valider sur un échantillon avant déploiement.

---

### Phase 3 — Factures à la demande par client
**Risque : moyen | Durée estimée : 1 session | À faire : avant client n°2**

**Ce qui change :**  
`facturesActives` disparaît de `AppDataContext`. `useFacturesClient` (qui existe déjà avec un pattern de cache local par session) charge les factures d'un client **quand sa page s'ouvre**. Résultat mis en cache pour la durée de la session.

**Impact UX :**  
- Première ouverture d'un compte client → ~150-200ms (skeleton)
- Réouverture dans la même session → instantané (cache)
- Comportement équivalent à Salesforce, HubSpot, Pennylane — standard du marché

**Consommateurs à adapter :**
- `useFacturesClient` : passe de "filtre sur cache global" à "charge à la demande + cache session"
- `PageCompteClient`, `ModalClientTdb`, `ModalCompositionRelance` : utilisent déjà `useFacturesClient`, migration transparente
- `ModalRelanceMasse` : charge les factures des clients concernés au moment du déclenchement
- `PageLettrage` (comptes 411_) : requête ciblée sur les pseudo-factures 411, dataset très petit

**Régression possible :**  
Invalidation du cache après un lettrage (si le reste_du d'un client change, son cache local doit être mis à jour). La logique optimiste existante (`mettreAJourResteDuLocal`) doit être branchée sur le cache par client plutôt que sur le tableau global.

---

### Phase 4 — Adapter les composants relances
**Risque : moyen | Durée estimée : 1 session | Après stabilisation client n°2**

Les composants relances sont les plus complexes à migrer : ils ont besoin de factures **cross-clients** (une relance peut référencer plusieurs clients).

**Ce qui change :**
- `TableauRelances` : charger les factures des relances **visibles à l'écran** (pagination) plutôt que la map globale
- `ListePriorites` : RPC SQL qui retourne directement le top 10 avec montants et nb factures — plus besoin du calcul JS
- `KpisRelances`, `BarreKpisRelances`, `PipelineRelances` : agrégats SQL par relance active

**Régression possible :**  
Cohérence entre les données relances et les données facturation. Si une relance référence des factures déjà lettrées, l'affichage doit rester correct. À tester exhaustivement sur des cas réels.

---

## Ordre d'exécution

| Phase | Statut | Complexité | Gain EGRESS | Avant client n°2 |
|---|---|---|---|---|
| 0 — Polling réduit | ✅ Fait | — | ~75% | Fait |
| 1 — Stop re-poll factures | ⏳ À faire | 1h | +15% | **Oui** |
| 2 — KPIs en SQL | ⏳ À faire | 2-3h | mineur | **Oui** |
| 3 — On-demand par client | ⏳ À faire | 1 session | fondamental | **Oui** |
| 4 — Relances | ⏳ À faire | 1 session | mineur | Non urgent |

---

## Budget Supabase

| Plan | Prix | EGRESS | Adapté pour |
|---|---|---|---|
| Free | 0€ | 5 GB/mois | 1 client, usage modéré |
| Pro | ~23€/mois | 50 GB/mois | 2-5 clients actifs |
| Pro + surcoût EGRESS | 23€ + 0.09$/GB | Illimité | 5+ clients |

**Recommandation :** passer en Pro dès le 2e client actif.  
L'architecture en Phases 1-3 reste nécessaire indépendamment du plan payant — c'est une question de performance et de scalabilité, pas seulement de coût.

---

## Critères de validation avant déploiement de chaque phase

- [ ] KPIs globaux identiques avant/après (encours total, nb impayées, avoirs)
- [ ] Ouverture d'un compte client : données correctes et complètes
- [ ] Lettrage d'une facture → reste_du mis à jour immédiatement dans l'UI
- [ ] Annulation d'un lettrage → reste_du restauré
- [ ] Relance manuelle : liste des impayées correcte
- [ ] Relance masse : factures de chaque client correctement chargées
- [ ] Module 411 : comptes 411_ actifs visibles dans PageLettrage
