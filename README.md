# Foulée

Ton programme de course à pied, séance par séance. Une appli web installable (iPhone et Android), hébergée sur GitHub Pages : https://pixelcatchoff-rgb.github.io/foulee/

## Ce que fait la version 2.0

- **Aujourd’hui** : la prochaine séance, le couloir de progression du programme, la régularité et le compte à rebours.
- **Programme** : les semaines en 3 phases (base, vitesse, spécifique), séances à cocher, compte rendu de chaque séance (durée, distance, ressenti, note) et marche à suivre pour la programmer sur l’Apple Watch.
- **Questionnaire de départ** : objectif, distance, pratique actuelle, plus longue sortie, ancienneté, chrono récent, blessures, âge, disponibilités, dates. Il en déduit le niveau (débutant complet à expert), les allures personnelles et un chrono conseillé, puis construit le programme.
- **Programme adaptatif** : chaque test saisi recalcule les allures des séances à venir.
- **Analyse** : import de l’archive Strava (`activities.csv`), rattachement automatique aux séances, kilomètres par semaine, allure et fréquence cardiaque de chaque sortie, tests et dernières sorties.
- **Courir avec Foulée** : carte OpenStreetMap en direct, chrono, distance, allure instantanée et moyenne, annonces vocales à chaque kilomètre, guidage de la séance étape par étape avec alertes d’allure, puis parcours, temps au kilomètre et enregistrement. L’écran doit rester allumé (limite de Safari).
- **Parcours** : trois boucles autour de ta position, à la distance de la séance (ou réglable), calculées sur les chemins piétons OpenStreetMap ; tracé affiché pendant la course avec alerte si tu t’en éloignes, export GPX.
- **Conseils** : conseils adaptés à chaque séance (avant, pendant, après), guide du jour J selon la distance (recharge, repas, échauffement, allure, temps de passage, ravitaillement), bibliothèque (alimentation, hydratation, récupération, étirements, renforcement, blessures, café) avec quantités calculées si le poids est indiqué, routines guidées à la voix (échauffement dynamique, renforcement, retour au calme).
- **Outils** : allure / temps / distance, temps de passage, prédictions de chrono et allures d’entraînement.
- **Connexion Strava** (optionnelle) : récupération automatique des sorties récentes. Mise en place : [docs/STRAVA.md](docs/STRAVA.md).
- **Réglages** : sauvegarde et restauration des données.

Les données restent sur le téléphone, sans compte.

## La méthode d’entraînement

Le moteur (`js/coach.js`) applique des principes reconnus :

- **Allures personnelles** par la méthode VDOT de Jack Daniels (équations de Daniels et Gilbert) : facile, seuil, intervalles, vitesse, allure objectif.
- **Environ 80 % d’endurance facile**, volumes plafonnés pour le seuil (≈ 10 % du temps hebdomadaire), les intervalles (≈ 8 %) et la vitesse (≈ 5 %).
- **Débutant complet** : course-marche sur 9 semaines (modèle NHS *Couch to 5K*) jusqu’à 30 minutes continues.
- **Progression prudente** (+6 à +10 % par semaine), semaine allégée toutes les 4 semaines, ou toutes les 3 après 50 ans ou une blessure ; sortie longue plafonnée.
- **Périodisation** : base (endurance, côtes, fartlek), développement (seuil, intervalles, vitesse), spécifique (allure objectif), affûtage (volume −25 à −55 %, intensité gardée).
- **Tests** en fin de phase, qui recalent les allures.

## Installer

Ouvre le site dans Safari sur iPhone, touche Partager, puis « Sur l’écran d’accueil ».

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| `js/app.js` | Écrans et navigation |
| `js/store.js` | Données sur le téléphone, rattachement des sorties aux séances |
| `js/coach.js` | Moteur d’entraînement (niveau, VDOT, allures, programme, adaptation) |
| `js/quiz.js` | Questionnaire de départ |
| `js/conseils.js`, `js/routines.js` | Conseils, guide du jour J, routines guidées |
| `js/steps.js` | Étapes des séances et guide Apple Watch |
| `js/tools.js` | Calculateurs |
| `js/analyse.js` | Graphiques et analyse |
| `js/strava-csv.js` | Lecture de l’archive Strava (FR et EN) |
| `js/strava.js`, `js/config.js` | Connexion Strava |
| `js/routes.js`, `js/parcours.js` | Boucles autour de la position (OSRM piéton) |
| `js/live.js`, `js/map.js` | Course en direct (GPS, guidage, voix) et cartes |
| `relay/worker.js` | Relais Cloudflare qui garde la clé secrète Strava |

## Développement

Aucune installation : ce sont des fichiers HTML, CSS et JavaScript. Pour tester en local :

```
python3 -m http.server 8000
```

Puis ouvre http://localhost:8000. Ajoute `?today=2026-12-10` à l’adresse pour simuler une autre date.
