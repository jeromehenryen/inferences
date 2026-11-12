# Mission Inférences – prototype autonome

Application pédagogique de défis d'inférences pour le CP-CE1, le CE2 et le CM1-CM2.

## Tester l'application
1. Décompresser l'archive ZIP.
2. Ouvrir `index.html` avec Firefox, Chrome ou Edge.
3. Saisir un code de groupe (ex. `GROUPE-CE2-01`).
4. Choisir un niveau, ouvrir un défi et saisir le code d'accès donné par l'ERUN (liste ci-dessous).

## Codes d'accès et de validation
Les codes sont donnés par l'ERUN et **ne figurent plus dans le code public** : ils sont vérifiés par des fonctions serveur Netlify (`acces.js` et `verifier.js`). Le code de validation n'est renvoyé à l'élève que lorsque la réponse est jugée juste.

Ils se définissent dans la variable d'environnement Netlify `CODES_JSON` (modèle : `codes.example.json`, un couple access / validation par identifiant de défi : cp1 à cp5, ce21 à ce25, cm1 à cm5). Les anciens codes de démonstration (CP1-LECTURE, ETOILE-CP1, etc.) ont circulé dans les fichiers précédents : en choisir de nouveaux. Pour un défi créé dans l'espace administrateur, ajouter son identifiant (affiché dans le formulaire) dans `CODES_JSON`.

Sans serveur, l'application ne peut plus ouvrir de défi : elle doit être déployée sur Netlify (voir plus bas).

## Espace administrateur
Cliquer sur « Espace administrateur ». À la première ouverture, définir un mot de passe d'au moins 8 caractères. L'espace permet de modifier, créer et supprimer des défis, modifier les réponses acceptées, les combinaisons d'indices, les aides et les codes. Les statistiques peuvent être exportées au format CSV.

## Limites importantes de cette version
- Toutes les données sont conservées dans le stockage local du navigateur. Elles ne sont pas partagées entre les appareils ou les classes.
- Le mot de passe administrateur et les codes ne sont pas sécurisés contre un utilisateur qui inspecte les fichiers ou les données du navigateur.
- Le contrôle des réponses est fait par l'IA Albert (voir ci-dessous). Si le relais est injoignable, l'élève voit un message d'attente et peut réessayer : il n'y a plus de contrôle de secours dans le navigateur, qui aurait exposé les codes.
- La progression et les statistiques sont locales et peuvent être effacées par la suppression des données du navigateur.
- Pour une diffusion réelle par iframe, il faudra connecter l'application à un service serveur (par exemple Supabase) : authentification administrateur, vérification serveur des codes et des réponses, règles d'accès aux données, statistiques centralisées et protection contre la consultation des codes dans le JavaScript public.

## Vérification des réponses par IA (Albert)
L'application envoie la réponse de l'élève et les indices sélectionnés à une fonction serveur (`netlify/functions/verifier.js`), qui interroge l'API Albert. **La clé API n'est jamais dans le code public.**

### Mise en place sur Netlify
1. Déployer le dossier complet (avec `netlify.toml` et `netlify/functions/`) sur Netlify (dépôt Git ou « Netlify CLI »). Un simple glisser-déposer du dossier ne déploie pas les fonctions.
2. Dans *Site configuration → Environment variables*, créer :
   - `ALBERT_API_KEY` : ta clé Albert (obligatoire) ;
   - `CODES_JSON` : les codes d'accès et de validation, sur une seule ligne (obligatoire, voir ci-dessus) ;
   - `ALBERT_MODEL` : nom du modèle (facultatif, `albert-large` par défaut — vérifier les noms disponibles avec ta clé via `GET https://albert.api.etalab.gouv.fr/v1/models`) ;
   - `ALLOWED_ORIGIN` : adresse du site (facultatif, recommandé, par exemple `https://mon-site.netlify.app`).
3. Redéployer. Test local : `netlify dev` (fichier `.env` avec `ALBERT_API_KEY=...` et `CODES_JSON=...`, à ne jamais publier).

Si l'application est hébergée ailleurs que Netlify, définir avant `app.js` : `<script>window.MI_API_BASE='https://.../.netlify/functions'</script>`.

### Points d'attention
- Les réponses des élèves partent vers un service tiers : l'application rappelle à l'élève de ne saisir ni nom ni prénom.
- Les « réponses acceptées » et « combinaisons d'indices » de l'espace administrateur servent désormais de références à l'IA (elles ne sont plus à lister de façon exhaustive).
- Limite restante : les textes, réponses de référence et indices des défis restent dans le JavaScript public. Un élève habile avec les outils du navigateur pourrait falsifier une requête vers `verifier`. Pour l'empêcher, il faudrait stocker les défis eux-mêmes côté serveur (par exemple Supabase).
- Pas de limitation du nombre d'essais de code : prévoir des codes assez longs.

## Intégration iframe ultérieure
Après hébergement HTTPS, intégrer la page avec une balise iframe, par exemple :

```html
<iframe src="https://VOTRE-ADRESSE/" title="Mission Inférences" width="100%" height="900" style="border:0" loading="lazy"></iframe>
```

Aucune dépendance de compilation n'est nécessaire. La police Google est facultative ; une police système est utilisée en secours.
