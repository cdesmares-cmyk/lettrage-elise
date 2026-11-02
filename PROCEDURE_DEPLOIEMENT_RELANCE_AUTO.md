# Déployer et tester `relance-auto`

**Créé le** : 2026-11-02
**Pourquoi ce document** : cette fonction a été mise en panne une fois par un
déploiement, pendant plusieurs semaines, sans que rien ne le signale. La
procédure n'est pas intuitive et elle ne s'improvise pas.

---

## La règle qui prime sur toutes les autres

**Déployer par la ligne de commande. Jamais par le dashboard Supabase.**

`relance-auto` porte sa propre authentification : elle compare l'en-tête
`x-cron-secret` au secret `CRON_SECRET` avant de faire quoi que ce soit. La
vérification de jeton de la plateforme doit donc rester **désactivée**, sinon
elle rejette l'appel du cron avant même que le code démarre.

Ce réglage est déclaré dans [`supabase/config.toml`](supabase/config.toml) :

```toml
[functions.relance-auto]
verify_jwt = false
```

- **La ligne de commande lit ce fichier.** Le réglage est appliqué par
  construction, il n'y a rien à penser.
- **Le dashboard l'ignore.** Il expose une case à cocher « Verify JWT », et un
  déploiement depuis l'interface la remet à sa valeur par défaut, c'est-à-dire
  activée.

**C'est ce qui s'est passé le 24 septembre 2026.** Le cron a renvoyé
`401 UNAUTHORIZED_NO_AUTH_HEADER` chaque matin pendant des semaines. Aucune
alerte, aucun mail d'erreur : du point de vue de la plateforme, tout allait
bien, c'est l'appelant qui était refusé. Personne ne s'en est aperçu avant de
constater qu'aucune relance ne partait plus.

Si vous n'avez vraiment pas d'autre choix que le dashboard : après le
déploiement, aller dans les réglages de la fonction et **vérifier que « Verify
JWT » est bien décoché**, puis lancer la simulation ci-dessous pour confirmer.

---

## 1. Déployer

Dans un terminal, depuis le dossier du projet.

```powershell
cd "C:\Users\elise\Desktop\1 - Ockham\Projet Dév Lettrage\lettrage-elise"
```

**Vérifier sur quelle branche on est**, et c'est l'étape qu'on oublie :

```powershell
git branch --show-current
```

Le déploiement envoie **le fichier présent sur le disque**, pas celui de
`main` ni celui de GitHub. Déployer depuis la mauvaise branche envoie
silencieusement une autre version du code.

```powershell
npx supabase functions deploy relance-auto
```

Attendu, à la fin :

```
Deployed Functions on project aqxsqmgtmenjpfrblqoe: relance-auto
```

Durée : une vingtaine de secondes.

---

## 2. Tester, sans envoyer un seul mail

La fonction accepte `?dry_run=1` : elle fait **tout** le travail, charge les
données, décide client par client, et n'envoie rien. Elle n'écrit pas dans
`relances_auto_log` et ne met pas à jour l'organisation.

La fonction SQL `lancer_relance_auto()` (migration 179) appelle la fonction avec
le bon en-tête. Son paramètre vaut `true` par défaut, donc **simulation par
défaut** : on ne déclenche pas un envoi réel par inattention.

```sql
SELECT lancer_relance_auto();
```

Elle renvoie un identifiant de requête. `pg_net` est asynchrone, la réponse
arrive dans une autre table. **Attendre deux ou trois secondes**, puis :

```sql
SELECT status_code,
       content::jsonb -> 'partiraient' AS partiraient,
       content::jsonb -> 'ecartes'     AS ecartes
FROM   net._http_response
ORDER  BY id DESC
LIMIT  1;
```

Puis le détail, une ligne par client examiné. C'est la réponse à la question
que le journal de l'application ne sait pas traiter : **pourquoi ce client
n'a-t-il pas été relancé ?**

