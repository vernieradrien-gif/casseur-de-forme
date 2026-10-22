# Prompt pour continuer le projet depuis Claude Desktop (PC)

À coller dans une session Claude Code ouverte sur le PC (Claude Desktop, onglet Code), dans le dossier où se trouve (ou se trouvera) le projet.

---

Tu reprends le projet de jeu « Casseur de forme ». Je travaille souvent depuis mon téléphone : tu t'occupes de TOUT (installation des outils, fichiers, tests, commits, push, pull request). Réponds-moi en français simple. Ne me pose de questions que si tu es vraiment bloqué ; prends les décisions raisonnables et note-les dans le README. Ne supprime aucun fichier existant sans me demander.

## 1. Récupérer le projet
- Dépôt : https://github.com/vernieradrien-gif/casseur-de-forme (public).
- S'il n'est pas déjà sur le PC, clone-le. Travaille sur la branche `ccr-2068dadd-5a12so` (elle contient le cahier des charges v3 et un brouillon de config v3) : `git fetch origin && git checkout ccr-2068dadd-5a12so && git pull`.
- Lis d'abord, dans cet ordre : `CLAUDE.md`, `docs/cahier-des-charges.md` (version 3, source de vérité), `docs/recherche-design.md`, `README.md`, puis le code existant (`src/`, `tests/`) et les brouillons `src/config/balance.json` et `src/config/achievements.json`.

## 2. Ce que je veux : le jeu complet
Réalise TOUT le cahier des charges v3, étape par étape, en testant chaque étape. Points clés :
- **Contrôle unique** : glisser le doigt pour déplacer le canon à gauche/droite ; le canon tire tout seul **droit vers le haut**. Plus de visée automatique de base : la **visée auto devient une capacité** à débloquer (gemmes), qui ne dure qu'un temps limité et doit se recharger entre deux utilisations.
- **Niveaux en deux temps** : la grande forme (protégée par un bouclier) lance 3 à 5 vagues en formations lisibles, puis devient un boss vulnérable qui se déplace, tire et s'énerve sous 50 % de PV. Grand boss tous les 10 niveaux, boss doré rare, zones faibles ×3, propriétés par palier (blindage, bouclier, régénération, fragmentation, anneaux…), 8 types d'ennemis + étoile dorée (gemme), armes secondaires (Orbes, Laser, Éclairs), capacités (Visée auto, Bouclier, Onde de choc, Multi-tir), mondes de 50 niveaux comme points de reprise, mode infini après 100.
- **Progression** : pièces (partie), diamants (atelier, armes), gemmes (capacités, armes), 30 succès, objectif quotidien, collection, gains hors ligne, seconde chance.
- **Équilibrage** : inspire-toi de ce qui marche dans les jeux du genre (Ball Blast, Galaxy Attack, roguelites, idle games : voir `docs/recherche-design.md`) ; ajuste avec un script de simulation sans rendu (`npm run sim`, joueur automatique) pour qu'une première partie atteigne environ le niveau 5 à 10, le niveau 50 après quelques heures, et le niveau 100 après de nombreuses heures.
- **Beau visuellement tout en restant simple** : style néon, fond étoilé, éclats, anneaux d'explosion, traînées, éclair blanc sur les cibles touchées.
- **Explosion du canon** quand il est détruit (en plusieurs temps, avec ralenti), puis **petit temps de latence** avant la fenêtre de défaite.
- **Menu principal** : jouer/continuer, choix du monde, atelier, armurerie, capacités, collection, succès, paramètres, objectif quotidien.
- **Musique** : compose une ou plusieurs petites musiques d'ambiance (menu, jeu, boss) **synthétisées en code (Web Audio, aucun fichier audio)**, plus les effets sonores ; volumes réglables.
- **Langues** : français et anglais.
- **Pubs** : interface `src/ads/` (factice sur le web, AdMob avec **identifiants de test uniquement** + consentement UMP sur Android).
- **PWA** (manifeste + service worker) et **politique de confidentialité** publiée sur GitHub Pages.

## 3. Android et APK
- Installe ce qu'il faut sur le PC pour construire l'APK (JDK 21, Android SDK / outils en ligne de commande ou Android Studio), Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/app`, `@capacitor-community/admob`).
- Projet Android dans `android/` : identifiant `io.github.vernieradrien.casseurdeforme`, nom « Casseur de forme », portrait, plein écran, icône tracée en code (vector drawable), permission vibration, bouton retour géré.
- Signe l'APK avec une **clé de test** commitée (pas pour la publication Play Store, à documenter).
- Construis l'APK **localement** et vérifie-le (émulateur Android ou téléphone branché en USB avec `adb install` si disponible).
- Ajoute aussi un workflow GitHub Actions `.github/workflows/android.yml` qui construit l'APK et le publie dans une release GitHub `android-latest`, pour que je puisse le télécharger depuis mon téléphone à l'adresse https://github.com/vernieradrien-gif/casseur-de-forme/releases/download/android-latest/casseur-de-forme.apk

## 4. Tests et livraison
- `npm test` (Vitest) et `npm run build` doivent passer ; ajoute des tests pour toutes les mécaniques (vagues, boss, ennemis, armes, capacités, succès, hors ligne, sauvegarde v3 avec migrations v1 → v2 → v3, export/import).
- Teste le jeu dans un navigateur (Playwright) au format téléphone : captures d'écran, 60 images/s, aucune erreur console, parcours des menus, défaite, rejouer.
- Commits clairs en français, push sur la branche, puis ouvre une pull request vers `main`. Vérifie que la CI est verte.
- **Ne t'arrête que lorsque le jeu est fini.** À la fin, donne-moi en français simple : le lien de téléchargement de l'APK, l'adresse web, comment installer l'APK sur Android (autoriser les sources inconnues), ce que je dois vérifier, et ce qui reste à faire de mon côté pour la publication sur Google Play.
