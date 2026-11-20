# Faire connaître Prisma Blast — kit de promotion

Tout ce qu'il faut pour amener des joueurs sans budget. Textes prêts à copier ; le lien du jeu est
`https://play.google.com/store/apps/details?id=io.github.vernieradrien.prismablast` (actif une fois le jeu en
production).

## 0. Ce qui est prêt dans le dépôt

| Quoi | Où | Commande |
|------|----|----------|
| Fiche réécrite (titre, descriptions, nouveautés) en 6 langues | [fiche-google-play.md](fiche-google-play.md) | — |
| 7 captures avec phrase d'accroche + image de présentation, par langue (en, fr, es, pt, de, it) | `store-assets/promo/<langue>/` | `npm run store` puis `npm run store:promo` |
| Vidéo de gameplay portrait 720 × 1280, ~45 s, sans son (anglais et français) | `store-assets/promo/video-en.webm`, `video-fr.webm` | `npm run store:video` |
| Demande d'avis Google Play dans le jeu (après une victoire contre un boss, dès le niveau 8, 3 fois au plus, espacées de 45 jours) | `src/review.ts`, `InAppReviewPlugin.java` | réglages dans `balance.json` › `review` |

## 1. Dans la Play Console (gratuit, le plus rentable)

1. **Fiche principale** : coller les textes anglais, puis *Gérer les traductions* › français, espagnol (es-ES et
   es-419), portugais (pt-BR), allemand, italien. Chaque langue = une fiche de plus dans la recherche.
2. **Images** : pour chaque langue, les 7 captures de `store-assets/promo/<langue>/` **dans l'ordre** (les 2
   premières sont les plus vues) et l'image de présentation de la même langue.
3. **Vidéo** : mettre `video-en.webm` sur YouTube (« Non répertoriée » suffit), coller le lien dans *Vidéo
   promotionnelle*. La vidéo s'affiche en haut de la fiche et augmente le taux d'installation.
4. **Tags** : Arcade, Shoot'em up, Hors ligne, Solo, Stylisé.
5. **Expériences sur la fiche** (*Croissance › Expériences sur la fiche Play Store*) : tester l'image de présentation
   actuelle contre une variante, ou l'ordre des captures, sur 50 % des visiteurs pendant 2 à 3 semaines. Garder ce
   qui convertit le mieux.
6. **Contenus promotionnels** (*Croissance › Contenus promotionnels*, disponibles après les premières installations) :
   déclarer chaque grosse mise à jour comme un événement (« Nouvelle mise à jour : … »). Il apparaît sur la fiche et
   dans l'onglet Jeux.
7. **Signaux techniques** (*Qualité › Android Vitals*) : garder les plantages sous 1,09 % et les blocages (ANR) sous
   0,47 % ; au-delà, Google montre moins le jeu.
8. **Répondre aux avis** (*Qualité › Notes et avis*), même aux mauvais, en restant court et poli.

## 2. Vidéos courtes (TikTok, YouTube Shorts, Instagram Reels)

