-- Migration 169 : l'activite de recouvrement devient filtrable par operateur
--
-- POURQUOI. get_activite_relances agregeait par date seulement. Impossible de
--   savoir qui a relance quoi, alors que relances.operateur_id porte
--   l'information depuis la migration 018.
--
-- CE QUI CHANGE. Une colonne de plus, operateur_id, et un GROUP BY elargi.
--   La fonction renvoie donc plus de lignes — une par date ET par operateur —
--   mais le volume reste faible : 512 relances au total a ce jour.
--
--   Le filtrage se fait ensuite DANS LE NAVIGATEUR, pas ici. Changer
--   d'operateur ne declenche aucune requete, l'affichage est instantane, et
--   une seule lecture sert tous les etats du filtre.
--
-- CE QUI NE CHANGE PAS. Le perimetre : statut different de brouillon, date
--   d'envoi renseignee. Les relances INTERNES restent comptees — une
--   notification a un commercial est une action de l'operateur, meme si le
--   client ne recoit rien. C'est discutable, mais ce n'est pas le sujet de
--   cette migration : on ajoute une dimension, on ne redefinit pas l'indicateur.
--
-- COMPATIBILITE. Un front qui ne lit pas operateur_id continue de fonctionner :
--   il additionnera simplement plusieurs lignes par date au lieu d'une. Les
--   totaux restent identiques.
--
-- RETOUR ARRIERE : rejouer 161_rpc_activite_relances_journalier.sql.

BEGIN;

-- Le type de retour change : CREATE OR REPLACE ne suffit pas.
-- La transaction evite que la fonction manque, meme une milliseconde.
DROP FUNCTION IF EXISTS get_activite_relances(date);

CREATE FUNCTION get_activite_relances(p_date_debut date)
RETURNS TABLE (date_operation date, operateur_id uuid, nb_relances bigint, montant numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.envoyee_le::date             AS date_operation,
    r.operateur_id,
    COUNT(*)                       AS nb_relances,
    SUM(r.solde_snapshot)::numeric AS montant
  FROM relances r
  WHERE r.organisation_id = get_my_organisation_id()
    AND r.statut          != 'brouillon'
    AND r.envoyee_le      IS NOT NULL
    AND r.envoyee_le::date >= p_date_debut
  GROUP BY r.envoyee_le::date, r.operateur_id
  ORDER BY 1, 2;
$$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTROLE — les totaux doivent etre inchanges
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT count(DISTINCT operateur_id) AS operateurs,
--        SUM(nb_relances)             AS relances,
--        to_char(SUM(montant), 'FM999G999G999D00') AS montant
-- FROM get_activite_relances(current_date - 730);
