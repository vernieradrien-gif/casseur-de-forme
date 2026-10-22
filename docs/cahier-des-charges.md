# Cahier des charges : Casseur de forme (nom provisoire)

> Ce document est la **source de vérité** du projet. En cas de doute ou de contradiction, c'est lui qui fait foi.
>
> **Version 3.** Contrôle uniquement au glisser avec tir droit ; la visée automatique devient une capacité. Niveaux en deux temps (vagues puis boss), menu principal, musique, version Android. Recherche préalable : [recherche-design.md](recherche-design.md). Historique en fin de document.

---

## 1. Vision et contraintes

Jeu de tir vertical hybride (action + progression) pour Android. En haut de l'écran, une grande forme géométrique lance des vagues d'ennemis sur le canon du joueur, en bas. Une fois les vagues passées, la forme devient un boss vulnérable qui se déplace et attaque. Le joueur **glisse le doigt** pour déplacer son canon, qui **tire tout seul droit vers le haut**. Les pièces améliorent le canon pendant la partie ; les diamants et les gemmes le rendent plus fort pour toujours.

- **Coût d'infrastructure 0 €** : aucun backend, hébergement statique (GitHub Pages).
- **Cible** : Android (APK/AAB via Capacitor) + version web PWA.
- **Aucun asset graphique** : formes tracées en code. **Aucun fichier audio** : musique et sons synthétisés en code.
- **Français d'abord**, anglais disponible (i18n).
- **Sessions courtes**, niveaux de 30 à 90 s.
- **Hors v1** : multijoueur, classement en ligne, comptes, achats intégrés.

## 2. Stack et règles de code

TypeScript strict + Vite, Canvas 2D, Web Audio, Capacitor (Android), AdMob (`@capacitor-community/admob`) avec consentement UMP, localStorage (JSON versionné), GitHub Pages, GitHub Actions.

- Simulation séparée du rendu, pas de temps fixe de 60 mises à jour/s. La simulation reçoit les commandes sous forme abstraite (`input.moveX`) et ne touche jamais au DOM.
- Hasard de la simulation par générateur à graine (tests reproductibles).
- Grands nombres : un seul module de calcul et un seul formateur (1,2 K, 3,4 M…).
- Formes = sommets calculés depuis (côtés, rayon, rotation) ; étoile = rayons alternés.
- Publicités uniquement via `src/ads/` (`showRewarded`, `showInterstitial`), version factice sur le web, **identifiants AdMob de test uniquement**.
- Tout l'équilibrage dans `src/config/*.json`.

## 3. Gameplay

### 3.1 Contrôle
- Glisser le doigt n'importe où sur l'écran : le canon suit le mouvement horizontal (déplacement relatif, le doigt ne cache pas le canon).
- Le canon tire **en continu, droit vers le haut**, même sans toucher l'écran.
- **Visée automatique** : capacité à débloquer (gemmes). Pendant quelques secondes, le canon s'oriente seul vers l'ennemi le plus menaçant, puis elle doit se recharger.

