# Activer la connexion Strava

Environ 15 minutes, faisable depuis l'iPhone (dans Safari). Deux comptes gratuits : une application API Strava et un relais Cloudflare qui garde la clé secrète.

## 1. Créer l'application Strava

1. Sur strava.com, ouvre **https://www.strava.com/settings/api**.
2. Remplis :
   - **Application Name** : Foulée
   - **Category** : Training
   - **Website** : `https://pixelcatchoff-rgb.github.io/foulee/`
   - **Authorization Callback Domain** : `pixelcatchoff-rgb.github.io`
3. Ajoute une icône (par exemple `icons/icon-512.png` du dépôt), accepte les conditions et valide.
4. Note le **Client ID** (un nombre) et le **Client Secret** (une longue suite de lettres). Le secret ne doit jamais être mis dans l'appli ni envoyé à quelqu'un.

Par défaut, une nouvelle application ne peut connecter qu'**un seul compte**. Pour tes amis, augmente la capacité à 10 athlètes dans la même page (« Athlete Capacity »), sans validation de Strava.

## 2. Créer le relais Cloudflare

1. Crée un compte gratuit sur **https://dash.cloudflare.com/sign-up**.
2. Menu **Workers & Pages**, puis **Create**, puis **Create Worker**. Nomme-le `foulee-strava` et touche **Deploy**.
3. Touche **Edit code**, efface tout, colle le contenu de `relay/worker.js` du dépôt, puis **Deploy**.
4. Dans le worker, va dans **Settings**, puis **Variables and Secrets**, et ajoute :

| Nom | Type | Valeur |
| --- | --- | --- |
| `STRAVA_CLIENT_ID` | Text | ton Client ID |
| `STRAVA_CLIENT_SECRET` | Secret | ton Client Secret |
| `ALLOWED_ORIGINS` | Text | `https://pixelcatchoff-rgb.github.io` |

5. Note l'adresse du worker, du type `https://foulee-strava.ton-compte.workers.dev`.

## 3. Brancher l'appli

Le plus simple : dans Foulée, **Réglages**, puis **Strava**, puis « Activer la connexion Strava » : saisis le Client ID et l'adresse du relais, puis **Activer**.

Pour que tes amis n'aient rien à saisir, renseigne-les plutôt une fois pour toutes dans `js/config.js` (ou envoie-les à Claude, qui le fait) :

```js
export const STRAVA = {
  clientId: '123456',
  relay: 'https://foulee-strava.ton-compte.workers.dev',
};
```

Le bouton « Se connecter avec Strava » apparaît alors dans Analyse et Réglages.

## Ce qu'il faut savoir

- La connexion récupère les sorties des **7 derniers jours** à chaque ouverture de l'appli (au plus une fois par heure), et les rattache aux séances de la semaine. Pour l'historique plus ancien, utilise l'import de l'archive (`activities.csv`).
- Strava demande de ne pas garder les données de l'API plus de 7 jours : Foulée les efface ensuite. Les séances remplies (durée, distance) restent dans ton suivi.
- Strava interdit d'utiliser les données de son API avec de l'intelligence artificielle. Foulée n'en envoie à aucune IA.
- Depuis 2026, l'accès développeur demande un abonnement Strava payant.
