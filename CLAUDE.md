# CLAUDE.md — Casseur de forme

**Source de vérité : [docs/cahier-des-charges.md](docs/cahier-des-charges.md).** Ce fichier n'en est qu'un résumé ; en cas de doute, relire le cahier des charges.

## Projet
Jeu de tir vertical hybride portrait (v3) : une grande forme en haut lance des vagues d'ennemis puis devient un boss ; le canon en bas se déplace au glisser et tire seul droit vers le haut (visée auto = capacité). Pièces (partie, perdues à la défaite), diamants (atelier, armes), gemmes (capacités, armes). Défaite = retour au niveau 1 ou au début d'un monde (50 niveaux). Cible web (GitHub Pages, PWA) et Android (Capacitor, APK construit par GitHub Actions).

## Contraintes
- Coût 0 € : aucun backend, hébergement statique (GitHub Pages).
- Aucun asset graphique : tout est tracé en code (Canvas 2D).
- Français d'abord, tous les textes dans `src/i18n/` (jamais de texte en dur dans le code).
- Tir automatique droit ; le joueur se déplace au glisser ; portrait, tactile, 60 images/s, 300 particules max.
- Aucun fichier audio : musique et sons synthétisés en code (`src/audio/`).
- Hors v1 : multijoueur, classement, comptes, achats intégrés.
- Le propriétaire travaille depuis un téléphone : il ne lance aucune commande, Claude fait tout (fichiers, tests, commits, PR).

## Règles de code
- TypeScript strict + Vite. Pas de framework UI.
- Simulation (`src/game`) séparée du rendu (`src/render`) : pas de temps fixe, 60 mises à jour/s. La simulation ne touche jamais au DOM ni au canvas ; elle reçoit les commandes du joueur sous forme abstraite (`state.input`) et utilise un hasard à graine (`src/game/rng.ts`).
- Grands nombres : un seul module de calcul (`src/game/bignum.ts`) et un seul formateur (`formatNumber`, « 1,2 K », « 3,4 M »…).
- Formes : sommets calculés depuis (côtés, rayon, rotation) ; étoile = polygone alterné rayon extérieur/intérieur (`src/game/geometry.ts`).
- Tout l'équilibrage dans `src/config/*.json` (aucune constante de gameplay en dur).
- Publicités : uniquement via l'interface de `src/ads/` (`showRewarded`, `showInterstitial`), version factice sur le web, identifiants AdMob de test uniquement.
- Sauvegarde : localStorage, JSON versionné (`src/storage/`).

## Organisation
```
src/game      simulation, formules, grands nombres, géométrie
src/render    rendu Canvas 2D, particules, nombres flottants
src/ui        interface DOM (boutons, HUD)
src/ads       interface publicitaire (factice web, AdMob test sur Android)
src/audio     musique et effets sonores synthétisés (Web Audio)
src/storage   sauvegarde versionnée
src/config    équilibrage (JSON)
src/i18n      textes
tests/        tests Vitest
docs/         cahier des charges, recherche, publication
android/      projet Capacitor (généré, ajusté : icône, portrait, signature de test)
```

## Méthode
- Avancer jalon par jalon (cf. §9 du cahier des charges) ; ne pas anticiper les jalons suivants.
- Travailler sur une branche, commits clairs, pull request à la fin.
- Avant chaque PR : `npm run build` et `npm test` doivent passer.
- Ne pas poser de questions sauf blocage réel ; noter les décisions prises dans le README.
- Ne jamais supprimer un fichier existant sans demander.
- Le déploiement GitHub Pages se fait par `.github/workflows/deploy.yml` à chaque push sur `main`.
- L'APK Android est construit par `.github/workflows/android.yml` (le SDK Android n'est pas téléchargeable dans l'environnement cloud) et publié dans la release `android-latest`.
- Équilibrage : `npm run sim` (joueur automatique) avant de changer `src/config/balance.json`.
