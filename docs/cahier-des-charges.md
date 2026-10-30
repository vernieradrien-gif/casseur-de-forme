# Cahier des charges : Prisma Blast (anciennement « Casseur de forme »)

> Ce document est la **source de vérité** du projet. En cas de doute ou de contradiction, c'est lui qui fait foi.
>
> **Version 6.** Nouveau nom **Prisma Blast** et nouvelle icône, 5 thèmes de vagues et 5 thèmes de boss (un couple par monde, plus graves), pubs contre des gemmes (3 par jour), qualité d'affichage adaptative contre les ralentissements, son plus robuste.
> **Version 5.** 11 canons (certains avec un bonus passif, certains seulement en jouant, un canon légendaire en fin de campagne), armes cachées offertes en fin de monde, succès « monde sans dégât », plus aucune pub automatique, consentement publicitaire revu. Version 4 : canon libre en 2D, super boss en blocs, 5 mondes à thème, objectifs du jour, sauvegarde Google. Recherche préalable : [recherche-design.md](recherche-design.md). Historique en fin de document.

---

## 1. Vision et contraintes

Jeu de tir vertical hybride (action + progression) pour Android. En haut de l'écran, une grande forme géométrique lance des vagues d'ennemis sur le canon du joueur, en bas. Une fois les vagues passées, la forme devient un boss vulnérable qui se déplace et attaque. Le joueur **glisse le doigt** pour déplacer son canon dans toutes les directions ; le canon **tire tout seul droit vers le haut**. Les pièces améliorent le canon pendant la partie ; les diamants et les gemmes le rendent plus fort pour toujours.

- **Coût d'infrastructure 0 €** : aucun backend, hébergement statique (GitHub Pages).
- **Cible** : Android (APK/AAB via Capacitor) + version web PWA.
- **Aucun asset graphique** : formes tracées en code. **Aucun fichier audio** : musique et sons synthétisés en code.
- **Français d'abord**, anglais disponible (i18n).
- **Sessions courtes**, niveaux de 30 à 90 s.
- **Hors v1** : multijoueur, classement en ligne, comptes, achats intégrés.

## 2. Stack et règles de code

TypeScript strict + Vite, Canvas 2D, Web Audio, Capacitor (Android), AdMob (`@capacitor-community/admob`) avec consentement UMP, localStorage (JSON versionné), GitHub Pages, GitHub Actions.

- Simulation séparée du rendu, pas de temps fixe de 60 mises à jour/s. La simulation reçoit les commandes sous forme abstraite (`input.moveX`, `input.moveY`) et ne touche jamais au DOM.
- Hasard de la simulation par générateur à graine (tests reproductibles).
- Grands nombres : un seul module de calcul et un seul formateur (1,2 K, 3,4 M…).
- Formes = sommets calculés depuis (côtés, rayon, rotation) ; étoile = rayons alternés.
- Publicités uniquement via `src/ads/` (`showRewarded`) : **seulement des pubs récompensées que le joueur demande**, version factice sur le web, **identifiants AdMob de test uniquement**.
- Tout l'équilibrage dans `src/config/*.json`.

## 3. Gameplay

### 3.1 Contrôle
- Glisser le doigt n'importe où sur l'écran : le canon **suit le doigt** de gauche à droite **et de haut en bas** (déplacement relatif, le doigt ne cache pas le canon). Il reproduit exactement le mouvement du doigt (même distance) ; contre un bord, l'écart se recale. Il peut monter jusqu'au boss.
- **Contact** : si le canon touche le boss ou son bouclier de vagues, il subit de gros dégâts de zone (35 % de ses PV max), il est repoussé et reste invulnérable 1,2 s.
- Le canon tire **en continu, droit vers le haut**, même sans toucher l'écran. Cadence de départ : 2,5 tirs/s (à améliorer avec les pièces et l'atelier).
- **Visée automatique** : capacité à débloquer (gemmes). Pendant quelques secondes, le canon s'oriente seul vers l'ennemi le plus menaçant, **dans un cône limité** : 20° au départ, +20° par niveau de la capacité « Angle de visée » (disponible une fois la visée auto débloquée), **160° au plus**.

