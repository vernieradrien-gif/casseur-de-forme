# Casseur de forme (nom provisoire)

Jeu de tir néon en portrait : en haut, une grande forme géométrique lance des vagues d'ennemis, puis devient un boss qui se déplace et attaque. En bas, ton canon **tire tout seul droit vers le haut** : tu le **déplaces en glissant le doigt**. Les pièces améliorent le canon pendant la partie ; les diamants et les gemmes le rendent plus fort pour toujours.

- **Jouer sur le web (téléphone ou PC)** : https://vernieradrien-gif.github.io/casseur-de-forme/
  (ajouter `?reset` à l'adresse efface la sauvegarde, `?autoplay` lance une démonstration automatique)
- **APK Android (test)** : https://github.com/vernieradrien-gif/casseur-de-forme/releases/download/android-latest/casseur-de-forme.apk
- Cahier des charges (source de vérité, version 3) : [docs/cahier-des-charges.md](docs/cahier-des-charges.md) ·
  recherche : [docs/recherche-design.md](docs/recherche-design.md) · publication : [docs/publication.md](docs/publication.md)

## Installer l'APK sur Android

1. Sur le téléphone, ouvrir le lien de l'APK ci-dessus (Chrome) et télécharger `casseur-de-forme.apk`.
2. Ouvrir le fichier téléchargé. Android demande d'**autoriser l'installation d'applications inconnues** pour Chrome (ou le
   gestionnaire de fichiers) : *Paramètres › Autoriser depuis cette source*, puis revenir et **Installer**.
3. Si Play Protect affiche un avertissement (application de test non publiée) : *Plus de détails › Installer quand même*.
4. Pour une mise à jour : réinstaller le nouvel APK par-dessus (même signature de test, la sauvegarde est conservée).

## État : jalons 3 et 4 (jeu complet v3 + Android)

- **Niveaux en deux temps** : la forme, protégée par un bouclier, lance 3 vagues (4 dès le niveau 21, 5 dès le 51) en
  formations lisibles (ligne, V, serpent, pluie, côtés, éventail) ; puis elle devient un boss qui se déplace, tire
  (visé, éventail, rafale, anneau, spirale), lance des renforts et s'énerve sous 50 % de PV.
- **Grand boss** tous les 10 niveaux, **boss doré** rare (×10 pièces), **zones faibles** ×3, une **propriété** par palier
  (rotation rapide, blindage, régénération, bouclier, fragmentation, blindage fort, bouclier + régénération, anneaux,
  toutes), **mode infini** après le niveau 100.
- **8 ennemis** présentés un à un (Éclat, Virevolteur, Bloc, Chasseur, Tireur, Diviseur, Kamikaze, Blindé) + **étoile dorée** (1 gemme).
- **Armes** (armurerie) : Orbes, Laser, Éclairs ; **capacités** : Visée auto, Bouclier, Onde de choc, Multi-tir.
- **Progression** : pièces (partie), diamants (atelier, armes), gemmes (capacités, armes), **30 succès**, **objectif du jour**,
  **collection**, **gains hors ligne**, **seconde chance**, **boost ×2**, **mondes de 50 niveaux** comme points de reprise.
- **Menus** : jouer/continuer, choix du monde, atelier, armurerie, capacités, collection, succès, paramètres.
- **Explosion du canon** en plusieurs temps au ralenti, puis écran de défaite.
- **Musique** composée et synthétisée en code (menu calme, jeu rythmé, boss intense, fondus) et **effets sonores** ; volumes réglables.
- **Français et anglais**, **PWA** (jouable hors connexion), **politique de confidentialité** publiée.
- **Android** (Capacitor) : portrait, plein écran, icône tracée en code, vibration, bouton retour, AdMob (identifiants de
  **test**) avec consentement RGPD (UMP).

## Commandes (pour développer)

```
npm install
npm run dev      # serveur local
npm test         # tests unitaires (Vitest)
npm run e2e      # tests de bout en bout au format téléphone (Playwright)
npm run sim      # simulation d'équilibrage sans rendu (joueurs automatiques)
npm run build    # vérification TypeScript + construction dans dist/
npm run icons    # régénère les icônes PNG depuis public/icon.svg
npx cap sync android && cd android && gradlew assembleRelease   # APK local (JDK 21 + SDK Android)
```

Chaque push sur `main` publie le jeu sur GitHub Pages (`.github/workflows/deploy.yml`). Chaque push sur `main` ou sur une
branche `ccr-*` construit l'APK et le publie dans la release `android-latest` (`.github/workflows/android.yml`).

## Décisions prises

### Jalons 3 et 4 (version 3)
- **Contrôle** : glisser relatif (×1,4) n'importe où sur l'écran ; flèches du clavier sur ordinateur. Tir automatique droit.
- **Bouclier de vagues** : pendant les vagues, la forme est invulnérable (les tirs étincellent sur sa bulle) ; la dernière
  vague doit être détruite ou sortie de l'écran (sécurité : durée maximale) pour que le bouclier tombe.
- **Fureur** : plus la phase boss dure, plus la forme tire vite et fort (×2 après 30 s, ×3 après 60 s…). Ce n'était pas dans le cahier
  des charges : sans cela, un joueur qui esquive bien mais ne fait pas assez de dégâts pourrait rester bloqué indéfiniment.
