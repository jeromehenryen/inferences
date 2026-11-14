# Mission Inférences

Défis de lecture (inférences) pour les cycles 2 et 3. Les élèves lisent un texte, répondent à une ou plusieurs questions et sélectionnent les indices qui justifient leur réponse. L'IA Albert vérifie les réponses ; l'ERUN suit les résultats de tous les groupes depuis son poste.

## Fichiers
- `index.html`, `styles.css`, `app.js` : partie élèves. `admin.js` : espace administrateur.
- `netlify/functions/` : fonctions serveur (`defis`, `acces`, `verifier`, `aide`, `admin`, `enseignant`) et leurs outils (`lib/`). `lib/seed.json` contient les 15 défis de départ (jamais envoyés au navigateur avec leurs réponses).
- `package.json` (dépendance `@netlify/blobs`) et `netlify.toml`.

## Mise en place sur Netlify
1. Mettre **le contenu** du dossier à la racine d'un dépôt GitHub, puis sur Netlify : *Add new project → Import an existing project*. Aucune commande de build. (Avec la CLI : `npm install` puis `netlify deploy --prod`. Le glisser-déposer ne déploie pas les fonctions.)
2. Dans *Site configuration → Environment variables* :
   - `ALBERT_API_KEY` : clé Albert (obligatoire) ;
   - `ADMIN_PASSWORD` : mot de passe de l'espace administrateur, long et unique (obligatoire) ;
   - `ALBERT_MODEL` : identifiant d'un modèle `text-generation`, non « raisonnement » (voir `GET https://albert.api.etalab.gouv.fr/v1/models`) ; défaut `albert-large` ;
   - `ALLOWED_ORIGIN` : adresse du site, sans `/` final (facultatif, recommandé) ;
   - `CODES_JSON` : ancienne méthode, inutile désormais (voir « Codes »).
3. Redéployer après chaque changement de variable.
4. Ouvrir le site, cliquer sur « Espace administrateur », puis :
   - onglet **Codes** : « Générer les codes manquants », « Enregistrer », « Imprimer la liste » ;
   - onglet **Réglages** : vérifier la signature, les limites et la durée de conservation.

Test local : `netlify dev` (fichier `.env` avec les variables ; ne jamais le publier).

## Espace administrateur
- **Suivi des groupes** : résultats par groupe, détail par défi et par question, filtres (niveau, école, groupe, défi, période), graphiques (activité par jour, réussite par défi), « Questions à retravailler » (au moins 5 tentatives et moins de 50 % de réussite, avec diagnostic et suggestion de reformulation par l'IA), exports CSV, actualisation, remise à zéro.
- **Défis** : création, modification, plusieurs questions par défi, duplication, réordonnancement (l'ordre fixe le déblocage). Enregistrés sur le serveur : visibles par tous les élèves, sur tous les appareils. Dans l'éditeur, **« Tester le jugement de l'IA »** : réponse d'élève fictive et indices cochés dans le texte, sur la version affichée (même non enregistrée) ; rien n'est ajouté au suivi.
- **Enseignants** : comptes en lecture seule limités à une ou plusieurs écoles (nom + école(s) + code). L'enseignant ouvre « Espace administrateur », coche « Je suis enseignant·e » et saisit son code : il voit le suivi de ses écoles (filtres, graphiques, exports), sans réglages, codes, suppression ni suggestions IA. Le filtrage est fait par le serveur.
- **Codes** : codes d'accès (remis par l'ERUN) et de validation, générés au hasard ou saisis, liste imprimable.
- **Réglages** : signature du créateur (texte, affichée ou masquée), lecture à voix haute, dictée, limites d'usage de l'IA, conservation du suivi.

## Côté élèves
- Code de groupe au format `niveau-école` (exemple : `CE2-Victor Hugo`). Aucun nom d'élève.
- Texte et questions remis seulement après le code d'accès. Les réponses de référence, les indices attendus et les aides restent sur le serveur (les aides sont remises une à une).
- Lecture à voix haute du texte et des questions ; dictée de la réponse si l'administrateur l'active.
- Bouton « Aa » : taille du texte, texte aéré, police très lisible, contraste renforcé (enregistré sur l'appareil).
- Reprise : la réponse en cours et les indices cochés sont gardés sur l'appareil jusqu'à la réussite de la question.

## Sécurité et protection des données
- La clé Albert, les codes et le mot de passe administrateur ne sont jamais dans le code public.
- Les juges de la réponse (texte, réponses et indices de référence) viennent du serveur : un élève ne peut pas les falsifier. Le code de validation n'est remis qu'à la réussite de la dernière question.
- Limites : 30 erreurs de code d'accès par 10 minutes et par connexion ; 10 erreurs de mot de passe administrateur ou de code enseignant par 10 minutes ; vérifications IA par groupe et par heure et par jour (réglables).
- Un enseignant ne reçoit du serveur que les évènements des groupes de ses écoles (la comparaison ignore la casse et les accents) ; le nom de l'école doit donc être écrit comme dans le code de groupe.
- Suivi : seuls le groupe (niveau + école), le défi, la question, l'heure et le résultat sont enregistrés (Netlify Blobs). Les réponses écrites des élèves ne sont jamais conservées côté serveur ; elles sont envoyées à Albert pour correction. Un brouillon est gardé dans le navigateur de l'élève jusqu'à la réussite. La purge automatique supprime les anciennes données (réglable). À signaler dans le registre de traitements si nécessaire.
- La dictée utilise le service de reconnaissance vocale du navigateur : désactivée par défaut.
