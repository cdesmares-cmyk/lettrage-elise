-- Migration 180 : normaliser le role des contacts, en base
--
-- POURQUOI. role_contact est du texte libre depuis la migration 040, et
-- l'import ecrivait la valeur du fichier telle quelle. Mesure du 2026-10-31 :
-- 1357 contacts sur 2504 portent « Relance » ou « Comptabilite » avec majuscule
-- ou accent. Tous viennent d'un import, aucun d'une saisie a l'ecran.
--
-- Deux consequences, pas une :
--   1. La relance automatique ne les reconnaissait pas (corrige cote code le
--      2026-10-31, la comparaison est desormais tolerante).
--   2. Le badge de role du panneau Contacts cherche la valeur dans une liste
--      fermee et retombe sur « Autre » quand il ne trouve pas. Ces 1357
--      contacts s'affichent donc avec une etiquette fausse.
--
-- Le code tolere maintenant les deux orthographes, donc cette normalisation
-- n'est pas un prerequis technique. Elle corrige l'etiquette affichee et remet
-- la base au propre.
--
-- POURQUOI UNE FONCTION PLUTOT QU'UN UPDATE. Elle est rejouable : apres chaque
-- import, ou depuis un bouton du module Nettoyage. Elle renvoie le nombre de
-- lignes corrigees, donc on sait ce qui s'est passe.
--
-- PAS DE RISQUE DE COLLISION. La contrainte UNIQUE porte sur
-- (organisation_id, email, code_client). Le role n'en fait pas partie : aucune
-- ligne ne peut en percuter une autre. Les emails, eux, sont un autre sujet —
-- les normaliser PEUT violer cette contrainte, et ce n'est pas traite ici.

-- ── 1. La normalisation, exactement celle du code TypeScript ────────────────
--
-- translate() plutot qu'unaccent() : pas de dependance a une extension.
-- IMMUTABLE : utilisable dans un WHERE, et indexable si le besoin vient.
CREATE OR REPLACE FUNCTION normaliser_role_contact(r text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(translate(btrim(coalesce(r, '')),
    'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
    'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy'))
$$;


-- ── 2. L'action ─────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER, et c'est le point important. Avec INVOKER le RLS
-- s'applique : la fonction ne touche que les contacts de l'organisation de
-- l'appelant. En DEFINER, un operateur de SAS MELEZE normaliserait aussi la
-- base d'Elise Lyon — exactement le genre de fuite entre clients que la
-- migration 162 a corrigee.
CREATE OR REPLACE FUNCTION normaliser_roles_contacts()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_nb integer;
BEGIN
  UPDATE contacts_client
  SET    role_contact = normaliser_role_contact(role_contact)
  WHERE  role_contact IS DISTINCT FROM normaliser_role_contact(role_contact);

  GET DIAGNOSTICS v_nb = ROW_COUNT;
  RETURN v_nb;
END;
$$;

-- Elle ecrit sur des donnees client : pas accessible a n'importe qui.
REVOKE ALL ON FUNCTION normaliser_roles_contacts() FROM PUBLIC;


-- ═══════════════════════════════════════════════════════════════════════════
--  MODE D'EMPLOI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. VOIR AVANT D'AGIR. Lecture seule, aucune modification.
--
--    SELECT role_contact                       AS avant,
--           normaliser_role_contact(role_contact) AS apres,
--           COUNT(*)                           AS nb
--    FROM   contacts_client
--    WHERE  role_contact IS DISTINCT FROM normaliser_role_contact(role_contact)
--    GROUP  BY 1, 2
--    ORDER  BY nb DESC;
--
-- 2. CORRIGER. Renvoie le nombre de lignes modifiees.
--
--    SELECT normaliser_roles_contacts();
--
-- 3. VERIFIER. La meme requete qu'en 1 doit renvoyer zero ligne.
--
-- Rejouable sans effet de bord : une ligne deja normalisee n'est pas touchee,
-- le WHERE l'exclut. Appeler la fonction deux fois de suite renvoie 0 la
-- seconde fois.
--
--
-- LES ROLES INCONNUS NE SONT PAS TRADUITS. « Service compta » devient
-- « service compta », pas « comptabilite ». C'est volontaire, et c'est le meme
-- choix que l'import : normaliser n'est pas deviner. Un rapprochement
-- automatique sur une base de 2504 contacts rangerait forcement quelques
-- contacts dans la mauvaise categorie, et personne ne s'en apercevrait. Ce qui
-- reste non reconnu apparait dans l'onglet Contacts du module Nettoyage, ou il
-- se range a la main, en connaissance de cause.
--
--
-- LES EMAILS NE SONT PAS TOUCHES. Les mettre en minuscules peut violer
-- UNIQUE (email, code_client) si un client a deux contacts dont les adresses ne
-- different que par la casse. A traiter separement, apres ce controle :
--
--    SELECT code_client, lower(btrim(email)) AS email, COUNT(*)
--    FROM   contacts_client
--    GROUP  BY 1, 2
--    HAVING COUNT(*) > 1;
--
--
-- RETOUR ARRIERE : il n'y en a pas. La casse d'origine n'est conservee nulle
-- part. Prenez une copie si vous y tenez :
--
--    CREATE TABLE contacts_client_roles_20261102 AS
--    SELECT id, role_contact FROM contacts_client;