- **Grand boss** : PV ×1,4, plus grand, un tir de plus et des renforts plus fréquents ; gemmes au premier passage
  (3 + 1 par palier).
- **Zones faibles** : sur les sommets de la forme (1 à 5 selon le palier), ×3 dégâts, nombre affiché en jaune.
- **Blindage** : retire à chaque coup une valeur qui suit la puissance attendue du joueur, jamais plus de 80 % du coup ;
  le laser et l'onde de choc l'ignorent.
- **Anneaux** (palier 9) : 3 anneaux de 10 % des PV chacun, à briser avant de toucher le cœur.
- **Multi-tir** : tir double (2 × 75 % des dégâts) puis triple (3 × 60 %), pour que la couverture compte plus que la puissance brute.
- **Armes** : puissance = dégâts du canon × facteur de l'arme × (1 + 20 % par niveau) ; les orbes gagnent une sphère aux
  niveaux 10 et 20 ; une arme débloquée s'équipe automatiquement s'il reste un emplacement.
- **Capacités** : niveau 1 au déblocage, jusqu'au niveau 5 (Multi-tir : niveau 2 = tir triple) ; prix d'amélioration
  = prix de base × niveau, en gemmes.
- **Mondes** : reprendre au début d'un monde donne les pièces qu'on aurait gagnées jusque-là (estimation × gain de pièces
  de l'atelier) pour racheter les améliorations de partie.
- **Équilibrage** (`npm run sim`, trois joueurs automatiques plus ou moins adroits, 20 s de menus entre parties) :
  première partie jusqu'au niveau 8 à 10 ; niveau 50 vers 1 h 15 de jeu continu (le joueur automatique enchaîne les
  parties sans pause et dépense parfaitement : un humain mettra plus longtemps) ; niveau 75 vers 4 h ; niveau 100 vers
  40 h sans publicité, ou vers 16 h en regardant « doubler les diamants » après chaque partie (`SIM_ADS=1 npm run sim`).
  Les PV des boss suivent un multiplicateur par palier qui monte vite au début puis plus doucement, pour que la
  progression ne cale pas en fin de campagne.
- **Objectif du jour** : se remet à zéro à minuit (heure du téléphone) ; récompense automatique.
- **Succès** : accordés automatiquement avec une notification.
- **Hors ligne** : diamants = (2 + 0,35 × meilleur niveau) × 50 % par heure, au moins 5 min d'absence, plafond 2 h
  (+1 h par niveau de « Coffre hors ligne », jusqu'à 8 h) ; aussi au retour d'arrière-plan.
- **Boost** : ×2 dégâts et pièces pendant 5 minutes **de jeu** (le temps ne s'écoule qu'en partie) ; recharge de 10 minutes.
- **Publicités** : sur le web, une fausse pub de 1,2 s (« Publicité (démo) ») accorde la récompense ; interstitiel au plus
  toutes les 4 min, après 3 min de session, seulement en revenant au menu après une défaite.
- **Langue** : français si le téléphone est en français, anglais sinon ; modifiable dans les paramètres. Le titre reste
  « Casseur de forme » dans les deux langues.
- **Musique** : trois thèmes (la mineur / mi mineur harmonique) joués par un petit séquenceur Web Audio ; le son ne démarre
  qu'au premier toucher (règle des navigateurs).
- **Performance** : rendu Canvas 2D sans flou (halos par double trait), 300 particules maximum ; moins de 1 ms de calcul par
  image mesuré ; option « économie d'énergie » à 30 images/s (la simulation reste à 60 mises à jour/s).
- **Sauvegarde v3** : migrations v1 → v2 → v3 (Tir double → Multi-tir niveau 1, ancien atelier conservé) ; export/import par
  code texte `CDF3.…` ; toutes les 10 s, à chaque niveau et au passage en arrière-plan.
- **Android** : Capacitor 8, JDK 21 (celui d'Android Studio), SDK 36 ; APK signé avec une **clé de test commitée**
  (`android/app/casseur-test.keystore`, mot de passe `casseur-test`) : elle ne doit jamais servir pour Google Play.
- **Icônes** : tracées en code (`public/icon.svg`, vecteur Android `ic_launcher_foreground.xml`) ; les PNG sont générés par script.

### Jalon 2
- **Terrain fixe** de 1 × 1,6 unités (portrait) mis à l'échelle de l'écran : la simulation est identique sur tous les téléphones.
- **Fin de niveau** : les ennemis restants explosent et rapportent leurs pièces ; le canon récupère une partie de ses PV.
- **Ancienne sauvegarde v1** : convertie automatiquement ; la partie repart au niveau 1, le meilleur niveau est gardé.
- Le hasard de la simulation utilise une graine : les tests sont reproductibles.

### Jalon 1
- **Grands nombres** : `number` JavaScript (précis jusqu'à ~1e308), mais tout passe par `src/game/bignum.ts`.
- **Formatage** : une décimale tronquée (999 999 → « 999,9 K »), suffixes K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc, puis
  notation scientifique.
- **Interface en HTML/CSS** par-dessus le canvas (boutons d'au moins 56 px) ; le canvas ne dessine que le jeu.
- **Simulation à pas fixe** (60 mises à jour/s) séparée du rendu, avec interpolation pour les écrans 90/120 Hz.
