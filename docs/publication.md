# Publier Casseur de forme sur Google Play

Ce guide liste ce que **le propriétaire** doit faire lui-même (comptes, clés privées, formulaires) :
ces étapes demandent une identité, un paiement ou des secrets qui ne doivent pas être dans le dépôt.

## 0. Ce qui est déjà prêt

- Projet Android (`android/`, Capacitor) : identifiant `io.github.vernieradrien.casseurdeforme`, portrait, plein écran,
  icône tracée en code, permission vibration, bouton retour géré.
- APK de test construit par GitHub Actions et publié dans la release `android-latest` :
  <https://github.com/vernieradrien-gif/casseur-de-forme/releases/download/android-latest/casseur-de-forme.apk>
- Publicités AdMob avec les **identifiants de test de Google** et consentement RGPD (UMP).
- Sauvegarde Google (Google Play Jeux, « Jeux sauvegardés ») : le code est prêt, il ne manque que l'identifiant du
  projet Play Jeux (voir § 3 bis). Tant qu'il est vide, l'option affiche « Pas encore active dans cette version de test ».
- Politique de confidentialité : <https://vernieradrien-gif.github.io/casseur-de-forme/privacy.html>

> L'APK actuel est signé avec une **clé de test** commitée (`android/app/casseur-test.keystore`, mot de passe
> `casseur-test`). Elle sert uniquement à installer le jeu sur un téléphone. **Ne jamais l'utiliser pour Google Play** :
> tout le monde peut la lire.

## 1. Comptes

1. **Google Play Console** : <https://play.google.com/console> (inscription unique de 25 $, vérification d'identité).
2. **AdMob** : <https://admob.google.com> (gratuit), à relier au même compte Google.

## 2. Clé de publication (privée)

Sur le PC, avec le JDK d'Android Studio :

```
"C:\Program Files\Android\Android Studio\jbr\bin\keytool" -genkeypair -v -keystore casseur-upload.jks -storetype PKCS12 -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

- Garder `casseur-upload.jks` et son mot de passe **hors du dépôt** (gestionnaire de mots de passe + sauvegarde).
- Activer la « signature d'application par Google Play » (proposée à la création de l'application) : Google garde la clé
  finale, la clé ci-dessus ne sert qu'à envoyer les mises à jour.
- Pour construire avec GitHub Actions : ajouter les secrets du dépôt (`UPLOAD_KEYSTORE_BASE64`, `UPLOAD_KEYSTORE_PASSWORD`,
  `UPLOAD_KEY_ALIAS`, `UPLOAD_KEY_PASSWORD`) et adapter `android/app/build.gradle` (bloc `signingConfigs`) pour les lire
  depuis l'environnement. Claude peut faire cette adaptation sur demande, sans jamais voir les secrets.
- Google Play demande un **AAB** (pas un APK) : `cd android && ./gradlew bundleRelease`
  → `android/app/build/outputs/bundle/release/app-release.aab`.

## 3. Vraies publicités AdMob

1. Dans AdMob : *Applications › Ajouter* (Android, « pas encore publiée »), puis créer deux blocs d'annonces :
   **Avec récompense** et **Interstitiel**.
2. Remplacer les identifiants de test :
   - `android/app/src/main/AndroidManifest.xml` : `com.google.android.gms.ads.APPLICATION_ID` (identifiant d'application `ca-app-pub-…~…`) ;
   - `src/ads/admob.ts` : `ADMOB_TEST_IDS.rewarded` et `ADMOB_TEST_IDS.interstitial` (`ca-app-pub-…/…`),
     puis passer `initializeForTesting` et `isTesting` à `false`.
3. *Confidentialité et messages* : créer le **message RGPD** (consentement UMP) pour l'Espace économique européen et le
   Royaume-Uni ; le jeu l'affiche déjà automatiquement.
4. Pendant les tests, ajouter son téléphone comme **appareil de test** dans AdMob (ne jamais cliquer sur ses propres pubs).
5. Optionnel : `app-ads.txt` sur un site web personnel (AdMob explique le contenu).

## 3 bis. Sauvegarde Google (Google Play Jeux)

Pour que les joueurs retrouvent leur progression sur un autre téléphone avec leur compte Google :

1. Play Console › l'application › *Croissance › Play Games Services › Configuration et gestion › Configuration* :
   « Oui, mon jeu utilise déjà des API Google » si un projet Google Cloud existe, sinon créer le projet proposé.
2. *Propriétés* : activer **Jeux sauvegardés** (Saved Games).
3. *Identifiants* › *Ajouter des identifiants* › type **Android** : nom du paquet `io.github.vernieradrien.casseurdeforme`
   et l'empreinte **SHA-1** de la clé de signature (Play Console › *Intégrité de l'application* › *Signature de
   l'application* : copier le SHA-1 de la « clé de signature d'application »). Pour tester un APK signé par la clé
   d'envoi, ajouter aussi un identifiant avec le SHA-1 de cette clé.
4. Copier l'**ID du projet** Play Jeux (un nombre d'une douzaine de chiffres, affiché en haut de la page Configuration)
   dans `android/app/src/main/res/values/strings.xml` : `<string name="game_services_project_id" …>123456789012</string>`
   (Claude peut le faire sur demande).
5. *Testeurs* : ajouter les comptes Google des testeurs tant que la configuration n'est pas publiée, puis
   **Publier** la configuration Play Jeux avec l'application.
6. Formulaire *Sécurité des données* : ajouter « Activité dans les applications › Autres contenus générés par
   l'utilisateur / progression de jeu », stockée via Google Play Jeux, facultative.

## 4. Fiche Google Play

- Nom : « Casseur de forme » ; description courte (80 caractères) et longue (français, anglais).
- Icône 512 × 512 : `public/icon-512.png` ; image de présentation 1024 × 500 à créer ; au moins 2 captures d'écran
  (les tests `npm run e2e` en produisent dans `test-results/screens/`).
- Catégorie : Jeux › Action (ou Arcade). Coordonnées : une adresse e-mail de contact.
- URL de la politique de confidentialité : <https://vernieradrien-gif.github.io/casseur-de-forme/privacy.html>

## 5. Formulaires obligatoires (Play Console › Contenu de l'application)

- **Publicités** : « Oui, l'application contient des annonces ».
- **Classification du contenu** (questionnaire IARC) : violence fantastique légère (formes géométriques).
- **Public cible** : 13 ans et plus (éviter « enfants » : sinon règles « Familles » et SDK publicitaires certifiés).
- **Sécurité des données** : le jeu ne collecte rien lui-même (la sauvegarde Google est facultative, voir § 3 bis) ; AdMob collecte l'identifiant publicitaire, l'adresse IP
  approximative et des données d'interaction avec les annonces (partagées à des fins publicitaires, chiffrées en transit,
  pas de suppression sur demande car pas de compte).
- **Identifiant publicitaire** : « Oui » (utilisé par AdMob).

## 6. Tests puis production

1. Créer un **test fermé** et y envoyer l'AAB.
2. Comptes personnels récents : **12 testeurs au minimum pendant 14 jours** avant de pouvoir demander l'accès à la production.
3. Corriger les éventuels retours, puis demander l'accès à la production et publier.
4. À chaque mise à jour, `versionCode` doit augmenter (GitHub Actions utilise déjà le numéro de construction).
