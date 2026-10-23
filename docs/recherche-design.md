# Recherche : ce qui marche dans les jeux comparables

Synthèse des lectures faites avant la version 3 du cahier des charges, et décisions qui en découlent.

## 1. Références et constats

| Thème | Constat | Source |
|-------|---------|--------|
| Jeu le plus proche : *Ball Blast* (Voodoo) | Canon en bas qui se déplace à gauche/droite et tire droit vers le haut. Quatre améliorations seulement : pièces, cadence, puissance, gains hors ligne. Les cibles grossissent et durcissent avec la progression ; de rares cibles très rentables créent de la surprise. Au-delà d'un certain point, les améliorations semblent moins sensibles (rendements décroissants). | [LevelWinner – guide Ball Blast](https://www.levelwinner.com/ball-blast-voodoo-cheats-tips-tricks-drive-up-high-score/), [App Store](https://apps.apple.com/app/id1383187127) |
| Coûts exponentiels | Formule standard : coût = base × taux^(achats). Taux typiques de 1,07 (AdVenture Capitalist) à 1,15. Le coût finit toujours par dépasser la production : c'est ce qui crée le besoin d'une méta-progression (prestige) qui permet d'aller plus loin à chaque essai. Point de contrôle utile : le niveau où le coût dépasse le gain. | [The Math of Idle Games I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i), [III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii), [Idle Idol](https://gamedeveloper.com/design/balancing-tips-how-we-managed-math-on-idle-idol) |
| Hors ligne | Gain plafonné en durée et à taux réduit (≈ 50 %). | [Bugnet – Construct 3](https://bugnet.io/blog/how-to-make-a-clicker-idle-game-in-construct-3) |
| Vagues de shoot'em up | Chaque vague est un petit « puzzle » lisible ; commencer doux ; présenter un nouveau type d'ennemi à la fois puis les combiner ; varier les directions d'entrée ; formations (ligne, serpent…). | [Game Developer – shmups](https://www.gamedeveloper.com/design/designing-smart-meaningful-shmups), [Trowl – vagues](https://babel.speldesign.uu.se/?p=1013887), [5SD064](https://babel.speldesign.uu.se/?p=2053279) |
| *Galaxy Attack* | ≈ 3 vagues par niveau, boss qui arrivent ensuite, ennemis de plus en plus résistants, gemmes pour les bonus. | [Pocket Gamer](https://www.pocketgamer.com/galaxy-attack-alien-shooter/galaxy-attack-alien-shooter-tips-to-help-you-master-this-nostalgic-shooter/) |
| Jeux « hybrid-casual » | Niveaux courts (30 à 90 s), sessions courtes, jalons visibles (barre de progression), récompenses régulières mais pas trop généreuses. Une seconde chance contre un boss (pub récompensée « continuer ») est un moment naturel de monétisation. | [CrazyLabs](https://www.crazylabs.com/?p=20393), [Mobidictum](https://mobidictum.com/the-ultimate-guide-for-mobile-game-design/), [Kwalee](https://www.kwalee.com/blog/follow-these-3-simple-steps-make-enjoyable-hyper-casual-games), [GameAnalytics](https://www.gameanalytics.com/blog/hybrid-casual-higher-retention-better-engagement) |
| Roguelite (méta-progression) | Chaque échec doit faire avancer une progression permanente (motivation malgré la défaite, cf. *Rogue Legacy*) ; mais la méta ne doit pas écraser l'adresse. Les améliorations de partie permettent de « spécialiser » la partie. Débloquer les mécaniques petit à petit sert de tutoriel. | [Bugnet – méta-progression](https://bugnet.io/blog/how-to-design-a-roguelite-meta-progression), [GMTK](https://amara.org/videos/7doGHxwrhRpX/en/3100738) |

## 2. Décisions pour Casseur de forme

1. **Contrôle façon Ball Blast** : glisser pour déplacer le canon, tir automatique droit vers le haut. La visée automatique devient une **capacité** temporaire à recharge.
2. **Niveau court en deux temps** (30 à 90 s) : 3 à 5 **vagues** lisibles lancées par la forme (protégée par un bouclier), puis **phase boss** où la forme devient vulnérable, se déplace et attaque. Barre de progression des vagues toujours visible.
3. **Un nouvel ennemi présenté à la fois** (8 types débloqués entre les niveaux 1 et 40), puis combinés dans des **formations** (ligne, V, serpent, pluie, entrées latérales, éventail).
4. **Une nouvelle propriété de boss par palier** (blindage, bouclier, régénération, fragmentation, anneaux…) : la forme change tous les 10 niveaux et apprend une mécanique au joueur. Niveau 10 de chaque palier = **grand boss** (plus gros, plus de PV, récompense en gemmes).
5. **Courbe en dents de scie** : chaque grand boss est un pic, le palier suivant commence un peu plus doucement (le joueur a gagné des diamants).
6. **Économie** : coûts en ×1,15 à ×1,25 par achat pendant la partie (rendements décroissants), ×1,4 à ×1,6 pour l'atelier ; la difficulté monte plus vite que les améliorations de partie, l'**atelier** (diamants) fait franchir le mur suivant.
7. **Rareté qui surprend** : étoile dorée (gemme) et **boss doré** (2 %, ×10 pièces).
8. **Seconde chance** contre la défaite (pub « continuer » une fois par partie) et **doublement** des diamants de partie ou des gains hors ligne.
9. **Mondes de 50 niveaux** servant de points de reprise, avec pièces de départ pour ne pas repartir à vide.
10. **Hors ligne** plafonné (2 h, extensible à 8 h) à taux réduit, en diamants.
