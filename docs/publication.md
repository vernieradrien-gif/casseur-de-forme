# Publier Prisma Blast sur Google Play — check-list

Le propriétaire a déjà un compte développeur Google Play (une application publiée). Cette liste dit **ce qui reste à
faire avant la publication**, qui doit le faire, et dans quel ordre. Les cases `[x]` sont déjà faites.

## 0. Déjà prêt

- [x] Projet Android (Capacitor) : nom du package (à renseigner sur Google Play) `io.github.vernieradrien.prismablast`, portrait, plein écran, icône
  tracée en code, vibration, bouton retour, **cible Android 16 (API 36)**, exigée pour les nouvelles applications
  depuis le 31 août 2026.
- [x] `versionCode` qui augmente à chaque construction (numéro de construction GitHub Actions).
- [x] Publicités : **uniquement des vidéos récompensées que le joueur demande** (aucune pub automatique),
  consentement RGPD Google UMP demandé **avant** de démarrer le SDK publicitaire, bouton « Consentement publicités »
  dans les paramètres là où la loi l'exige, contenu limité à « PG ». Identifiants AdMob **de test** pour l'instant.
- [x] Politique de confidentialité en français et en anglais :
  <https://vernieradrien-gif.github.io/casseur-de-forme/privacy.html>
- [x] Sauvegarde Google (Google Play Jeux) : code prêt (synchronisation automatique, seul moyen de transférer sa
  progression), section cachée tant que le projet Play Jeux n'est pas configuré.
- [x] Icône 512 × 512 : `public/icon-512.png`.

> L'APK de test est signé avec une **clé de test** publique (`android/app/casseur-test.keystore`). Elle ne doit
> **jamais** servir pour Google Play.

## 1. À faire par toi (compte, clés, formulaires)

### 1.1 Créer l'application dans la Play Console
- [ ] *Toutes les applications › Créer une application* : nom « Prisma Blast », langue par défaut **anglais
  (États-Unis)**, **Jeu**, **Gratuit**, accepter les déclarations. Nom du package (envoyé avec le premier AAB, définitif) :
  `io.github.vernieradrien.prismablast`.
- [ ] *Fiche Play Store › Gérer les traductions* : ajouter **français (France)**. Google montre la fiche française aux
  téléphones en français et la fiche anglaise à tous les autres (le jeu suit déjà la langue du téléphone).
- [ ] **Test fermé obligatoire ?** Si ton compte est un compte **personnel créé après le 13 novembre 2023**, Google
  demande un test fermé avec **au moins 12 testeurs pendant 14 jours d'affilée** avant d'ouvrir la production. La
  page d'aide de Google parle du test « de leur application » : compte sur ce test pour cette nouvelle appli aussi.
  Le tableau de bord de l'application l'indique (« Tester votre application auprès de 12 testeurs »). Les comptes
  **organisation** et les comptes plus anciens n'ont pas cette étape.

### 1.2 Clé d'envoi (privée)
- [x] Clé d'envoi créée sur le PC, **hors du dépôt** : `Documents\PrismaBlast-cle-envoi\` (`prismablast-upload.jks`,
  alias `upload`, mot de passe dans `LISEZMOI-identifiants.txt`).
- [ ] En faire une **copie de sauvegarde** (gestionnaire de mots de passe, clé USB ou Drive privé).
- [ ] Garder la **signature d'application par Google Play** (proposée par défaut). Si la clé d'envoi est perdue,
  Google peut la réinitialiser.
- [x] AAB signé construit sur le PC : `JAVA_HOME` = JDK d'Android Studio, variables `UPLOAD_KEYSTORE_FILE`,
  `UPLOAD_KEYSTORE_PASSWORD`, `UPLOAD_KEY_ALIAS`, puis `npx cap sync android` et `gradlew bundleRelease` dans `android/`
  (sans ces variables, la clé de test est utilisée). Premier envoi : `versionCode` **100** ; chaque nouvel AAB doit avoir
  un numéro plus grand (`VERSION_CODE`).
