# Foulée

Ton programme de course à pied, séance par séance. Une appli web installable (iPhone et Android), hébergée sur GitHub Pages.

## Ce que fait la version 0.1

- **Aujourd’hui** : la prochaine séance, la progression sur le couloir du programme, la régularité et le compte à rebours jusqu’à l’objectif.
- **Programme** : les 18 semaines en 3 phases, avec les séances à cocher.
- **Séance** : les étapes avec allures et temps de passage, la marche à suivre pour la programmer sur l’Apple Watch (app Forme), et un compte rendu (durée, distance, ressenti, note).
- **Tests 3 km** : les repères et l’écart avec tes chronos.
- **Réglages** : sauvegarde et restauration des données.

Les données restent sur le téléphone, sans compte.

## Installer

Ouvre le site dans Safari sur iPhone, touche Partager, puis « Sur l’écran d’accueil ».

## À venir

1. Calculateurs d’allure et de temps de passage
2. Import de l’archive Strava et analyse des sorties
3. Générateur de plan
4. Connexion Strava automatique

## Développement

Aucune installation : ce sont des fichiers HTML, CSS et JavaScript. Pour tester en local :

```
python3 -m http.server 8000
```

Puis ouvre http://localhost:8000. Ajoute `?today=2026-12-10` à l’adresse pour simuler une autre date.