### 3.2 Structure d'un niveau
1. **Vagues** : la forme, protégée par un bouclier, lance 3 vagues (4 à partir du niveau 21, 5 à partir du niveau 51). Chaque vague est une **formation** lisible : ligne, V, serpent, pluie, entrées par les côtés, éventail. Une barre indique la progression des vagues.
2. **Phase boss** : quand la dernière vague est détruite ou sortie de l'écran, le bouclier tombe. La forme se déplace de gauche à droite, tire des projectiles (visés, en éventail, en anneau selon la forme) et lance parfois quelques ennemis. Sous 50 % de PV elle s'énerve : elle tourne et tire plus vite.
3. **Victoire** : les ennemis restants explosent (pièces gagnées), le canon récupère une partie de ses PV, diamants gagnés, niveau suivant.
- **Super boss** tous les 10 niveaux (10, 20, 30…) : une forme **en blocs**. Un cœur entouré d'un anneau tournant de blocs blindés (qui arrêtent les tirs, avec des trous pour passer) et de 2 canons. Seuls le cœur et les canons prennent des dégâts ; détruire un canon retire 20 % des PV du cœur. Gemmes au premier passage.
- **Titan** tous les 50 niveaux (50, 100, 150…) : deux anneaux blindés qui tournent en sens inverse et 4 canons.
- **Boss doré** : 2 % des boss, ×10 pièces, entrée spéciale dans la collection.
- **Zones faibles** : 1 à 3 points lumineux pulsants sur les sommets de la forme, qui tournent avec elle ; un tir qui les touche fait ×3 dégâts (nombre affiché d'une autre couleur).

### 3.3 Ennemis (un nouveau type présenté à la fois)

| Ennemi | Dès le niveau | Forme | Comportement |
|--------|---------------|-------|--------------|
| Éclat | 1 | petit triangle | descend en ligne droite |
| Virevolteur | 2 | losange fin | descend en zigzag |
| Tourelle | 5 | carré à canon | s'arrête et **tire sans bouger**, puis repart au bout d'un moment |
| Bloc | 6 | carré | lent, très résistant, gros dégâts |
| Mitrailleur | 9 | trapèze | s'arrête et **tire en allant de gauche à droite** |
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

Au-delà du niveau 250 (fin des 5 mondes), **mode infini** : les mondes et les formes recommencent, plus forts.

### 3.5 Armes secondaires (Armurerie)
Débloquées avec des gemmes, améliorées avec des diamants, équipées dans des emplacements (1 emplacement au départ, 2e au meilleur niveau 30, 3e au meilleur niveau 60, 4e au meilleur niveau 151).
- **Orbes** : sphères en orbite autour du canon ; détruisent les ennemis et les projectiles ennemis au contact.
- **Laser** : rayon vertical périodique qui transperce tout et ignore le blindage.
- **Éclairs** : frappent périodiquement l'ennemi le plus proche et rebondissent sur les suivants.

**Armes cachées** : invisibles dans l'armurerie tant qu'elles ne sont pas obtenues ; offertes (niveau 1) en terminant un monde, puis améliorées avec des diamants.

| Arme | Obtention | Effet |
|------|-----------|-------|
| Drones | fin du monde 1 | deux drones escortent le canon et tirent sur les ennemis proches |
| Gel | fin du monde 2 | aura qui ralentit ennemis (−40 %) et tirs ennemis (−45 %), et les abîme |
| Nova | fin du monde 3 | anneau de 14 tirs autour du canon toutes les 3,2 s |
| Trou de ver | fin du monde 4 | tourbillon qui aspire et broie le plus gros groupe d'ennemis |

### 3.5 bis Canons (types de tir)
Le canon principal peut changer de type (écran **Canons**) ; chacun a son tir et ses multiplicateurs de cadence et de dégâts. Certains donnent un **bonus passif**, actif tant que ce canon est choisi.

| Canon | Tir | Bonus passif | Obtention |
|-------|-----|--------------|-----------|
| Classique | tir droit régulier | — | dès le départ |
| Rafale | rafales de 3 tirs rapides | — | gratuit au niveau 15, ou 60 gemmes |
| Pompe | gerbe de plombs en éventail, courte portée | +20 % PV | gratuit après 20 boss vaincus, ou 80 gemmes |
| Missiles | missiles à tête chercheuse, explosion en zone | — | 120 gemmes uniquement |
| Rayon | faisceau continu qui traverse les ennemis | capacités rechargées 15 % plus vite | gratuit au niveau 40, ou 150 gemmes |
| Plasma | grosses sphères qui traversent plusieurs ennemis | +50 % sur les points faibles | gratuit après 15 super boss, ou 200 gemmes |
| Jumeaux | deux fûts qui tirent tour à tour | +15 % pièces | **seulement en jouant** : atteindre le monde 2 |
| Ricochet | tirs inclinés qui rebondissent sur les bords | +20 % diamants | **seulement en jouant** : atteindre le monde 3 |
| Gatling | cadence qui monte tant qu'elle tire | +15 % de réparation par niveau | **seulement en jouant** : atteindre le monde 4 |
| Foudre | arcs qui frappent droit devant puis rebondissent | capacités rechargées 20 % plus vite | **seulement en jouant** : atteindre le monde 5 |
| **Prisme** (légendaire) | éventail de sphères qui traversent tout | +25 % dégâts et +25 % pièces | **terminer les 5 mondes** |

### 3.6 Capacités (gemmes)
- **Visée auto** (bouton) : visée automatique quelques secondes, recharge.
- **Bouclier** (bouton) : invulnérable quelques secondes, recharge.
- **Onde de choc** (bouton) : détruit tous les ennemis et projectiles à l'écran et entame le boss, recharge.
- **Multi-tir** (passif) : tir double, puis triple.
- **Angle de visée** (passif, après la Visée auto) : élargit le cône de visée de 20° par niveau, jusqu'à 160°.
Chaque capacité active s'améliore (durée plus longue, recharge plus courte).

### 3.7 Défaite et mondes
- PV du canon à 0 : **explosion du canon** (en plusieurs temps, ralenti), puis écran de défaite après un court délai.
- Une **seconde chance** par partie (pub récompensée) : canon réparé à 50 %.
- La partie repart au niveau 1, ou au début d'un **monde** déjà atteint (mondes de 50 niveaux : 1-50, 51-100, 101-150…). Départ d'un monde avancé : pièces de départ pour acheter les améliorations de partie.
- **5 mondes** dans la campagne, affichés dès le début (« Monde 1 / 5 » sur le menu, **carte des mondes**). Chacun a son fond et une particularité qui agit sur le canon :

| Monde | Niveaux | Particularité |
|-------|---------|---------------|
| Nébuleuse | 1-50 | nuages lumineux : dedans, le canon tire 40 % plus vite |
| Champ d'astéroïdes | 51-100 | rochers qui bloquent les tirs et blessent le canon au contact (on peut les casser) |
| Supernova | 101-150 | éruptions en colonne, annoncées, à esquiver |
| Trou noir | 151-200 | attire le canon et dévie les tirs ; le toucher blesse |
| Tempête ionique | 201-250 | frappes annoncées autour du canon ; capacités 25 % plus lentes à recharger |

- **Difficulté dans un monde** : facile au début (on progresse vite et on améliore vite le canon), puis la montée s'accélère vers la fin du monde ; le monde suivant repart plus doucement.
- Pièces et améliorations de partie sont perdues ; diamants, gemmes, atelier, armurerie, capacités, succès et collection sont conservés.

### 3.8 Game feel
Nombres de dégâts flottants (couleur différente pour les zones faibles), éclair blanc sur les cibles touchées, secousse d'écran légère, particules, anneaux d'explosion, traînées des projectiles, flash rouge et vibration quand le canon est touché (désactivable).

## 4. Formules (modifiables en config)
- PV du boss = base × croissance par niveau × multiplicateur de palier × montée du monde (× super boss / titan).
- Croissance par niveau des PV et des dégâts (boss, ennemis, tirs) : ×1,162 (PV) et ×1,09 (dégâts) jusqu'au niveau 51, puis **×1,15 et ×1,088** : au-delà du premier monde, les améliorations de partie suivent presque la difficulté, qui vient surtout de la fin de chaque monde.
- Montée du monde = 1 + A × p^1,3, où p va de 0 (premier niveau du monde) à 1 (dernier) et A dépend du monde : 6, 10, 9, 9, 3 (mondes 1 à 5 ; 3 ensuite) ; puissance 0,6 pour les super boss et titans, 0,5 pour les PV et dégâts des ennemis et les tirs du boss.
- Ennemis : PV, dégâts, pièces = base du type × croissance par niveau (× montée du monde pour les PV et les dégâts).
- Coût d'une amélioration = coût de base × croissance^(achats).
- Cadence : au-delà de 20 tirs/s, la cadence en trop se change en dégâts.
- Diamants par boss = (1 + plancher((niveau − 1) / 5)) × 1,02^(niveau − 51 si positif), +2 au premier passage, ×2 avec une pub en fin de partie ; les gains hors ligne suivent le même facteur.

## 5. Progression

**Monnaies** :
- **Pièces** : ennemis et boss ; améliorations de partie ; perdues à la défaite.
- **Diamants** : boss, gains hors ligne ; atelier et armes.
- **Gemmes** : étoiles dorées, premier passage des super boss, succès, objectifs du jour ; capacités, déblocage des armes et achat de canons.

**Améliorations de partie (pièces)** : Dégâts, Cadence, Blindage (PV max, soigne le gain). Achat x1, x10, x100, max.

**Atelier (diamants)** : Dégâts, Cadence, PV de base, Gain de pièces, Pièces de départ, Réparation (soin en fin de niveau), Coffre hors ligne (durée max).

**Succès** : 45 succès, dont « terminer le monde N » et **« terminer le monde N sans prendre aucun dégât »** (les 50 niveaux du monde dans la même partie, sans un seul coup encaissé ; une partie qui commence au début du monde compte), super boss, titans, canons et armes. La récompense (gemmes) se **récupère en touchant le succès** dans l'écran Succès (pastille sur le menu quand une récompense attend).

**Objectifs du jour** : **3 objectifs** tirés chaque jour dans une liste de 8 (détruire des ennemis, vaincre des boss, toucher des points faibles, attraper une étoile dorée, utiliser des capacités, jouer des parties, terminer des niveaux, acheter des améliorations), à récupérer à la main ; bonus de 5 gemmes quand les 3 sont récupérés.

**Collection** : formes de boss vaincues (normales et dorées), super boss et titans, types d'ennemis rencontrés.

**Sauvegarde Google** (Android) : seul moyen de transférer sa progression. Le joueur connecté à Google Play Jeux (connexion automatique de Google au lancement, ou bouton « Se connecter » dans les paramètres) est synchronisé sans rien activer : envoi automatique et récupération sur un autre téléphone (on garde toujours la sauvegarde la plus avancée). Pas d'export/import par code ni de bouton pour effacer la sauvegarde.

**Hors ligne** : diamants = taux selon le meilleur niveau × temps absent, plafond 2 h (jusqu'à 8 h avec l'atelier), écran de bienvenue avec « Doubler (pub) » ; aucun gain si l'horloge recule.

## 6. Écrans
Portrait, boutons d'au moins 56 dp.
- **Menu principal** : titre animé, monde en cours (« Monde 1 / 5 », progression, 5 pastilles), Jouer / Continuer, objectifs du jour, boost (pub), et 8 tuiles : Canons, Armurerie, Capacités, Atelier, Succès, Objectifs du jour, Collection, Paramètres (pastille quand une récompense attend).
- **Carte des mondes** : les 5 mondes, leurs niveaux, leur particularité, la progression ; « Jouer ici » pour les mondes atteints ; mode infini.
- **Canons** : les 6 canons, leur tir, la condition de déblocage (avec barre) ou le prix en gemmes, choix du canon.
- **Objectifs du jour** : les 3 objectifs, leur progression, « Récupérer » ; bonus.
- **Jeu** : niveau, progression des vagues, pièces, pause ; améliorations de partie en bas ; boutons de capacités à droite.
- **Pause** : reprendre, paramètres, menu principal (la partie est conservée).
- **Défaite** : niveau atteint, record, gains ; continuer (pub), doubler les diamants (pub), rejouer, menu.
- **Bienvenue** (gains hors ligne), **Victoire** (niveau 250 atteint, fin des 5 mondes).
- **Paramètres** : musique, effets sonores, vibration, économie d'énergie (30 images/s), langue, version, politique de confidentialité ; « Sauvegarde Google » seulement quand elle est disponible, « Consentement publicités » seulement là où la loi l'exige.
- **Menu** : la barre du monde se remplit selon le niveau max atteint dans ce monde.
- Pause automatique en arrière-plan ; bouton retour Android géré.

**Rendu** : fond sombre étoilé propre à chaque monde (nébuleuse, astéroïdes, supernova, trou noir, tempête ionique), formes néon (contour lumineux, remplissage translucide), palette par palier, 300 particules max, silhouettes distinctes (accessibilité). **Qualité adaptative** : si les images arrivent trop lentement pendant plus d'une seconde et demie, la résolution de dessin baisse d'un cran (2 → 1,5 → 1) et le plafond de particules est divisé par deux ; elle remonte quand tout redevient fluide. Le canon est un corps trapézoïdal avec un petit rond central qui ne dépasse pas.

## 7. Audio
Musiques composées et synthétisées en code (Web Audio) : thème du menu (calme, avec nappes) ; pour **chaque monde, un thème de vagues et un thème de boss** qui lui sont propres (5 + 5, tonalité, tempo, batterie et timbre différents ; le mode infini les reprend dans l'ordre) ; le thème du boss démarre **quand son bouclier tombe**, fondu entre les thèmes. Registre **grave** (mélodies entre sol 2 et do 4, basse et sous-basse présentes, aigus filtrés). Chaque thème alterne **deux mélodies (A et B)**, avec une intro et, un tour sur quatre, un passage allégé : la musique varie au lieu de boucler à l'identique. La musique et les sons sont **coupés pendant les publicités**. Robustesse : contexte audio en mode « lecture » (tampons plus grands), notes préparées 0,5 s à l'avance, 12 effets sonores simultanés au plus. Effets : tir, impact, explosion, boss vaincu, canon touché, explosion du canon, gemme, clic, fin de niveau. Volumes réglables séparément.

## 8. Publicités
**Seulement des pubs récompensées, toujours demandées par le joueur** : continuer après la défaite (une fois par partie) ; doubler les diamants de la partie ; doubler les gains hors ligne ; boost ×2 dégâts et pièces pendant 5 min (recharge 10 min) ; **+7 gemmes par pub, 3 pubs par jour au plus (21 gemmes)**, bouton sur le menu principal. **Aucune pub automatique** (pas d'interstitiel), jamais de pub pendant un niveau. Consentement RGPD (Google UMP) sur Android **avant** tout démarrage du SDK publicitaire ; sans réponse de Google (hors ligne), aucune pub ; contenu des pubs limité à « PG ». Politique de confidentialité publiée sur GitHub Pages.

## 9. Données
Sauvegarde JSON versionnée avec migrations (v1 → v2 → v3 → v4) : partie en cours (reprise au début du niveau), méta-progression, succès, collection, objectif quotidien, paramètres, horodatage. Sauvegarde toutes les 10 s, à chaque niveau, à chaque passage en arrière-plan. Synchronisation Google Play Jeux (Saved Games) automatique sur Android dès que le joueur est connecté. Script de simulation sans rendu pour l'équilibrage (joueur automatique).

## 10. Jalons
1. **Cœur initial** *(fait)*.
2. **Boss + vagues + canon contrôlable** *(fait, version 2)*.
3. **Jeu complet v3** *(fait)* : contrôle au glisser, niveaux vagues → boss, 8 ennemis, propriétés et zones faibles, armes, capacités, mondes, menus, succès, collection, hors ligne, audio, i18n, PWA.
4. **Android et pubs** *(fait)* : Capacitor, AdMob test + UMP, APK construit par GitHub Actions.
5. **Version 4** *(fait)* : déplacement libre et contact, cône de visée, types de canon, tourelles et mitrailleurs, super boss et titans, 5 mondes à thème, plusieurs objectifs du jour, récompenses à récupérer, sauvegarde Google, musique épique, équilibrage revu.
6. **Version 5** *(fait)* : 11 canons dont 5 obtenus en jouant (bonus passifs, canon légendaire), armes cachées de fin de monde, succès « monde sans dégât », plus de pub automatique, consentement revu, textes allégés.
7. **Version 6** *(fait)* : nom Prisma Blast et icône, 10 musiques de jeu, pubs contre des gemmes, qualité adaptative, son robuste, version identique partout (1.3.0).
8. **Publication** (à faire par le propriétaire avec son compte Google Play) : clé de signature privée, fiche Google Play, test fermé (12 testeurs, 14 jours), production. Voir `docs/publication.md`.

## 11. Critères d'acceptation v1
- 250 niveaux jouables (5 mondes), puis mode infini ; le contrôle au doigt fait la différence.
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
- **v6** : nom **Prisma Blast** (anciennement « Casseur de forme ») et icône du prisme brisé ; 5 thèmes de vagues + 5 thèmes de boss, un couple par monde, plus graves, mélodies A/B ; pubs contre des gemmes (7 × 3 par jour) ; qualité d'affichage adaptative et son robuste contre les ralentissements et les craquements ; rond du canon contenu dans le corps ; numéro de version identique dans l'APK et dans le jeu.
- **v5** : 5 nouveaux canons (Jumeaux, Ricochet, Gatling, Foudre, Prisme légendaire) et bonus passifs ; 4 armes cachées offertes en fin de monde et 4e emplacement ; 15 nouveaux succès dont « monde sans dégât » ; barre du monde selon le niveau max ; suppression de l'interstitiel ; consentement UMP avant le SDK ; suivi du doigt exact ; textes allégés.
- **v4** (retours du propriétaire après test de l'APK) : canon libre en 2D et dégâts de contact ; cône de visée 20° → 160° ; 6 types de canon ; tourelles et mitrailleurs ; super boss en blocs (tous les 10 niveaux) et titans (tous les 50) ; 5 mondes à thème qui agissent sur le canon, campagne de 250 niveaux ; 3 objectifs du jour ; récompenses des succès à récupérer ; sauvegarde Google ; musique de jeu épique, changement au bouclier du boss, silence pendant les pubs ; départ plus lent (cadence initiale réduite, boss plus solides) et difficulté qui monte vers la fin de chaque monde.
