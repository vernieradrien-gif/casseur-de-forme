# Publier Prisma Blast sur Google Play — check-list

Le propriétaire a déjà un compte développeur Google Play (une application publiée). Cette liste dit **ce qui reste à
faire avant la publication**, qui doit le faire, et dans quel ordre. Les cases `[x]` sont déjà faites.

## 0. Déjà prêt

- [x] Projet Android (Capacitor) : identifiant `io.github.vernieradrien.casseurdeforme`, portrait, plein écran, icône
  tracée en code, vibration, bouton retour, **cible Android 16 (API 36)**, exigée pour les nouvelles applications
  depuis le 31 août 2026.
- [x] `versionCode` qui augmente à chaque construction (numéro de construction GitHub Actions).
- [x] Publicités : **uniquement des vidéos récompensées que le joueur demande** (aucune pub automatique),
  consentement RGPD Google UMP demandé **avant** de démarrer le SDK publicitaire, bouton « Consentement publicités »
  dans les paramètres là où la loi l'exige, contenu limité à « PG ». Identifiants AdMob **de test** pour l'instant.
- [x] Politique de confidentialité en français et en anglais :
  <https://vernieradrien-gif.github.io/casseur-de-forme/privacy.html>
- [x] Sauvegarde Google (Google Play Jeux) : code prêt, option cachée tant que le projet Play Jeux n'est pas configuré.
- [x] Icône 512 × 512 : `public/icon-512.png`.

> L'APK de test est signé avec une **clé de test** publique (`android/app/casseur-test.keystore`). Elle ne doit
> **jamais** servir pour Google Play.

## 1. À faire par toi (compte, clés, formulaires)

### 1.1 Créer l'application dans la Play Console
- [ ] *Toutes les applications › Créer une application* : nom « Prisma Blast », langue par défaut français,
  **Jeu**, **Gratuit**, accepter les déclarations.
- [ ] **Test fermé obligatoire ?** Si ton compte est un compte **personnel créé après le 13 novembre 2023**, Google
  demande un test fermé avec **au moins 12 testeurs pendant 14 jours d'affilée** avant d'ouvrir la production. La
  page d'aide de Google parle du test « de leur application » : compte sur ce test pour cette nouvelle appli aussi.
  Le tableau de bord de l'application l'indique (« Tester votre application auprès de 12 testeurs »). Les comptes
  **organisation** et les comptes plus anciens n'ont pas cette étape.

### 1.2 Clé d'envoi (privée)
- [ ] Créer une clé d'envoi (sur le PC, avec le JDK d'Android Studio), ou réutiliser celle de ton autre application
  (Google l'accepte, une clé par appli reste plus prudent) :
  ```
  "C:\Program Files\Android\Android Studio\jbr\bin\keytool" -genkeypair -v -keystore casseur-upload.jks -storetype PKCS12 -alias upload -keyalg RSA -keysize 2048 -validity 10000
  ```
- [ ] La garder **hors du dépôt** (gestionnaire de mots de passe + copie de sauvegarde).
- [ ] Garder la **signature d'application par Google Play** (proposée par défaut). Si la clé d'envoi est perdue,
  Google peut la réinitialiser.
- [ ] Ajouter 4 secrets au dépôt GitHub (*Settings › Secrets and variables › Actions*) : `UPLOAD_KEYSTORE_BASE64`
  (le fichier .jks en base64), `UPLOAD_KEYSTORE_PASSWORD`, `UPLOAD_KEY_ALIAS` (`upload`), `UPLOAD_KEY_PASSWORD`.
  Claude adapte alors le workflow pour produire l'**AAB signé** (format exigé par Google Play), sans jamais voir les
  secrets.

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
- [ ] **Image de présentation 1024 × 500** (obligatoire) et **au moins 2 captures d'écran** de téléphone. Les tests
  `npm run e2e` en produisent dans `test-results/screens/` ; des captures prises sur ton téléphone sont encore mieux.
  Claude peut générer l'image de présentation en code si tu le demandes.

### 1.5 Contenu de l'application (formulaires obligatoires)
- [ ] **Politique de confidentialité** : l'URL ci-dessus. Google demande un moyen de contact : la page renvoie vers
  la page du projet ; donne une adresse e-mail à Claude pour l'y ajouter si tu préfères.
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
  - Si la sauvegarde Google est activée : *Activité dans l'application › Autres contenus générés par l'utilisateur*
    (progression), **facultatif**, stockée par Google Play Jeux.
- [ ] **Identifiant publicitaire** : « Oui », pour la publicité.
- [ ] Applis gouvernementales, fonctionnalités financières, santé, actualités : **Non**.

### 1.6 Sauvegarde Google (facultatif)
- [ ] Play Console › l'application › *Croissance › Play Games Services › Configuration* : créer le projet Play Jeux.
- [ ] *Propriétés* : activer **Jeux sauvegardés**.
- [ ] *Identifiants* › Android : paquet `io.github.vernieradrien.casseurdeforme` + **SHA-1 de la clé de signature
  d'application** (Play Console › *Intégrité de l'application*), et celui de la clé d'envoi pour tester.
- [ ] Donner à Claude l'**ID du projet** Play Jeux (une douzaine de chiffres) : il l'ajoute dans
  `android/app/src/main/res/values/strings.xml` et l'option apparaît dans les paramètres.
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
| Adresse e-mail de contact reçue (facultatif) | Ajout dans la politique de confidentialité |
| Sur demande | Image de présentation 1024 × 500 générée en code, captures d'écran au bon format |

## 3. Vérifications finales (avant d'envoyer en production)

- [ ] Sur un vrai téléphone, en Europe : le formulaire de consentement s'affiche au premier lancement, et
  *Paramètres › Consentement publicités* le rouvre.
- [ ] Une vidéo récompensée (boost, continuer, doubler) s'affiche, donne la récompense et coupe la musique.
- [ ] Aucune pub ne s'affiche toute seule.
- [ ] Mise à jour par-dessus une ancienne version : la progression est conservée.
