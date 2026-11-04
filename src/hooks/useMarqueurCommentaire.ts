// Y a-t-il du texte saisi sur le DERNIER contact de ce client ?
//
// Sert la pastille de l'onglet Relances du panneau d'options. Regle arretee
// avec Clement le 2026-11-04 : le marqueur suit l'etat de la derniere entree,
// pas l'historique. Une nouvelle relance sans commentaire l'eteint.
//
// LE ROBOT ETEINT LA PASTILLE, ET C'EST VOULU. relances_auto_log n'a aucun
// champ de commentaire : un envoi automatique ne peut pas en porter. Donc pour
// un client du circuit auto, la pastille s'eteint le lendemain matin.
// L'information n'est pas perdue pour autant — les pastilles de LIGNE, dans
// l'historique, la montrent toujours. Les deux niveaux sont complementaires :
// celui-ci dit « il y a quelque chose a lire maintenant », l'autre dit « cette
// ligne-la porte du texte ».
//
// POURQUOI UNE REQUETE DEDIEE. L'historique complet n'est charge que lorsqu'on
// ouvre l'onglet Relances, or la pastille doit s'afficher AVANT qu'on clique
// dessus. Trois lectures d'une seule ligne chacune, sur des colonnes indexees :
// le cout est negligeable.
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function aDuTexte(...valeurs: (string | null | undefined)[]): boolean {
  return valeurs.some(v => (v ?? '').trim() !== '')
}

/** Le jour seul. echange_le est une date, les deux autres des horodatages :
 *  compares en entier, la chaine la plus courte perdrait toujours. */
function jour(iso: string | null | undefined): string {
  return (iso ?? '').slice(0, 10)
}

/**
 * @param rafraichir incremente par le parent apres l enregistrement ou la
 *        suppression d un echange. Sans ce signal, la pastille garderait son
 *        etat jusqu a la reouverture du panneau : on saisirait un appel avec
 *        un commentaire et rien ne changerait a l ecran.
 */
export function useMarqueurCommentaire(codeClient: string | null, rafraichir = 0) {
  const [aCommentaire, setACommentaire] = useState(false)

  useEffect(() => {
    if (!codeClient) return
    let actif = true

    Promise.all([
      supabase.from('relances')
        .select('envoyee_le,note')
        .eq('code_client', codeClient)
        .eq('archivee', false)
        .not('envoyee_le', 'is', null)
        .order('envoyee_le', { ascending: false })
        .limit(1),
      // statut = 'envoye' seulement : un rebond veut dire que le client n'a
      // rien recu, ce n'est pas un contact.
      supabase.from('relances_auto_log')
        .select('envoye_le')
        .eq('code_client', codeClient)
        .eq('statut', 'envoye')
        .order('envoye_le', { ascending: false })
        .limit(1),
      supabase.from('echanges_clients')
        .select('echange_le,commentaire,retour_client')
        .eq('code_client', codeClient)
        .eq('archivee', false)
        .order('echange_le', { ascending: false })
        .limit(1),
    ]).then(([r, a, e]) => {
      if (!actif) return

      const relance = (r.data?.[0] ?? null) as { envoyee_le: string; note: string | null } | null
      const auto    = (a.data?.[0] ?? null) as { envoye_le: string } | null
      const echange = (e.data?.[0] ?? null) as { echange_le: string; commentaire: string | null; retour_client: string | null } | null

      const candidats = [
        { j: jour(relance?.envoyee_le), texte: aDuTexte(relance?.note) },
        { j: jour(auto?.envoye_le),     texte: false },
        { j: jour(echange?.echange_le), texte: aDuTexte(echange?.commentaire, echange?.retour_client) },
      ].filter(c => c.j !== '')

      if (!candidats.length) { setACommentaire(false); return }

      // Egalite de date : si plusieurs contacts tombent le meme jour, la
      // pastille s'allume des que l'un d'eux porte du texte. Departager a
      // l'heure est impossible — echange_le n'est qu'une date — et le faire
      // arbitrairement cacherait parfois l'information qu'on cherche a
      // signaler. Dans le doute, on signale.
      const dernierJour = candidats.reduce((max, c) => (c.j > max ? c.j : max), '')
      setACommentaire(candidats.some(c => c.j === dernierJour && c.texte))
    })

    return () => { actif = false }
  }, [codeClient, rafraichir])

  // Derive plutot que remis a zero dans l effet : sans client, il n y a rien a
  // signaler, et le calculer ici evite un setState synchrone dans un effet —
  // que le linter refuse, et a juste titre : il provoquerait un rendu en
  // cascade pour une valeur qu on connait deja.
  return codeClient ? aCommentaire : false
}
