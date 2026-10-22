# Cahier des charges : Casseur de forme (nom provisoire)

> Ce document est la **source de vérité** du projet. En cas de doute ou de contradiction, c'est lui qui fait foi.

---

## 1. Vision et contraintes

Jeu incrémental Android : une grande forme géométrique tourne au centre de l'écran, des armes la frappent automatiquement, le joueur investit ses gains pour détruire des formes toujours plus complexes.

- **Coût d'infrastructure 0 €** : aucun backend, hébergement statique gratuit (GitHub Pages).
- **Cible** : Android (APK/AAB via Capacitor) + version web PWA.
- **Aucun asset graphique** : formes tracées en code.
- **Français d'abord**, textes externalisés (i18n) pour ajouter l'anglais.
- **Jouable sans cliquer** (progression automatique), couche active facultative (toucher pour un tir manuel précis).
- **Sessions très courtes**, retours grâce au gain hors ligne, revenu via pubs récompensées.
- **Hors v1** : multijoueur, classement en ligne, comptes, achats intégrés.

## 2. Stack

TypeScript + Vite, Canvas 2D natif (particules maison), Capacitor, AdMob (`@capacitor-community/admob`) avec consentement UMP, localStorage (JSON versionné), GitHub Pages.

**Règles :**

- Simulation séparée du rendu, pas de temps fixe : 60 mises à jour/s.
- Grands nombres via **un seul module de calcul** et **un seul formateur** (1,2 K, 3,4 M, 5,6 B…).
- Une forme = sommets calculés depuis (côtés, rayon, rotation) ; étoile = polygone alterné rayon extérieur/intérieur.
- Couche `ads/` derrière une interface unique (`showRewarded`, `showInterstitial`) avec version factice sur le web.
- Identifiants de test AdMob uniquement.
- Tout l'équilibrage dans `config/*.json`.

## 3. Gameplay

