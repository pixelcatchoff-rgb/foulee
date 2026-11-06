# Foulée

Ton programme de course à pied, séance par séance. Une appli web installable (iPhone et Android), hébergée sur GitHub Pages : https://pixelcatchoff-rgb.github.io/foulee/

## Ce que fait la version 1.0

- **Aujourd’hui** : la prochaine séance, le couloir de progression du programme, la régularité et le compte à rebours.
- **Programme** : les semaines en 3 phases (base, vitesse, spécifique), séances à cocher, compte rendu de chaque séance (durée, distance, ressenti, note) et marche à suivre pour la programmer sur l’Apple Watch.
- **Nouveau programme** : générateur à partir d’un objectif (3 km, 5 km, 10 km, semi), d’une date, des jours de course et d’un chrono récent. L’ancien programme est archivé et peut être rétabli.
- **Analyse** : import de l’archive Strava (`activities.csv`), rattachement automatique aux séances, kilomètres par semaine, allure et fréquence cardiaque de chaque sortie, tests et dernières sorties.
- **Outils** : allure / temps / distance, temps de passage, prédictions de chrono et allures d’entraînement.
- **Connexion Strava** (optionnelle) : récupération automatique des sorties récentes. Mise en place : [docs/STRAVA.md](docs/STRAVA.md).
- **Réglages** : sauvegarde et restauration des données.

Les données restent sur le téléphone, sans compte.

## Installer

Ouvre le site dans Safari sur iPhone, touche Partager, puis « Sur l’écran d’accueil ».

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| `js/app.js` | Écrans et navigation |
| `js/store.js` | Données sur le téléphone, rattachement des sorties aux séances |
| `js/plan-data.js` | Programme de départ (3 km en 17 min) |
| `js/generator.js` | Générateur de programme |
| `js/steps.js` | Étapes des séances et guide Apple Watch |
| `js/tools.js` | Calculateurs |
| `js/analyse.js` | Graphiques et analyse |
| `js/strava-csv.js` | Lecture de l’archive Strava (FR et EN) |
| `js/strava.js`, `js/config.js` | Connexion Strava |
| `relay/worker.js` | Relais Cloudflare qui garde la clé secrète Strava |

## Développement

Aucune installation : ce sont des fichiers HTML, CSS et JavaScript. Pour tester en local :

```
python3 -m http.server 8000
```

Puis ouvre http://localhost:8000. Ajoute `?today=2026-12-10` à l’adresse pour simuler une autre date.