Le canal gratuit le plus efficace pour un jeu mobile. La vidéo `video-fr.webm` / `video-en.webm` est prête
(TikTok et YouTube acceptent le WebM ; pour Instagram, la convertir en MP4 avec un convertisseur en ligne ou
l'éditeur CapCut). **Ajouter une musique tendance dans l'éditeur de l'appli** : les vidéos avec un son populaire
sont bien plus montrées.

Idées de vidéos suivantes (filmer l'écran du téléphone, 10 à 20 s chacune) : la destruction d'un super boss, « le
niveau 1 contre le niveau 150 », un canon légendaire débloqué, « j'ai codé ce jeu tout seul ».
**Rythme** : 3 vidéos par semaine pendant un mois ; c'est la régularité qui fait décoller un compte.

**Texte (français)** :
> Un seul doigt, des boss géants à briser 💥 Mon jeu de tir arcade néon est sur Google Play : Prisma Blast !
> #jeumobile #jeuandroid #indiegame #arcade #shootemup #gamedev #neon

**Text (English)**:
> One finger vs giant neon bosses 💥 My arcade shooter Prisma Blast is out on Google Play!
> #mobilegame #androidgame #indiegame #arcade #shmup #gamedev #neon

## 3. Reddit

Toujours **lire les règles** du sous-forum avant de poster (certains n'autorisent l'autopromotion que certains
jours, ou demandent une étiquette « Self-promotion »), se présenter comme le développeur, et répondre à tous les
commentaires. Un post par sous-forum, pas de copier-coller le même jour partout.

Où : r/AndroidGaming, r/playmygame, r/IndieGaming, r/indiegames, r/shmups (si le jeu leur plaît), r/gamedev
(plutôt un retour d'expérience : « comment j'ai fait un jeu sans aucune image »), r/jeuxvideo (en français).

**Titre** : I made a one-finger neon arcade shooter where giant shapes turn into bosses — feedback welcome!

**Message** :
> Hi! I'm a solo developer and I just released **Prisma Blast** on Android.
>
> You slide your finger, your cannon follows and fires on its own. At the top of the screen a giant shape sends
> waves of enemies, then its shield drops and it becomes the boss. Every 10 levels there's a block-built super
> boss, every 50 a titan.
>
> - 250 levels in 5 worlds, 11 cannons, secret weapons at the end of each world
> - everything is drawn in code (no image files) and the music is synthesized in code too
> - ads are optional: a video only plays if you choose a bonus
>
> I'd love feedback on the difficulty curve and the first 5 minutes.
> Google Play: [lien]
>
> (GIF ou vidéo en pièce jointe)

**Retour d'expérience pour r/gamedev** : « I built a mobile game with zero image files: everything is drawn with
Canvas 2D and the music is synthesized with Web Audio » — expliquer en quelques paragraphes comment, avec 2 ou 3
captures. Ce genre de post amène des curieux et des développeurs qui partagent.

## 4. Sites et chaînes de jeux mobiles

Envoyer un court e-mail à des sites, blogs et chaînes YouTube de jeux mobiles indépendants (ils reçoivent beaucoup
de messages : rester bref, mettre la vidéo et le lien).

**Objet** : Prisma Blast — a one-finger neon arcade shooter (Android, solo dev)

> Hello,
>
> I'm [prénom], a solo developer from France. I've just released Prisma Blast on Google Play: a neon arcade shooter
> played with one finger, where giant geometric shapes send waves of enemies before turning into bosses.
>
> 250 levels, 5 worlds, 11 cannons, block-built super bosses and titans, optional rewarded ads only.
> Everything (graphics and music) is generated in code.
>
> Trailer: [lien YouTube]
> Google Play: [lien]
> Press images: [lien vers un dossier partagé avec store-assets/promo/en]
>
> Thanks for your time, and happy to answer any question!
> [prénom] — avapps.support@gmail.com

## 5. Plan des 4 premières semaines après la mise en production

| Semaine | Actions |
|---------|---------|
| 1 | Fiche complète en 6 langues + vidéo YouTube. Message aux testeurs : « le jeu est sorti, un avis sur la fiche m'aiderait beaucoup ». 3 vidéos courtes. |
| 2 | Posts Reddit (2 ou 3 sous-forums différents). 3 vidéos courtes. Lancer une expérience sur la fiche (image de présentation). |
| 3 | E-mails à 10 sites ou chaînes. 3 vidéos courtes. Répondre à tous les avis. |
| 4 | Bilan dans la Play Console (*Statistiques › Acquisition* : d'où viennent les installations, taux de conversion de la fiche). Garder ce qui marche, déclarer la prochaine mise à jour en contenu promotionnel. |

## 6. Plus tard (demande des identifiants à créer dans la Play Console)

- **Succès et classement Google Play Jeux** : créer dans *Play Games Services › Succès* une dizaine de succès
  (premier boss, premier super boss, chaque monde terminé, canon légendaire…) et un classement « Meilleur niveau ».
  Donner les identifiants à Claude : il les branche sur les succès du jeu. Le jeu devient visible dans l'appli Play
  Jeux et sur le profil des joueurs.
- **Notification de rappel** (« ton boost est prêt », « tes diamants hors ligne t'attendent ») : augmente le retour
  des joueurs, mais demande une autorisation de notifications (Android 13+) ; à ajouter si la rétention à 7 jours
  est faible.
