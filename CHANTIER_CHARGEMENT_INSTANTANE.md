# Chantier — Chargement instantané

**Créé le** : 2026-11-02
**Statut** : Réflexion, rien d'engagé
**À lire avec** : [CHANTIER_EGRESS_FACTURES.md](CHANTIER_EGRESS_FACTURES.md), qui
traite le même problème par une autre porte

---

## Le besoin, dit par Clément

> « On recharge naturellement les pages de notre côté. Assez souvent, je refresh
> pour actualiser, réflexe standard sur un SaaS. Dans quel monde est-il possible
> de ne pas réimporter 100 % des données mais de mettre à jour uniquement celles
> qui ont été modifiées pendant la session ? On réimporte 55 000 factures mais
> uniquement les 50 qui ont été lettrées par exemple. »

**Et surtout, la raison derrière le geste**, qui oriente toute la suite :

> « Un réflexe hygiène et un contrôle que l'info est passée. »

**Ce sont deux besoins distincts et ils n'appellent pas la même réponse.** Les
confondre, c'est se lancer dans le chantier le plus lourd alors que la moitié du
problème se règle autrement.

| Besoin | Ce qu'il réclame vraiment | Réponse adaptée |
|---|---|---|
| « Est-ce que mon lettrage est passé ? » | **De la confiance** | Un retour visuel explicite, ou Realtime |
| Réflexe d'hygiène | **Que ce soit gratuit** | Cache local |

---

## Où on en est aujourd'hui

### Pendant la session : c'est déjà fait

Un lettrage ne recharge rien. `mettreAJourResteDuLocal` met à jour en mémoire
les seules factures touchées — exactement le comportement décrit dans la
demande. Neuf points d'appel dans `PageLettrage.tsx` couvrent le lettrage, le
lettrage auto, les remises et les dispatchs.

### Au rechargement de page : tout est perdu

Il n'existe **aucun cache**. Un F5 vide la mémoire et l'application recharge
100 % des factures ouvertes.

**Donc le réflexe de refresh est le geste le plus coûteux de l'application.** Et
c'est le plus naturel sur un SaaS.

### Mesures du 2026-11-02

| Quoi | Valeur |
|---|---|
| Factures ouvertes, Elise Lyon | 47 056 |
| Volume transféré par rechargement complet | ~3,3 Mo *(mesuré 2026-07-29)* |
| Coût base d'un rechargement complet, avant optimisation | ~2 min de temps base |
| Après index 184/185 + pagination par curseur | ÷25 sur le coût unitaire |
| Après passage de la minuterie à 15 min | ÷3 sur la fréquence |

**Ce qui a été fait le 2026-11-02 réduit le coût du rechargement. Ça ne réduit
pas leur NOMBRE quand c'est l'utilisateur qui appuie sur F5.**

---

## Les briques disponibles

### 1. `factures.updated_at` — le signal existe déjà

Pour demander « qu'est-ce qui a bougé depuis 14h32 ? », il faut une colonne
horodatant chaque modification. Elle est là depuis la migration 001, maintenue
par `trg_factures_updated_at` → `maj_updated_at()`.

**Et elle est fiable pour les lettrages, ce qui n'allait pas de soi.** Le
déclencheur `sync_reste_du` (migration 008) fait un `UPDATE factures SET
reste_du = ...`, ce qui déclenche à son tour la mise à jour de `updated_at`. Un
lettrage laisse donc bien une trace horodatée sur la facture.

**Deux réserves :**

- `updated_at` n'a **pas de valeur par défaut**. Elle est `NULL` sur toute ligne
  jamais modifiée depuis sa création. Une requête de delta doit donc lire
  `COALESCE(updated_at, created_at)`.
- L'horodatage de référence doit venir **du serveur**, jamais de l'horloge du
  navigateur. Un poste mal réglé ferait sauter des modifications en silence.

### 2. IndexedDB — le bon stockage, et `localStorage` ne l'est pas

| | Capacité | Mode | Verdict |
|---|---|---|---|
| `localStorage` | 5 à 10 Mo | **Synchrone** | **À exclure** |
| IndexedDB | Plusieurs centaines de Mo | Asynchrone | Le bon outil |

`localStorage` est écarté pour deux raisons, et la seconde suffirait : le quota
ne laisse aucune marge sur ce volume, et surtout **l'écriture est synchrone,
donc elle gèle l'interface**. Écrire 47 000 factures y bloquerait l'écran.

IndexedDB est fait pour ça. 47 000 lignes ne sont rien pour lui.

### 3. Supabase Realtime — déjà en place dans Ockham

Au lieu de demander périodiquement « quoi de neuf », le serveur **pousse** chaque
modification au moment où elle arrive.

**Ce n'est pas une technologie à introduire :** `useCommentaires.ts` et
`useNotifications.ts` écoutent déjà `postgres_changes`. La plomberie, la
configuration du client et la publication Postgres fonctionnent.

**Ce que Realtime règle :**

- Le défaut mesuré le 2026-11-02 : deux opérateurs en parallèle, le second voit
  l'état d'il y a quinze minutes. Avec Realtime, il le voit en une seconde.
- **Le besoin « est-ce que mon lettrage est passé ? »** — c'est la réponse
  directe, et elle est bien moins chère que tout le reste.
- La minuterie de 15 minutes disparaîtrait entièrement.