**Boucle** : une forme apparaît avec ses PV, tourne, les armes tirent automatiquement ; à la destruction : pièces, éclats, forme suivante. Boss tous les 10 niveaux avec limite de 30 s (si raté : recul d'un niveau, aucune perte permanente). Le joueur dépense ses pièces à tout moment.

**Zones faibles** : 1 à 3 par forme (sommet, côté, cœur), x3 dégâts, tournent avec la forme, lueur pulsante. Tirs auto vers le centre ; un toucher envoie un tir manuel vers l'endroit touché.

**Propriétés** :

- Blindage : réduit chaque coup d'une valeur fixe.
- Bouclier : absorbe N coups.
- Régénération : PV/s si non touchée.
- Rotation rapide.
- Fragmentation : se divise à la mort.

**Armes (4)** :

| Arme | Comportement |
|------|--------------|
| Canon | Projectile régulier |
| Orbes | Sphères en orbite, dégâts au contact |
| Laser | Rayon balayant, efficace contre le blindage |
| Éclairs | Chaînent forme et fragments |

Chaque arme s'améliore séparément ; 3 armes équipées max, emplacements débloqués par la progression.

**Game feel** : nombres de dégâts flottants (couleur différente pour critiques et zones faibles), secousse d'écran légère, particules, flash, vibration courte à la mort d'un boss (désactivable).

## 4. Catalogue

10 paliers de 10 niveaux (100 niveaux) ; le 10e niveau de chaque palier est un boss.

| Palier | Forme | Zones faibles | Propriétés |
|--------|-------|---------------|------------|
| 1 | Triangle | 1 | Aucune |
| 2 | Carré | 2 | Rotation plus rapide |
| 3 | Pentagone | 2 | Blindage léger |
| 4 | Hexagone | 3 | Régénération |
| 5 | Octogone | 3 | Bouclier 3 coups |
| 6 | Étoile 5 branches | 5 | Fragmentation en 2 |
| 7 | Losange double | 2 | Blindage fort |
| 8 | Étoile 8 branches | 4 | Bouclier + régénération |
| 9 | Cercle à anneaux concentriques | 1 (le cœur) | Anneaux à détruire un par un |
| 10 | Cristal composé | 3 | Toutes propriétés |

**Formules** (modifiables en config) :

- PV = 10 × 1,22^(niveau − 1) × multiplicateur du palier
- Pièces = 1 × 1,17^(niveau − 1)
- Boss : PV x8, pièces x5, 30 s
- Coût d'une amélioration = coût de base × 1,15^(achats)

**Collection** : album des formes détruites ; variante rare (2 % d'apparition) = 10x pièces.

## 5. Progression

**Monnaies** : pièces (partie en cours, remises à zéro à la renaissance) et cristaux (permanents).

**Améliorations (pièces)** :

| Amélioration | Effet par niveau | Coût de base |
|--------------|------------------|--------------|
| Dégâts | +10 % | 10 |
| Cadence | +5 % | 25 |
| Critiques | +1 % de chance, critique x2 | 40 |
| Pièces | +8 % | 60 |
| Dégâts sur zones faibles | +10 % | 100 |
| Nouvelle arme | — | 1 000 |

Achat en lot : x1, x10, x100, max.

**Renaissance (prestige)** : disponible dès le niveau 30, recommence au niveau 1 ; cristaux = plancher((niveau max / 10)^1,5), chacun +2 % dégâts et pièces. Arbre permanent : démarrer plus haut, conserver une arme, gain hors ligne plus long, tirs manuels plus puissants, emplacement d'arme.

**Hors ligne** : gain = production moyenne par seconde × temps absent, plafond 2 h (extensible à 8 h), écran de bienvenue avec bouton « Doubler (pub) » ; aucun gain si l'horloge recule.

**Succès** : 30 succès donnant des cristaux ; objectif quotidien (détruire 50 formes).

## 6. Écrans

Portrait, boutons d'amélioration d'au moins 56 dp, rien de profond.

- **Jeu** : forme en haut, améliorations en bas, bouton Renaissance si disponible, pause.
- **Accueil / bienvenue** : gains hors ligne, objectif quotidien.
- **Arbre permanent**.
- **Collection**.
- **Succès**.
- **Paramètres** : son, vibration, langue, consentement pubs, export/import de sauvegarde, À propos.

Pause automatique en arrière-plan.

**Rendu** : fond sombre, formes en contour lumineux avec remplissage translucide, palette par palier, 300 particules max, mode économie d'énergie (30 images/s), formes distinctes par silhouette (accessibilité).

## 7. Publicités (plus tard, jalon 4)

**Récompensées** :

- Gains hors ligne x2.
- Boost x2 dégâts et pièces pendant 5 min (recharge 10 min).
- Pièces du boss x2.
- +25 % de cristaux à la renaissance.

**Interstitiel** rare (au plus toutes les 4 min, après une session de plus de 3 min). Jamais de pub forcée pendant le jeu. Consentement RGPD (UMP) et politique de confidentialité sur GitHub Pages.

## 8. Données

**Sauvegarde** JSON versionnée avec migrations : partie, méta-progression, collection et succès, paramètres, horodatage. Sauvegarde auto toutes les 10 s et à chaque passage en arrière-plan. Export/import en code texte.

**Équilibrage** : script de simulation sans rendu. Rythme visé : palier 1 en 5 min, première renaissance après 25 à 40 min, palier 10 après 5 à 8 renaissances.

## 9. Jalons

1. **Cœur de jeu**.
2. **Contenu** : 10 paliers, zones faibles, propriétés, 4 armes, boss, tir manuel.
3. **Progression** : renaissance, cristaux, arbre, hors ligne, collection, succès, sauvegarde, simulation.
4. **Pubs et Android** : `ads/`, AdMob test, RGPD, Capacitor, APK construit par GitHub Action, effets.
5. **Publication** : politique de confidentialité, fiche Google Play, test fermé de 12 testeurs sur 14 jours, production.

## 10. Critères d'acceptation v1

- 100 niveaux jouables sans clic.
- Tir manuel sur zone faible = x3.
- Grands nombres corrects jusqu'à 1e30.
- Gain hors ligne calculé, plafonné, doublable.
- La renaissance conserve cristaux et arbre.
- 60 images/s avec 300 particules.
- Consentement RGPD dans l'Espace économique européen.
- Sauvegarde robuste aux fermetures brutales et aux mises à jour.