```sql
SELECT d->>'client'   AS code_client,
       d->>'nom'      AS nom,
       d->>'decision' AS decision,
       d->>'detail'   AS motif
FROM   net._http_response r,
       LATERAL jsonb_array_elements(r.content::jsonb -> 'detail') d
WHERE  r.id = (SELECT MAX(id) FROM net._http_response)
ORDER  BY decision, nom;
```

### Envoyer pour de vrai

Une fois la simulation relue, et seulement après :

```sql
SELECT lancer_relance_auto(false);
```

---

## 3. Lire les erreurs

**Deux `401` se ressemblent et ne disent pas du tout la même chose.**

| Réponse | Signification | Que faire |
|---|---|---|
| `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` | La plateforme a bloqué **avant** le code. La vérification de jeton s'est rallumée. | Redéployer par la ligne de commande, ou décocher « Verify JWT » dans le dashboard. |
| `unauthorized` renvoyé par la fonction | Le code a tourné et a refusé l'en-tête. `CRON_SECRET` ne correspond pas. | Vérifier le secret dans `lancer_relance_auto` et dans les secrets de la fonction. |

**Un tableau `detail` absent est un signal en soi** : si la requête de détail ne
renvoie aucune ligne alors que `status_code` vaut 200, c'est que la réponse
n'avait pas la forme attendue. La fonction n'est pas allée au bout.

**Inversement**, un tableau `detail` rempli avec des motifs lisibles prouve que
la fonction a exécuté toute sa logique : la vérification de jeton n'est pas
rallumée, le secret est bon, les données ont été chargées. C'est le meilleur
contrôle de non-régression disponible, et il tient en une requête.

---

## 4. Ce que la fonction écarte, et pourquoi

Les contrôles s'appliquent **dans cet ordre**. Le premier qui déclenche donne
le motif, les suivants ne sont pas évalués. C'est utile à savoir pour un test :
un client écarté par la déduplication ne révèle rien sur ses contacts ni sur
ses factures.

1. **Déduplication** — un contact client récent, dans la fenêtre
   `delai_rerelance_jours` de l'organisation. Trois sources :
   - `relances_auto_log` — les envois du robot
   - `relances` — les relances envoyées par un opérateur, externes seulement
   - `echanges_clients` — les appels et mails tracés hors de l'outil
     (migrations 182, 183 et 186, non archivés)
2. **Contacts** — aucun contact actif portant le rôle relance ou comptabilité.
   La comparaison est tolérante à la casse et aux accents depuis le
   2026-10-31 : `Relance`, `relance` et `Relances` sont reconnus.
3. **Factures** — aucune facture échue depuis plus de
   `delai_declenchement_relance_jours`, ou toutes marquées « ne pas relancer ».
4. **Solde** — les avoirs et les crédits 411 couvrent la totalité de la dette.

---

## 5. Retour arrière

Il n'y a pas de bouton. Pour revenir à une version antérieure :

```powershell
git log --oneline -- supabase/functions/relance-auto/index.ts
git checkout <commit> -- supabase/functions/relance-auto/index.ts
npx supabase functions deploy relance-auto
git checkout HEAD -- supabase/functions/relance-auto/index.ts
```

La dernière ligne remet le fichier du dépôt en place : sans elle, le disque
reste sur l'ancienne version et le prochain déploiement la renverrait.

**Après tout retour arrière, relancer la simulation.** Une version antérieure
peut très bien ne pas connaître une table créée depuis.

---

## Historique des déploiements

| Date | Contenu | Remarque |
|---|---|---|
| 2026-09-24 | Scénario externe, factures bloquées, doublons, mode simulation | A rallumé la vérification de jeton. Cron en panne silencieuse jusqu'à fin octobre. |
| 2026-11-02 | Déduplication sur `echanges_clients` + tolérance sur les rôles contact | Vérifié par simulation. 63111 écarté avec le nouveau motif, aucun nouveau client relançable. |
| *(à venir)* | Prise en compte de `archivee` sur `echanges_clients` | Migration 186. Sans ce déploiement, le robot ignore les suppressions d'échanges. |
