-- Migration 152 : Relances internes d'encours
-- Permet de créer des scénarios de type "interne" pour notifier des opérateurs
-- (commerciaux) par email — sans envoi au client, sans gamification.

-- Colonne type sur scenarios_relance
ALTER TABLE scenarios_relance
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'externe'
  CHECK (type IN ('externe', 'interne'));

-- Colonne type sur relances (pour distinguer visuellement dans l'historique)
ALTER TABLE relances
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'externe'
  CHECK (type IN ('externe', 'interne'));

CREATE INDEX IF NOT EXISTS idx_relances_type ON relances(type);

-- Scénario par défaut "Alerte encours" — modifiable par l'admin
INSERT INTO scenarios_relance (organisation_id, nom, niveau, type, objet, corps_texte)
SELECT
  id,
  'Alerte encours',
  1,
  'interne',
  '[Alerte] Encours client — [Nom client]',
  'Bonjour,

Ton client [Nom client] ([Code client]) présente un encours de [Montant dû] en attente de règlement.

[Tableau Factures]

Merci de prendre contact avec lui rapidement pour convenir d''un rendez-vous ou d''un plan de règlement.

Cordialement,'
FROM organisations
WHERE slug = 'elise-lyon';
