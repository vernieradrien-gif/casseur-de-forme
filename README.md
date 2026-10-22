# Casseur de forme (nom provisoire)

Jeu incrémental portrait : une forme géométrique tourne au centre de l'écran, un canon la frappe automatiquement, on dépense ses pièces pour taper plus fort.

**Adresse de test (téléphone) : https://vernieradrien-gif.github.io/casseur-de-forme/**

- Ajouter `?reset` à l'adresse efface la sauvegarde et relance une partie : https://vernieradrien-gif.github.io/casseur-de-forme/?reset
- Le cahier des charges complet est dans [docs/cahier-des-charges.md](docs/cahier-des-charges.md) (source de vérité).

## État : jalon 1 (cœur de jeu)

Triangle qui tourne, canon automatique, PV avec barre, destruction puis forme suivante, pièces, amélioration « Dégâts » (achat x1 / x10 / x100 / Max), grands nombres (« 1,2 K », « 3,4 M »…), nombres de dégâts flottants, éclats et léger tremblement à la destruction, pause (bouton et automatique en arrière-plan).

## Commandes (pour développer)

```
npm install
npm run dev      # serveur local
npm test         # tests unitaires (Vitest)
npm run build    # vérification TypeScript + construction dans dist/
```

Chaque push sur `main` construit le jeu et le publie sur GitHub Pages (`.github/workflows/deploy.yml`). Sur une pull request, le workflow lance seulement les tests et la construction.

## Décisions prises (jalon 1)

- **Grands nombres** : `number` JavaScript (précis jusqu'à ~1e308, largement au-delà de l'objectif 1e30), mais tout passe par `src/game/bignum.ts` pour pouvoir changer de représentation sans toucher au reste.
- **Formatage** : une décimale, **tronquée** et non arrondie (999 999 → « 999,9 K », jamais « 1000 K »), virgule française, suffixes K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc, puis notation scientifique (« 1,2e36 »).
- **Bonus de dégâts +10 %/niveau composé** (×1,1 par niveau) plutôt qu'additif : avec des PV en ×1,22 par niveau, un bonus additif bloquerait la progression presque tout de suite.
- **Canon** : 3 tirs/s, 1 dégât de base (réglable dans `src/config/balance.json`). Avec les formules du cahier des charges et une seule amélioration, on atteint ~niveau 10 en 1 min 30 et ~niveau 17 en 5 min ; la progression ralentit ensuite, c'est attendu tant que les autres améliorations (jalons suivants) n'existent pas.
- **Pas de boss** au niveau 10 dans ce jalon (prévu au jalon 2) : toutes les formes sont des triangles.
- **Sauvegarde minimale** (niveau, pièces, amélioration) dans le localStorage, JSON versionné, toutes les 10 s et au passage en arrière-plan, pour ne pas perdre sa partie en testant. Le système complet (migrations, export/import) reste au jalon 3.
- **Interface en HTML/CSS** par-dessus le canvas (boutons de 64 px de haut, faciles à toucher) ; le canvas ne dessine que le jeu.
- **Simulation à pas fixe** (60 mises à jour/s) totalement séparée du rendu ; le rendu interpole entre deux pas pour rester fluide sur les écrans 90/120 Hz.
- **Publicités** : seule l'interface `src/ads/` et sa version factice existent (AdMob au jalon 4).
- **Chemin GitHub Pages** : fourni au moment de la construction par le workflow (`/<nom du dépôt>/`) ; en local, chemin relatif.
- Une branche `main` initiale (contenant seulement `.gitignore`) a été créée pour servir de base à la pull request, le dépôt étant vide.
