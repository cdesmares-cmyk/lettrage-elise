# lettrage-elise — application OCKHAM

SaaS de lettrage comptable et de recouvrement. **En production chez un client
payant** sur `app.ockham-finance.com`. Les règles de collaboration et la grille de
risque sont dans le `CLAUDE.md` du dossier parent.

## Ton des textes affichés

Les libellés, messages et textes visibles par l'utilisateur s'écrivent **comme un
humain parlerait à un directeur financier** : phrases courtes, verbes simples, zéro
jargon gratuit. Pas de tics d'IA (`__gras souligné__`, tirets cadratins en rafale,
« il est important de noter que »). Sobre et concret : c'est ce qui donne l'image
d'un outil simple et sérieux.

## Stack

React 19 · Vite 8 · TypeScript · Tailwind 4 · Supabase (Postgres + Auth + Edge
Functions) · React Router 7 · TanStack Table · Recharts · xlsx / papaparse pour les
imports.

~34 000 lignes de front (166 fichiers), 15 Edge Functions, 160 migrations SQL.

## Commandes

```bash
npm run build    # tsc -b && vite build — LA barrière. C'est ce que Vercel exécute.
npm run dev      # serveur local
npm run lint     # informatif seulement, ne bloque aucun déploiement
```

**Aucun test automatisé.** `npm run build` et la relecture du diff sont les seuls
filets. Un build qui passe ne prouve pas qu'un montant est juste.

## Architecture multi-organisations

Chaque donnée porte un `organisation_id`. L'isolation entre clients repose
**entièrement sur le RLS** (Row Level Security : règle posée en base qui filtre
ligne par ligne ce qu'un utilisateur a le droit de lire) — le front ne filtre pas
lui-même.

**Motif canonique de toute nouvelle policy :**

```sql
CREATE POLICY "<table>_org_isolation" ON <table>
  FOR ALL
  USING      (organisation_id = get_my_organisation_id())
  WITH CHECK (organisation_id = get_my_organisation_id());
```

Fonctions d'aide disponibles : `get_my_organisation_id()`, `get_my_role()`,
`is_superadmin()`.

**Jamais `USING (auth.uid() IS NOT NULL)`** ni `auth.role() = 'authenticated'` :
ça veut dire « n'importe qui de connecté », toutes organisations confondues. C'est
exactement ce qui a causé la fuite corrigée en migration 162.

Rôles : `superadmin`, `admin`, `responsable_poste_client`, `commercial`, `externe`.

## Migrations — lire avant toute évolution de schéma

⚠️ **Ne jamais lancer `supabase db push`, `db reset` ou `db remote commit`.**

La base a été construite **à la main via l'éditeur SQL**, pas par la CLI.
`supabase migration list` montre la colonne *Remote* vide : le serveur ne garde
aucune trace des migrations appliquées. Un `db push` tenterait de rejouer les 160
fichiers depuis `001` sur la base du client.

**Procédure :** écrire le fichier dans `supabase/migrations/` pour la trace, puis
faire exécuter le SQL par Clément dans l'éditeur SQL du tableau de bord Supabase.

## Vérifier la sécurité — par le test, jamais par lecture

Une analyse statique du SQL a déjà donné un **faux feu vert**. La seule preuve
valable est empirique :

1. Se connecter avec un compte **non-superadmin** d'une organisation vide
2. Tenter de lire les données d'une autre organisation
3. Compter les lignes — jamais lire le contenu

```bash
curl -s -I "$URL/rest/v1/<table>?select=*&organisation_id=eq.<AUTRE_ORG>" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Prefer: count=exact" -H "Range: 0-0" | grep -i content-range
```

Toute valeur > 0 est une fuite. À rejouer pour **chaque nouvelle table**.

## Pièges connus

**Dérive de schéma.** `gmail_tokens` et `commentaires_factures` sont utilisées par
le front mais **absentes des migrations** — créées à la main. Une base reconstruite
depuis les migrations serait incomplète et l'app casserait. Bloque tout projet de
base de test ou de restauration.

**`src/lib/parseursImport.ts`** — lit les fichiers d'import clients. 14 problèmes de
lint, aucun test. Zone 🔴 : ne pas refactoriser sans raison forte.

**Le front ne filtre pas par organisation.** Ex. `useCommentairesFactures.chargerTous()`
charge tout ce que le RLS laisse passer, indexé par `numero_piece`. Si le RLS est
laxiste, deux clients ayant le même numéro de facture se marchent dessus.

**113 erreurs de lint, 39 warnings.** Majoritairement des règles React 19 récentes
(`set-state-in-effect`, `exhaustive-deps`) : le code ne s'est pas dégradé, les règles
se sont durcies. **Règle du scout** : on corrige le lint d'un fichier qu'on ouvre
pour une autre raison, jamais de nettoyage de masse — sans tests, c'est refactoriser
à l'aveugle une app en production.

**Bundle de 915 ko** sur `index-*.js`. Connu, non prioritaire.

## Secrets et variables

`.env` (jamais commité) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_GMAIL_CLIENT_ID` — cette dernière est **inutilisée**, l'identifiant Google est
en dur dans `src/hooks/useGmailAuth.ts`.

L'URL et la clé `anon` sont **publiques par conception** : elles partent dans le
navigateur. Ce n'est pas une faille — la protection, c'est le RLS.

Intégrations OAuth : Gmail (`gmail.send`, `calendar.events`) et Outlook
(`Mail.Send`, `Calendars.ReadWrite`). Le `redirect_uri` pointe vers une Edge
Function Supabase fixe, donc l'OAuth fonctionne aussi depuis une preview — mais
l'envoi part chez de **vrais clients**.

## Déploiement

Push sur `main` → build Vercel → production. Une preview de branche utilise **les
mêmes variables d'environnement**, donc la **base de production**.

Lire les logs d'un build échoué :

```bash
vercel inspect --logs <url-du-deploiement>
```
