# Cahier des charges : Casseur de forme (nom provisoire)

> Ce document est la **source de vérité** du projet. En cas de doute ou de contradiction, c'est lui qui fait foi.
>
> **Version 2** : le concept passe d'un pur jeu « idle » (la forme encaisse les tirs) à un jeu hybride : la grande forme est un **boss** qui envoie des **vagues d'ennemis** sur un **canon contrôlable** qui a sa propre barre de vie. Voir l'historique en fin de document.

---

## 1. Vision et contraintes

Jeu de tir hybride (action + incrémental) pour Android : en haut de l'écran, une grande forme géométrique (le boss) tourne et lance des vagues d'ennemis qui foncent sur le canon du joueur, en bas. Le canon tire automatiquement ; le joueur peut le déplacer et/ou l'orienter pour esquiver et viser. Les pièces gagnées améliorent le canon pendant la partie ; les diamants et les gemmes le rendent plus fort de façon permanente.

- **Coût d'infrastructure 0 €** : aucun backend, hébergement statique gratuit (GitHub Pages).
- **Cible** : Android (APK/AAB via Capacitor) + version web PWA.
- **Aucun asset graphique** : formes tracées en code.
- **Français d'abord**, textes externalisés (i18n) pour ajouter l'anglais.
- **Hybride** : le canon tire et vise seul (on peut le laisser jouer), mais le contrôle du joueur (déplacement, visée, capacités) fait la différence. Sans intervention, on progresse un peu puis on perd.
- **Sessions courtes**, revenu via pubs récompensées.
- **Hors v1** : multijoueur, classement en ligne, comptes, achats intégrés.

## 2. Stack

TypeScript + Vite, Canvas 2D natif (particules maison), Capacitor, AdMob (`@capacitor-community/admob`) avec consentement UMP, localStorage (JSON versionné), GitHub Pages.

**Règles :**

- Simulation séparée du rendu, pas de temps fixe : 60 mises à jour/s. La simulation reçoit les commandes du joueur sous forme abstraite (cible de déplacement, point visé) et ne touche jamais au DOM.
- Hasard de la simulation par générateur pseudo-aléatoire à graine (tests reproductibles).
- Grands nombres via **un seul module de calcul** et **un seul formateur** (1,2 K, 3,4 M, 5,6 B…).
- Une forme = sommets calculés depuis (côtés, rayon, rotation) ; étoile = polygone alterné rayon extérieur/intérieur.
- Couche `ads/` derrière une interface unique (`showRewarded`, `showInterstitial`) avec version factice sur le web.
- Identifiants de test AdMob uniquement.
- Tout l'équilibrage dans `config/*.json`.

## 3. Gameplay

**Terrain** : portrait. Le boss occupe le haut, le canon se trouve en bas et se déplace horizontalement.

**Boucle d'un niveau** : le boss apparaît avec ses PV et tourne sur lui-même. À intervalles réguliers, il lance une **vague** d'ennemis qui foncent vers le canon. Le canon tire en continu : ses tirs détruisent les ennemis et touchent le boss. Le niveau est gagné quand le boss est détruit : les ennemis restants explosent (pièces gagnées), le canon récupère une partie de ses PV, puis le niveau suivant commence avec un boss plus fort.

**Canon** :

- Barre de vie ; un ennemi qui le percute lui inflige ses dégâts puis disparaît.
- Tir automatique ; visée automatique sur l'ennemi le plus menaçant (le plus proche du canon), sinon sur le boss.
- **Modes de contrôle, au choix du joueur dans les paramètres** :
  1. *Glisser + visée auto* (par défaut) : on glisse le doigt n'importe où pour déplacer le canon à gauche/droite ; la visée reste automatique.
  2. *Glisser + visée au doigt* : le canon se déplace vers le doigt et tire vers le point touché.
  3. *Canon fixe, visée au doigt* : le canon reste au centre et s'oriente vers le point touché.