**Ce que Realtime ne règle pas :** le F5. Au rechargement, il faut toujours un
état initial à afficher.

---

## L'architecture cible

Les trois briques font trois choses différentes. **Il les faut toutes les
trois**, et c'est ce qui fait le coût du chantier.

| Brique | Rôle |
|---|---|
| IndexedDB | L'affichage est instantané, même après un F5 |
| Delta sur `updated_at` | On rattrape ce qui a bougé pendant l'absence, en 50 lignes au lieu de 47 000 |
| Realtime | On reste à jour pendant la session, sans minuterie |

**Le résultat pour l'utilisateur :** il appuie sur F5 par réflexe, et
l'application est déjà là. Pas de squelette, pas d'attente, et les données sont
justes.

C'est l'architecture de Linear, Figma ou Superhuman. On l'appelle *local-first*
— la source immédiate est le disque de l'utilisateur, le serveur ne sert qu'à
rattraper l'écart.

---

## Les risques

### 1. Le cloisonnement entre organisations — le risque sérieux

**C'est la partie où il ne faut pas se tromper, et elle est spécifique à ce
projet.**

Un cache qui survit à la session est un endroit de plus où des données
d'organisation peuvent fuir. Et **cet endroit-là est sur le disque de
l'utilisateur, hors de portée du RLS** : aucune policy Postgres ne protège un
IndexedDB.

Ockham a déjà connu une fuite entre organisations, corrigée par la migration
162. Un cache local recrée exactement la même classe de bug, sans le filet.

**Ce qu'il faudrait :**

- Partitionner le cache par `organisation_id`.
- Le vider **à la déconnexion** et **à chaque bascule de structure**
  (`basculer_organisation`, migration 170).
- Un numéro de version dans le cache, incrémenté à chaque changement de schéma :
  sinon une colonne ajoutée rend le cache incohérent sans que rien ne le dise.

### 2. Les suppressions

Une requête « ce qui a changé depuis » sait dire ce qui a bougé. **Elle ne sait
pas dire ce qui a disparu.**

- **Cas facile** — une facture payée à 100 % : la ligne existe toujours, le
  delta la ramène avec `reste_du` à zéro, on la retire du cache. Ça marche.
- **Cas difficile** — une vraie suppression, après une réinitialisation
  d'import : rien ne la signale. Il faut soit une table de pierres tombales,
  soit une réconciliation complète périodique.

### 3. Les données sur la machine de l'utilisateur

Noms de clients, montants, encours restent sur le poste. Poste partagé,
portable volé : c'est une question à trancher consciemment, et elle rejoint le
sujet RGPD ouvert sur les contacts.

---

## Ordre d'exécution proposé

| Étape | Ce que ça apporte | Effort | Risque |
|---|---|---|---|
| **1 — Realtime sur `factures`** | Règle « est-ce que c'est passé ? ». Supprime la minuterie. | ~1/2 session | Faible, la plomberie existe |
| **2 — Delta sur `updated_at`** | Le rechargement ne ramène que ce qui a bougé | ~1 session | Moyen, les suppressions |
| **3 — Cache IndexedDB** | F5 instantané | ~1 session | **Élevé** : cloisonnement |

**Commencer par l'étape 1.** Elle répond à la moitié du besoin exprimé — le
contrôle que l'info est passée — pour une fraction du coût, et elle ne touche
pas au chargement central. Si elle suffit, le reste devient facultatif.

---

## Alternative à ne pas écarter trop vite

**Si le F5 sert surtout à vérifier qu'une action est passée, le vrai problème
est un manque de confiance dans le retour visuel, pas un problème de
fraîcheur.**

Avant de construire trois briques, il vaut la peine de regarder ce que l'écran
dit après un lettrage : est-ce qu'il confirme assez clairement ? Un retour
explicite et visible coûte une heure, pas trois sessions.

**À vérifier avant d'engager quoi que ce soit.** Si après un lettrage l'écran
affiche clairement ce qui vient de se passer, le réflexe de F5 pourrait
simplement disparaître.

---

## Articulation avec le chantier EGRESS

Les deux documents traitent le même problème par deux portes différentes.

- **CHANTIER_EGRESS_FACTURES.md** réduit le volume transféré : moins de
  factures chargées, agrégats déportés en SQL, chargement à la demande par
  client. Son objectif est le coût.
- **Ce document** rend le chargement instantané. Son objectif est le ressenti.

**Ils ne se contredisent pas, mais ils ne se cumulent pas non plus bêtement :**
la phase 3 du chantier EGRESS fait disparaître `facturesActives` du contexte
global, ce qui change complètement ce qu'il y aurait à mettre en cache ici.

**À arbitrer avant de lancer l'un ou l'autre.** Faire les deux dans le désordre,
c'est travailler deux fois.

---

## Critères de validation, le jour où ça se fait

- [ ] Après un F5, les totaux affichés sont identiques à ceux d'un chargement complet
- [ ] Après un lettrage dans une autre session, le delta ramène la facture modifiée
- [ ] Après une facture soldée à 100 %, elle disparaît bien du cache
- [ ] Après une réinitialisation d'import, le cache ne garde pas de factures fantômes
- [ ] **À la bascule de structure, le cache est vidé** — vérifié avec deux comptes de deux organisations sur le même navigateur
- [ ] À la déconnexion, le cache est vidé
- [ ] Un changement de schéma invalide le cache au lieu de le corrompre