- [ ] Facultatif : construire l'AAB sur GitHub Actions avec 4 secrets (`UPLOAD_KEYSTORE_BASE64`, `UPLOAD_KEYSTORE_PASSWORD`,
  `UPLOAD_KEY_ALIAS`, `UPLOAD_KEY_PASSWORD`) et un `versionCode` = 100 + numéro de construction.

### 1.3 AdMob (vraies publicités)
- [ ] Dans AdMob : *Applications › Ajouter* (Android, pas encore publiée), puis **un seul bloc d'annonces « Avec
  récompense »** (plus besoin d'interstitiel).
- [ ] Donner à Claude l'**ID d'application** (`ca-app-pub-…~…`) et l'**ID du bloc récompensé** (`ca-app-pub-…/…`) :
  ce ne sont pas des secrets. Claude les met dans le code et coupe le mode test.
- [ ] *Confidentialité et messages* › **RGPD** : créer et publier le message de consentement (EEE, Royaume-Uni,
  Suisse). **Sans ce message, aucune pub ne s'affichera en Europe.**
- [ ] *Confidentialité et messages* › **Réglementations des États américains** : créer le message (recommandé).
- [ ] Pendant les tests : déclarer ton téléphone comme **appareil de test** et ne jamais cliquer sur tes propres pubs.
- [ ] Facultatif mais conseillé : `app-ads.txt` à la racine du site web indiqué sur la fiche Play (Claude peut le
  publier sur GitHub Pages si tu crées un dépôt `vernieradrien-gif.github.io`).

### 1.4 Fiche Google Play
- [ ] Textes : voir [fiche-google-play.md](fiche-google-play.md) (titre, description courte, description longue en
  français et en anglais, prêts à copier).
- [ ] Catégorie **Jeux › Arcade**, adresse e-mail de contact, URL de la politique de confidentialité.
- [ ] **Icône 512 × 512** : `public/icon-512.png`. **Image de présentation 1024 × 500** et **7 captures de téléphone
  1080 × 1920** (9:16, assez pour que l'appli puisse être mise en avant) : `store-assets/en/` pour la fiche anglaise,
  `store-assets/fr/` pour la fiche française. Tirées du vrai jeu par `npm run store`.

### 1.5 Contenu de l'application (formulaires obligatoires)
- [ ] **Politique de confidentialité** : l'URL ci-dessus. Le moyen de contact demandé par Google y figure
  (avapps.support@gmail.com, en français et en anglais), ainsi que le public visé (13 ans et plus).
- [ ] **Annonces** : « Oui, l'application contient des annonces ».
- [ ] **Accès à l'application** : toutes les fonctionnalités sont accessibles sans identifiants.
- [ ] **Classification du contenu** (questionnaire IARC) : jeu, violence fantastique légère (formes géométriques
  détruites), pas de sang, pas d'achat, pas de discussion entre joueurs, publicités.
- [ ] **Public cible** : **13 ans et plus** (ne pas cocher les tranches « enfants », sinon le programme Familles
  impose des règles publicitaires plus strictes).
- [ ] **Sécurité des données** (le jeu ne collecte rien lui-même ; AdMob, et Google Play Jeux s'il est activé) :
  - Collectées et partagées : *Identifiants de l'appareil ou autres* (identifiant publicitaire), *Position
    approximative* (déduite de l'adresse IP), *Activité dans l'application › Interactions*, *Infos sur l'appli et
    performances › Diagnostics*. Finalités : **Publicité ou marketing**, Analyse (côté Google).
  - Chiffrées en transit : **Oui**. Suppression sur demande : pas de compte dans le jeu (l'identifiant publicitaire
    se réinitialise dans les réglages Android).
  - Sauvegarde Google : *Activité dans l'application › Autres contenus générés par l'utilisateur*
    (progression), **facultatif** (seulement si le joueur est connecté à Play Jeux), stockée par Google Play Jeux.
- [ ] **Identifiant publicitaire** : « Oui », pour la publicité.
- [ ] Applis gouvernementales, fonctionnalités financières, santé, actualités : **Non**.

### 1.6 Sauvegarde Google (nécessaire : seul moyen de transférer sa progression)
- [x] Play Console › l'application › *Croissance › Play Games Services › Configuration* : créer le projet Play Jeux.
- [ ] *Propriétés* : activer **Jeux sauvegardés**.
- [ ] *Identifiants* › Android : paquet `io.github.vernieradrien.prismablast` + **SHA-1 de la clé de signature
  d'application** (Play Console › *Intégrité de l'application*), et celui de la clé d'envoi pour tester.
- [x] Donner à Claude l'**ID du projet** Play Jeux (`387852057089`, projet Cloud « Prisma Blast ») : il l'ajoute dans
  `android/app/src/main/res/values/strings.xml` et la synchronisation se met en marche.
- [ ] *Testeurs* : ajouter tes comptes de test, puis **publier** la configuration Play Jeux avec l'application.

### 1.6 bis Trouver 12 testeurs (test fermé)
- **La règle** : au moins 12 testeurs **inscrits** au test fermé pendant **14 jours d'affilée**. Si le nombre retombe sous
  12, le compteur repart de zéro : vise **15 à 20 testeurs** pour garder de la marge.
- **Comment faire en pratique** :
  1. Play Console › *Tests › Test fermé* : créer la piste, y envoyer l'AAB, puis dans *Testeurs* ajouter une **liste
     d'e-mails** ou un **groupe Google** (le plus simple : créer un groupe sur groups.google.com et y inviter les gens).
  2. Copier le **lien d'inscription** du test et l'envoyer : chaque testeur l'ouvre avec son compte Google, accepte, puis
     installe le jeu depuis le Play Store. Il doit **rester inscrit** 14 jours ; ouvrir le jeu de temps en temps aide.
  3. Recueillir les avis (un Formulaire Google suffit) : Google demande ensuite comment le test s'est passé et ce qui a
     été corrigé, au moment de la demande d'accès à la production.
- **Où trouver des testeurs** :
  - **L'entourage** : famille, amis, collègues, club… Il faut un téléphone Android et un compte Google. C'est la
    méthode la plus sûre.
  - **Échanges entre développeurs** (« je teste ton appli, tu testes la mienne ») : sous-forums Reddit et serveurs
    Discord de développeurs indépendants consacrés aux tests fermés Google Play. C'est gratuit mais demande de tester
    les applis des autres en retour pendant 14 jours.
  - **Réseaux sociaux** : un message « cherche testeurs pour mon jeu mobile » avec une capture et le lien d'inscription.
  - **Services payants** (sites de petites annonces de freelances) : ils existent, mais Google attend de vrais testeurs
    engagés et ces services ne garantissent pas l'accès à la production ; à éviter si possible.
- **Les entreprises** ont des équipes de test, des communautés (Discord, bêta ouverte) et, surtout, des **comptes
  « organisation »**, qui ne sont pas soumis à cette règle des 12 testeurs (il faut un numéro D-U-N-S d'entreprise).

### 1.7 Mise en ligne
- [ ] Envoyer l'AAB dans le **test fermé** (ou le test interne d'abord), inviter les testeurs (liste d'e-mails ou
  groupe Google), attendre 14 jours si ton compte est concerné (§ 1.1).
- [ ] Corriger les retours, puis *Production* : déploiement progressif (par exemple 20 % puis 100 %).

## 2. À faire par Claude (dès que tu lui donnes les éléments)

| Quand | Ce que Claude fait |
|-------|--------------------|
| Secrets de la clé d'envoi ajoutés sur GitHub | Workflow qui produit l'AAB signé à chaque version |
| IDs AdMob reçus | Vrais identifiants dans le code, mode test coupé, nouvel AAB |
| ID Play Jeux reçu | Sauvegarde Google activée, nouvel AAB |

## 3. Vérifications finales (avant d'envoyer en production)

- [ ] Sur un vrai téléphone, en Europe : le formulaire de consentement s'affiche au premier lancement, et
  *Paramètres › Consentement publicités* le rouvre.
- [ ] Une vidéo récompensée (boost, continuer, doubler) s'affiche, donne la récompense et coupe la musique.
- [ ] Aucune pub ne s'affiche toute seule.
- [ ] Mise à jour par-dessus une ancienne version : la progression est conservée.
