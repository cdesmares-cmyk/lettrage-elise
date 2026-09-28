-- Migration 167 : le graphique des encaissements distingue les flux hors clients
--
-- POURQUOI. Le graphique n'affichait que les lettrages rattaches a une ligne
--   bancaire, en excluant le compte d'attente 471. Mesure du 2026-09-28 sur
--   SAS MELEZE, 90 jours :
--     total des credits bancaires  1 343 520,88 €
--     dont lettre a un client      1 171 992,68 €   (affiche)
--     dont lettre en 471             171 528,20 €   (invisible)
--     dont jamais lettre                    0,00 €
--   13 % de la tresorerie entrante n'apparaissait nulle part.
--
--   Verification des libelles : ASP Agence Comptable (153 090 €), CPAM Rhone
--   (17 113 €), AXA France Vie, CPAM Isere. Aides publiques, remboursements de
--   securite sociale et prevoyance. AUCUN argent client : le 471 ne sert ici
--   qu'a loger ce qui n'a structurellement pas de client en face. Aucune
--   facture ne reste donc ouverte a tort, aucune relance a corriger.
--
-- CE QUI CHANGE. La fonction renvoie une colonne de plus, montant_autres.
--   Le calcul se fait LIGNE PAR LIGNE : credit de la ligne moins ce qui a ete
--   lettre a un client, plancher a zero. Une soustraction de deux totaux
--   produirait un montant negatif des qu'une ligne presente une anomalie, et
--   la barre se retournerait.
--
--   Ce seul calcul ramasse les trois cas : lettre en 471, jamais lettre, et
--   reliquat d'une ligne lettree partiellement.
--
-- CE QUI NE CHANGE PAS. La colonne montant garde EXACTEMENT sa definition
--   d'avant, requete comprise. Elle n'est pas recalculee a partir des credits :
--   un lettrage pose sur une ligne au debit y serait perdu. Les deux montants
--   sont donc agreges separement puis rapproches par date. Un front qui ne lit
--   que montant continue de fonctionner a l'identique.
--
-- RETOUR ARRIERE : rejouer 153_rpc_encaissements_clients.sql.

BEGIN;

-- Le type de retour change : CREATE OR REPLACE ne suffit pas, il faut supprimer
-- d'abord. La transaction evite que la fonction manque, meme une milliseconde.
DROP FUNCTION IF EXISTS get_encaissements_clients(date);

CREATE FUNCTION get_encaissements_clients(p_date_debut date)
RETURNS TABLE (date_operation date, montant numeric, montant_autres numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH clients AS (
    -- Strictement la requete d'origine (migration 153), inchangee.
    SELECT
      lb.date_operation::date AS jour,
      SUM(l.montant)::numeric AS montant
    FROM lettrages l
    JOIN lignes_bancaires lb
      ON lb.id_operation     = l.id_ligne_bancaire
      AND lb.organisation_id = get_my_organisation_id()
    WHERE l.organisation_id = get_my_organisation_id()
      AND l.annule           = false
      AND l.code_client     != '471'
      AND lb.date_operation >= p_date_debut
    GROUP BY lb.date_operation::date
  ),
  hors_clients AS (
    SELECT
      jour,
      SUM(GREATEST(credit - lettre_client, 0))::numeric AS montant
    FROM (
      SELECT
        lb.date_operation::date AS jour,
        COALESCE(lb.credit, 0)  AS credit,
        COALESCE(SUM(l.montant) FILTER (WHERE l.code_client != '471'), 0) AS lettre_client
      FROM lignes_bancaires lb
      LEFT JOIN lettrages l
        ON  l.id_ligne_bancaire = lb.id_operation
        AND l.organisation_id   = lb.organisation_id
        AND l.annule            = false
      WHERE lb.organisation_id = get_my_organisation_id()
        AND lb.date_operation >= p_date_debut
        AND COALESCE(lb.credit, 0) > 0
      GROUP BY lb.id_operation, lb.date_operation, lb.credit
    ) par_ligne
    GROUP BY jour
  )
  SELECT
    COALESCE(c.jour, h.jour)   AS date_operation,
    COALESCE(c.montant, 0)     AS montant,
    COALESCE(h.montant, 0)     AS montant_autres
  FROM clients c
  FULL OUTER JOIN hors_clients h ON h.jour = c.jour
  ORDER BY 1;
$$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTROLE — la colonne montant doit etre identique a avant
-- ═══════════════════════════════════════════════════════════════════════════
-- Attendu sur 90 jours pour SAS MELEZE : montant 1 171 992,68 €, ce qui est
-- deja le chiffre affiche en tete du graphique.
--
-- SELECT to_char(SUM(montant), 'FM999G999G999D00')        AS clients,
--        to_char(SUM(montant_autres), 'FM999G999G999D00') AS hors_clients,
--        to_char(SUM(montant + montant_autres),
--                'FM999G999G999D00')                      AS total
-- FROM get_encaissements_clients(current_date - 90);