### 3.2 Structure d'un niveau
1. **Vagues** : la forme, protégée par un bouclier, lance 3 vagues (4 à partir du niveau 21, 5 à partir du niveau 51). Chaque vague est une **formation** lisible : ligne, V, serpent, pluie, entrées par les côtés, éventail. Une barre indique la progression des vagues.
2. **Phase boss** : quand la dernière vague est détruite ou sortie de l'écran, le bouclier tombe. La forme se déplace de gauche à droite, tire des projectiles (visés, en éventail, en anneau selon la forme) et lance parfois quelques ennemis. Sous 50 % de PV elle s'énerve : elle tourne et tire plus vite.
3. **Victoire** : les ennemis restants explosent (pièces gagnées), le canon récupère une partie de ses PV, diamants gagnés, niveau suivant.
- Le **niveau 10 de chaque palier** est un **grand boss** : plus grand, plus de PV, toutes les propriétés du palier, gemmes au premier passage.
- **Boss doré** : 2 % des boss, ×10 pièces, entrée spéciale dans la collection.
- **Zones faibles** : 1 à 3 points lumineux pulsants sur les sommets de la forme, qui tournent avec elle ; un tir qui les touche fait ×3 dégâts (nombre affiché d'une autre couleur).

### 3.3 Ennemis (un nouveau type présenté à la fois)

| Ennemi | Dès le niveau | Forme | Comportement |
|--------|---------------|-------|--------------|
| Éclat | 1 | petit triangle | descend en ligne droite |
| Virevolteur | 3 | losange fin | descend en zigzag |
| Bloc | 6 | carré | lent, très résistant, gros dégâts |
| Chasseur | 12 | flèche | suit le canon (virage limité) |
| Tireur | 16 | hexagone | s'arrête à mi-hauteur, tire sur le canon, repart |
| Diviseur | 22 | pentagone | se divise en 2 Éclats à sa mort |
| Kamikaze | 30 | triangle allongé | s'arrête, vise, puis fonce très vite |
| Blindé | 40 | octogone | bouclier frontal qui absorbe les premiers tirs |
| Étoile dorée (rare) | 3 | étoile | zigzague et s'enfuit ; donne **1 gemme** |

PV, dégâts et pièces des ennemis augmentent à chaque niveau.

### 3.4 Propriétés des boss par palier

| Palier | Forme | Propriété apprise |
|--------|-------|-------------------|
| 1 | Triangle | aucune |
| 2 | Carré | rotation et tirs plus rapides |
| 3 | Pentagone | blindage léger (réduit chaque coup d'une valeur fixe) |
| 4 | Hexagone | régénération (PV/s si non touché) |
| 5 | Octogone | bouclier qui absorbe N coups et se recharge |
| 6 | Étoile 5 branches | fragmentation : se divise en 2 à sa mort |
| 7 | Losange | blindage fort |
| 8 | Étoile 8 branches | bouclier + régénération |
| 9 | Cercle à anneaux | anneaux à détruire un par un avant le cœur |
| 10 | Cristal | toutes les propriétés |

Au-delà du niveau 100, **mode infini** : les formes recommencent, plus fortes.

### 3.5 Armes secondaires (Armurerie)
Débloquées avec des gemmes, améliorées avec des diamants, équipées dans des emplacements (1 emplacement au départ, 2e au meilleur niveau 30, 3e au meilleur niveau 60).
- **Orbes** : sphères en orbite autour du canon ; détruisent les ennemis et les projectiles ennemis au contact.
- **Laser** : rayon vertical périodique qui transperce tout et ignore le blindage.
- **Éclairs** : frappent périodiquement l'ennemi le plus proche et rebondissent sur les suivants.

### 3.6 Capacités (gemmes)
- **Visée auto** (bouton) : visée automatique quelques secondes, recharge.
- **Bouclier** (bouton) : invulnérable quelques secondes, recharge.
- **Onde de choc** (bouton) : détruit tous les ennemis et projectiles à l'écran et entame le boss, recharge.
- **Multi-tir** (passif) : tir double, puis triple.
Chaque capacité active s'améliore (durée plus longue, recharge plus courte).

### 3.7 Défaite et mondes
- PV du canon à 0 : **explosion du canon** (en plusieurs temps, ralenti), puis écran de défaite après un court délai.
- Une **seconde chance** par partie (pub récompensée) : canon réparé à 50 %.
- La partie repart au niveau 1, ou au début d'un **monde** déjà atteint (mondes de 50 niveaux : 1-50, 51-100, 101-150…). Départ d'un monde avancé : pièces de départ pour acheter les améliorations de partie.
- Pièces et améliorations de partie sont perdues ; diamants, gemmes, atelier, armurerie, capacités, succès et collection sont conservés.

### 3.8 Game feel
Nombres de dégâts flottants (couleur différente pour les zones faibles), éclair blanc sur les cibles touchées, secousse d'écran légère, particules, anneaux d'explosion, traînées des projectiles, flash rouge et vibration quand le canon est touché (désactivable).

## 4. Formules (modifiables en config)
- PV du boss = base × croissance^(niveau − 1) × multiplicateur de palier (× grand boss).
- Ennemis : PV, dégâts, pièces = base du type × croissance^(niveau − 1).
- Coût d'une amélioration = coût de base × croissance^(achats).
- Diamants par boss = 1 + plancher((niveau − 1) / 5), +2 au premier passage, ×2 avec une pub en fin de partie.

## 5. Progression

**Monnaies** :
- **Pièces** : ennemis et boss ; améliorations de partie ; perdues à la défaite.
- **Diamants** : boss, gains hors ligne ; atelier et armes.
- **Gemmes** : étoiles dorées, premier passage des grands boss, succès, objectif quotidien ; capacités et déblocage des armes.

**Améliorations de partie (pièces)** : Dégâts, Cadence, Blindage (PV max, soigne le gain). Achat x1, x10, x100, max.

**Atelier (diamants)** : Dégâts, Cadence, PV de base, Gain de pièces, Pièces de départ, Réparation (soin en fin de niveau), Coffre hors ligne (durée max).

**Succès** : 30 succès donnant des gemmes. **Objectif quotidien** : détruire 150 ennemis (gemmes). **Collection** : formes de boss vaincues (normales et dorées) et types d'ennemis rencontrés.

**Hors ligne** : diamants = taux selon le meilleur niveau × temps absent, plafond 2 h (jusqu'à 8 h avec l'atelier), écran de bienvenue avec « Doubler (pub) » ; aucun gain si l'horloge recule.

## 6. Écrans
Portrait, boutons d'au moins 56 dp.
- **Menu principal** : titre animé, Jouer / Continuer, choix du monde, Atelier, Armurerie, Capacités, Collection, Succès, Paramètres, objectif quotidien, boost (pub).
- **Jeu** : niveau, progression des vagues, pièces, pause ; améliorations de partie en bas ; boutons de capacités à droite.
- **Pause** : reprendre, paramètres, menu principal (la partie est conservée).
- **Défaite** : niveau atteint, record, gains ; continuer (pub), doubler les diamants (pub), rejouer, menu.
- **Bienvenue** (gains hors ligne), **Victoire** (niveau 100 atteint).
- **Paramètres** : musique, effets sonores, vibration, économie d'énergie (30 images/s), langue, consentement publicités, export/import de la sauvegarde, effacer, À propos, politique de confidentialité.
- Pause automatique en arrière-plan ; bouton retour Android géré.

**Rendu** : fond sombre étoilé, formes néon (contour lumineux, remplissage translucide), palette par palier, 300 particules max, silhouettes distinctes (accessibilité).

## 7. Audio
Musiques composées et synthétisées en code (Web Audio) : thème du menu (calme), thème de jeu (rythmé), thème de boss (intense), fondu entre les thèmes. Effets : tir, impact, explosion, boss vaincu, canon touché, explosion du canon, gemme, clic, fin de niveau. Volumes réglables séparément.

## 8. Publicités
**Récompensées** : continuer après la défaite (une fois par partie) ; doubler les diamants de la partie ; doubler les gains hors ligne ; boost ×2 dégâts et pièces pendant 5 min (recharge 10 min). **Interstitiel** rare : au plus toutes les 4 min, après 3 min de session, uniquement au retour au menu après une défaite. Jamais de pub pendant un niveau. Consentement RGPD (UMP) sur Android ; politique de confidentialité publiée sur GitHub Pages.

## 9. Données
Sauvegarde JSON versionnée avec migrations (v1 → v2 → v3) : partie en cours (reprise au début du niveau), méta-progression, succès, collection, objectif quotidien, paramètres, horodatage. Sauvegarde toutes les 10 s, à chaque niveau, à chaque passage en arrière-plan. Export/import en code texte. Script de simulation sans rendu pour l'équilibrage (joueur automatique).

## 10. Jalons
1. **Cœur initial** *(fait)*.
2. **Boss + vagues + canon contrôlable** *(fait, version 2)*.
3. **Jeu complet v3** *(fait)* : contrôle au glisser, niveaux vagues → boss, 8 ennemis, propriétés et zones faibles, armes, capacités, mondes, menus, succès, collection, hors ligne, audio, i18n, PWA.
4. **Android et pubs** *(fait)* : Capacitor, AdMob test + UMP, APK construit par GitHub Actions.
5. **Publication** (à faire par le propriétaire avec son compte Google Play) : clé de signature privée, fiche Google Play, test fermé (12 testeurs, 14 jours), production. Voir `docs/publication.md`.

## 11. Critères d'acceptation v1
- 100 niveaux jouables, puis mode infini ; le contrôle au doigt fait la différence.
- Tir sur zone faible = ×3.
- Grands nombres corrects jusqu'à 1e30.
- Gain hors ligne calculé, plafonné, doublable.
- La défaite conserve diamants, gemmes, atelier, armes, capacités, succès et collection.
- 60 images/s avec 300 particules.
- Consentement RGPD dans l'Espace économique européen.
- Sauvegarde robuste aux fermetures brutales et aux mises à jour.

---

## Historique
- **v1** : jeu idle, la forme encaisse les tirs automatiques ; renaissance au niveau 30.
- **v2** : la forme devient un boss qui lance des vagues ; canon contrôlable (3 modes) avec PV ; pièces, diamants, gemmes ; défaite = retour au niveau 1.
- **v3** : contrôle unique au glisser avec tir droit ; visée auto = capacité ; niveaux vagues puis boss ; 8 ennemis ; armes ; mondes de 50 niveaux ; menu principal ; audio ; Android.
