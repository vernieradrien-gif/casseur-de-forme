# Casseur de forme (nom provisoire)

Jeu de tir hybride en portrait : en haut, une grande forme géométrique (le boss) tourne et lance des vagues d'ennemis ; en bas, ton canon tire et vise tout seul, mais tu peux le déplacer et/ou l'orienter pour esquiver et viser. Les pièces améliorent le canon pendant la partie ; les diamants et les gemmes le rendent plus fort pour toujours.

**Adresse de test (téléphone) : https://vernieradrien-gif.github.io/casseur-de-forme/**

- Ajouter `?reset` à l'adresse efface la sauvegarde : https://vernieradrien-gif.github.io/casseur-de-forme/?reset
- Le cahier des charges complet est dans [docs/cahier-des-charges.md](docs/cahier-des-charges.md) (source de vérité, version 2).

## État : jalon 2 (nouveau cœur)

- Boss (forme différente à chaque palier de 10 niveaux) qui lance des vagues d'ennemis de plus en plus fréquentes et nombreuses.
- 4 ennemis : Éclat (fonce droit), Bloc (lent, résistant, gros dégâts), Chasseur (suit le canon), Rare (étoile dorée qui zigzague : **1 gemme**).
- Canon avec barre de vie ; tir et visée automatiques (ennemi le plus proche, sinon le boss).
- 3 modes de contrôle au choix dans **Pause > Paramètres** : glisser + visée auto (par défaut), glisser + visée au doigt, canon fixe + visée au doigt.
- Pièces (ennemis et boss) → améliorations de partie : Dégâts, Cadence, Blindage (achat x1 / x10 / x100 / Max).
- Boss vaincu → diamants (bonus au premier passage), soin partiel du canon, niveau suivant.
- Défaite → retour au niveau 1 ; diamants, gemmes, atelier et capacités sont conservés.
- **Atelier** (diamants) : Dégâts, Cadence, PV de base, Gain de pièces.
- **Capacités** (gemmes) : Bouclier (bouton), Tir double (passif), Onde de choc (bouton).
- Sauvegarde v2 (migration depuis la v1), reprise au début du niveau en cours ; vibration désactivable.

## Commandes (pour développer)

```
npm install
npm run dev      # serveur local
npm test         # tests unitaires (Vitest)
npm run sim      # simulation d'équilibrage sans rendu (joueurs automatiques)
npm run build    # vérification TypeScript + construction dans dist/
```

Chaque push sur `main` construit le jeu et le publie sur GitHub Pages (`.github/workflows/deploy.yml`). Sur une pull request, le workflow lance seulement les tests et la construction.

## Décisions prises

### Jalon 2
- **Terrain fixe** de 1 × 1,6 unités (portrait) mis à l'échelle de l'écran : la simulation est identique sur tous les téléphones.
- **Glisser relatif** (mode par défaut) : on glisse n'importe où, le canon suit le mouvement du doigt (×1,4) sans que le doigt le cache.
- **Visée auto** : l'ennemi le plus bas (donc le plus menaçant), sinon le boss. En visée au doigt, on revient à la visée auto dès qu'on lâche l'écran.
- **Fin de niveau** : les ennemis restants explosent et rapportent leurs pièces ; le canon récupère 35 % de ses PV max.
- **Diamants par boss** : 1, +1 tous les 5 niveaux, +2 la première fois qu'on bat ce niveau. **Gemmes** : ennemi rare (1 % des ennemis à partir du niveau 3) et +3 au premier passage de chaque niveau multiple de 10. Succès, objectif quotidien et pubs donneront aussi des gemmes plus tard.
- **Équilibrage** (simulation `npm run sim`) : une première partie sans atelier atteint le niveau 4 à 9 ; après une heure de jeu (en dépensant tout à l'atelier), on atteint environ le niveau 30. Tout est réglable dans `src/config/balance.json`.
- **Améliorations de partie** : effet composé (×1,12 par niveau pour les dégâts) et coût ×1,22 par achat : elles suivent moins vite que la difficulté, c'est l'atelier qui permet d'aller plus loin.
- **Ancienne sauvegarde v1** : convertie automatiquement ; la partie repart au niveau 1 (l'ancien jeu n'a pas d'équivalent), le meilleur niveau est gardé.
- **Mondes-points de reprise** (≥ 50 niveaux) : prévus au jalon 3, pas encore codés.
- Le hasard de la simulation utilise une graine : les tests sont reproductibles.

### Jalon 1
- **Grands nombres** : `number` JavaScript (précis jusqu'à ~1e308), mais tout passe par `src/game/bignum.ts`.
- **Formatage** : une décimale tronquée (999 999 → « 999,9 K »), virgule française, suffixes K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc, puis notation scientifique.
- **Interface en HTML/CSS** par-dessus le canvas (boutons d'au moins 56 px) ; le canvas ne dessine que le jeu.
- **Simulation à pas fixe** (60 mises à jour/s) séparée du rendu, avec interpolation pour les écrans 90/120 Hz.
- **Publicités** : seule l'interface `src/ads/` et sa version factice existent (AdMob plus tard).
- Une branche `main` initiale a été créée pour servir de base aux pull requests, le dépôt étant vide.