- Quand le joueur ne touche pas l'écran, le canon vise automatiquement (mode hybride).

**Défaite** : quand les PV du canon tombent à 0, la partie s'arrête et **repart au niveau 1**. Pièces et améliorations de partie sont perdues ; diamants, gemmes, améliorations permanentes et capacités sont conservés. Plus tard : des **mondes** de 50 niveaux au moins serviront de points de reprise (on reprendra au début du dernier monde atteint).

**Ennemis** (plus de types débloqués avec les niveaux) :

| Ennemi | Forme | Comportement | Récompense |
|--------|-------|--------------|------------|
| Éclat | petit triangle | fonce en ligne droite vers la position du canon au moment du lancer | peu de pièces |
| Bloc | carré | lent, résistant, gros dégâts | beaucoup de pièces |
| Chasseur | losange | suit le canon (virage limité) | pièces moyennes |
| Rare | étoile dorée | zigzague sans viser, s'enfuit par le bas | **1 gemme** + pièces |

**Difficulté par niveau** (formules en config) : PV du boss, PV / dégâts / pièces des ennemis croissent exponentiellement ; les vagues sont plus fréquentes et plus nombreuses (avec plafonds).

**Capacités spéciales** (débloquées avec des gemmes) : Bouclier (invulnérable quelques secondes, recharge), Tir double (passif), Onde de choc (détruit tous les ennemis à l'écran et entame le boss, recharge). Plus tard : armes Orbes, Laser, Éclairs.

**Game feel** : nombres de dégâts flottants, secousse d'écran légère, particules, flash, éclats à la destruction, flash rouge et vibration courte quand le canon est touché (désactivable).

## 4. Catalogue

10 paliers de 10 niveaux (100 niveaux). La forme du boss change à chaque palier :

| Palier | Boss | Plus tard (propriétés) |
|--------|------|------------------------|
| 1 | Triangle | aucune |
| 2 | Carré | rotation plus rapide |
| 3 | Pentagone | blindage léger |
| 4 | Hexagone | régénération |
| 5 | Octogone | bouclier 3 coups |
| 6 | Étoile 5 branches | fragmentation en 2 |
| 7 | Losange | blindage fort |
| 8 | Étoile 8 branches | bouclier + régénération |
| 9 | Cercle | anneaux à détruire un par un |
| 10 | Cristal | toutes propriétés |

**Formules** (modifiables en config) :

- PV du boss = base × croissance^(niveau − 1) × multiplicateur du palier.
- Ennemis : PV, dégâts et pièces = base du type × croissance^(niveau − 1).
- Coût d'une amélioration = coût de base × croissance^(achats).

## 5. Progression

**Monnaies** :

- **Pièces** : gagnées en détruisant ennemis et boss (plus ou moins selon l'ennemi), dépensées pendant la partie, **perdues à la défaite**.
- **Diamants** (permanents) : gagnés à chaque boss vaincu, davantage la première fois qu'un niveau est franchi. Servent à améliorer les **statistiques de base** du canon.
- **Gemmes** (permanentes) : ennemis rares, premier franchissement de chaque palier de 10 niveaux ; plus tard succès, objectif quotidien et pubs récompensées. Servent à débloquer les **capacités spéciales**.

**Améliorations de partie (pièces)** : Dégâts, Cadence, PV max (soigne aussi le gain). Achat en lot x1, x10, x100, max.

**Atelier (diamants)** : Dégâts de base, Cadence de base, PV de base, Gain de pièces.

**Capacités (gemmes)** : Bouclier, Tir double, Onde de choc (puis Orbes, Laser, Éclairs).

**Plus tard** : mondes-points de reprise (≥ 50 niveaux), hors ligne (gain réduit), succès donnant des gemmes, objectif quotidien (détruire N ennemis), collection des boss vaincus.

## 6. Écrans

Portrait, boutons d'au moins 56 dp, rien de profond.

- **Jeu** : barre du haut (niveau, pièces, diamants, gemmes, pause) ; boss en haut, canon en bas avec sa barre de vie ; améliorations de partie en bas ; boutons de capacités sur le côté.
- **Pause** : reprendre, atelier, capacités, paramètres.
- **Défaite** : niveau atteint, meilleur niveau, diamants et gemmes gagnés, accès atelier / capacités, rejouer.
- **Atelier** (diamants) et **Capacités** (gemmes).
- **Paramètres** : mode de contrôle, vibration, (plus tard : son, langue, consentement pubs, export/import), effacer la sauvegarde, À propos.
- Pause automatique en arrière-plan.

**Rendu** : fond sombre, formes en contour lumineux avec remplissage translucide, palette par palier, 300 particules max, mode économie d'énergie (30 images/s) plus tard, formes distinctes par silhouette (accessibilité).

## 7. Publicités (plus tard)

**Récompensées** : continuer une fois après la défaite (canon réparé à 50 %) ; boost x2 dégâts et pièces 5 min (recharge 10 min) ; diamants du boss x2 ; gemmes. **Interstitiel** rare (au plus toutes les 4 min, après une session de plus de 3 min, jamais pendant un niveau). Consentement RGPD (UMP) et politique de confidentialité sur GitHub Pages.

## 8. Données

**Sauvegarde** JSON versionnée avec migrations : partie en cours (reprise au début du niveau en cours), méta-progression (diamants, gemmes, atelier, capacités, meilleur niveau), paramètres, horodatage. Sauvegarde auto toutes les 10 s, à chaque niveau et à chaque passage en arrière-plan. Export/import en code texte (plus tard).

**Équilibrage** : simulation sans rendu avec un joueur automatique. Rythme visé : une première partie sans amélioration permanente atteint le niveau 5 à 10 ; chaque retour à l'atelier permet d'aller plus loin ; palier 10 après plusieurs heures.

## 9. Jalons

1. **Cœur initial** *(fait)* : forme qui tourne, canon automatique, pièces, amélioration de dégâts, grands nombres.
2. **Nouveau cœur** : canon contrôlable (3 modes), boss + vagues, 4 types d'ennemis, PV du canon, défaite → niveau 1, améliorations de partie, diamants + atelier, gemmes + 3 capacités, 10 formes de boss, paramètres, sauvegarde v2.
3. **Contenu** : propriétés des boss, zones faibles, armes Orbes / Laser / Éclairs, nouveaux ennemis, mondes-points de reprise.
4. **Progression** : succès, objectif quotidien, hors ligne, collection, export/import, simulation d'équilibrage complète.
5. **Pubs et Android** : `ads/`, AdMob test, RGPD, Capacitor, APK construit par GitHub Action.
6. **Publication** : politique de confidentialité, fiche Google Play, test fermé de 12 testeurs sur 14 jours, production.

## 10. Critères d'acceptation v1

- 100 niveaux jouables ; le canon tire et vise seul, le contrôle améliore nettement les résultats.
- Les trois modes de contrôle fonctionnent au doigt.
- Grands nombres corrects jusqu'à 1e30.
- La défaite renvoie au niveau 1 en conservant diamants, gemmes, atelier et capacités.
- 60 images/s avec 300 particules.
- Consentement RGPD dans l'Espace économique européen.
- Sauvegarde robuste aux fermetures brutales et aux mises à jour.

---

## Historique

- **v1** : jeu idle, la forme encaisse les tirs automatiques ; renaissance au niveau 30 donnant des cristaux.
- **v2** : la forme devient un boss qui lance des vagues d'ennemis ; canon contrôlable avec barre de vie ; pièces (partie), diamants (statistiques de base), gemmes (capacités) ; la défaite remplace la renaissance (retour au niveau 1) ; mondes-points de reprise prévus.
