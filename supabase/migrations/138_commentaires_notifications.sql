-- ══════════════════════════════════════════════════════════════════════
-- Migration 138 — Système de commentaires internes + notifications
-- Contextes : client, facture, relance, procédure
-- ══════════════════════════════════════════════════════════════════════

-- ── Table commentaires ─────────────────────────────────────────────────
CREATE TABLE public.commentaires (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  organisation_id UUID        NOT NULL,
  auteur_id       UUID        NOT NULL,
  corps_texte     TEXT        NOT NULL CHECK (char_length(corps_texte) BETWEEN 1 AND 4000),
  mentions        UUID[]      NOT NULL DEFAULT '{}',
  contexte        TEXT        NOT NULL,
  contexte_id     TEXT        NOT NULL,
  reponse_a       UUID        NULL,
  cree_le         TIMESTAMPTZ NULL DEFAULT NOW(),
  modifie_le      TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT commentaires_pkey PRIMARY KEY (id),
  CONSTRAINT commentaires_auteur_fkey
    FOREIGN KEY (auteur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
  CONSTRAINT commentaires_organisation_fkey
    FOREIGN KEY (organisation_id) REFERENCES organisations(id),
  CONSTRAINT commentaires_reponse_fkey
    FOREIGN KEY (reponse_a) REFERENCES commentaires(id) ON DELETE SET NULL,
  CONSTRAINT commentaires_contexte_check CHECK (
    contexte = ANY (ARRAY['client','facture','relance','procedure'])
  )
) TABLESPACE pg_default;

-- Index principal : chargement d'un fil (contexte + contexte_id + org)
CREATE INDEX idx_commentaires_fil
  ON public.commentaires USING btree (organisation_id, contexte, contexte_id, cree_le DESC)
  TABLESPACE pg_default;

-- Index secondaire : trouver les commentaires d'un auteur
CREATE INDEX idx_commentaires_auteur
  ON public.commentaires USING btree (auteur_id)
  TABLESPACE pg_default;

-- Réutilisation des triggers standards
CREATE TRIGGER commentaires_inject_org_id
  BEFORE INSERT ON commentaires
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

CREATE TRIGGER commentaires_maj_ts
  BEFORE UPDATE ON commentaires
  FOR EACH ROW EXECUTE FUNCTION maj_timestamp();


-- ── Table notifications ────────────────────────────────────────────────
CREATE TABLE public.notifications (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  organisation_id UUID        NOT NULL,
  destinataire_id UUID        NOT NULL,
  type            TEXT        NOT NULL DEFAULT 'mention',
  commentaire_id  UUID        NOT NULL,
  contexte        TEXT        NOT NULL,
  contexte_id     TEXT        NOT NULL,
  lu_le           TIMESTAMPTZ NULL,
  cree_le         TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_destinataire_fkey
    FOREIGN KEY (destinataire_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
  CONSTRAINT notifications_organisation_fkey
    FOREIGN KEY (organisation_id) REFERENCES organisations(id),
  CONSTRAINT notifications_commentaire_fkey
    FOREIGN KEY (commentaire_id) REFERENCES commentaires(id) ON DELETE CASCADE,
  CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY['mention','reponse'])
  )
) TABLESPACE pg_default;

-- Index principal : lecture des non-lues par destinataire
CREATE INDEX idx_notifications_destinataire
  ON public.notifications USING btree (destinataire_id, lu_le, cree_le DESC)
  TABLESPACE pg_default;

-- Index pour le DELETE CASCADE depuis commentaires
CREATE INDEX idx_notifications_commentaire
  ON public.notifications USING btree (commentaire_id)
  TABLESPACE pg_default;


-- ── Fonction + trigger : créer une notification par @mention ───────────
-- SECURITY DEFINER : contourne la RLS pour insérer dans notifications
-- (les notifications ne sont jamais créées directement par l'app)
CREATE OR REPLACE FUNCTION notifier_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  mention_id UUID;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  FOREACH mention_id IN ARRAY NEW.mentions
  LOOP
    -- Pas de notification pour l'auteur lui-même
    IF mention_id <> NEW.auteur_id THEN
      INSERT INTO public.notifications (
        organisation_id,
        destinataire_id,
        type,
        commentaire_id,
        contexte,
        contexte_id
      ) VALUES (
        NEW.organisation_id,
        mention_id,
        'mention',
        NEW.id,
        NEW.contexte,
        NEW.contexte_id
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER commentaires_notifier_mentions
  AFTER INSERT ON commentaires
  FOR EACH ROW EXECUTE FUNCTION notifier_mentions();


-- ── RLS — commentaires ─────────────────────────────────────────────────
ALTER TABLE public.commentaires ENABLE ROW LEVEL SECURITY;

-- Lecture : tout membre de la même organisation
CREATE POLICY "commentaires_select" ON public.commentaires
  FOR SELECT USING (
    organisation_id = (
      SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()
    )
  );

-- Insertion : l'auteur doit être l'utilisateur courant
-- (organisation_id est injecté par trigger BEFORE INSERT)
CREATE POLICY "commentaires_insert" ON public.commentaires
  FOR INSERT WITH CHECK (
    auteur_id = auth.uid()
  );

-- Modification : auteur uniquement (correction de coquille)
CREATE POLICY "commentaires_update" ON public.commentaires
  FOR UPDATE USING (auteur_id = auth.uid())
  WITH CHECK (auteur_id = auth.uid());

-- Suppression : auteur uniquement
CREATE POLICY "commentaires_delete" ON public.commentaires
  FOR DELETE USING (auteur_id = auth.uid());


-- ── RLS — notifications ────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Lecture : destinataire uniquement
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (destinataire_id = auth.uid());

-- Mise à jour (marquer lu) : destinataire uniquement
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (destinataire_id = auth.uid())
  WITH CHECK (destinataire_id = auth.uid());

-- Pas de INSERT policy : les notifications ne sont créées que via le
-- trigger notifier_mentions (SECURITY DEFINER), jamais directement.


-- ── Realtime — abonnements en temps réel ──────────────────────────────
-- Cloche notifications (badge) + fils commentaires live
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.commentaires;
