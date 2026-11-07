// Traduit les repères nutritionnels (grammes par kilo) en portions d'aliments concrets,
// selon le poids et l'alimentation du coureur.
// Valeurs moyennes par portion, arrondies (table Ciqual de l'Anses et emballages courants).
import { store } from './store.js';

/* ---------- Profil ---------- */

export function foodProfile(over) {
  const t = { ...store.tools, ...(over || {}) };
  const w = Number(t.weight);
  const d = t.diet || {};
  const known = w >= 35 && w <= 160;
  return {
    weight: known ? w : null,
    w: known ? w : 70,
    regime: d.regime || 'omni',     // omni | vege | vegan
    noLactose: !!d.noLactose,
    noGluten: !!d.noGluten,
    coffee: d.coffee !== false,
    moment: t.moment || null,        // matin | midi | soir | variable
  };
}

/* ---------- Aliments ---------- */
// c : glucides, p : protéines, par portion (ou pour 100 g si g: true)

const F = {
  banane: { n: ['banane', 'bananes'], c: 23, p: 1 },
  pain: { n: ['tranche de pain', 'tranches de pain'], c: 20, p: 3, gluten: 1 },
  painSG: { n: ['tranche de pain sans gluten', 'tranches de pain sans gluten'], c: 13, p: 1 },
  confiture: { n: ['cuillère à soupe de confiture', 'cuillères à soupe de confiture'], c: 13, p: 0 },
  laitChoco: { n: ['grand verre de lait chocolaté', 'grands verres de lait chocolaté'], c: 25, p: 8, lactose: 1, animal: 1 },
  sojaChoco: { n: ['grand verre de boisson au soja chocolatée', 'grands verres de boisson au soja chocolatée'], c: 20, p: 7 },
  skyr: { n: ['pot de skyr ou de fromage blanc', 'pots de skyr ou de fromage blanc'], c: 6, p: 14, lactose: 1, animal: 1 },
  yaourt: { n: ['yaourt', 'yaourts'], c: 6, p: 5, lactose: 1, animal: 1 },
  yaourtSoja: { n: ['yaourt au soja', 'yaourts au soja'], c: 3, p: 5 },
  compote: { n: ['compote en gourde', 'compotes en gourde'], c: 14, p: 0 },
  avoine: { n: ['bol de flocons d’avoine', 'bols de flocons d’avoine'], c: 30, p: 6, gluten: 1 },
  jus: { n: ['verre de jus d’orange', 'verres de jus d’orange'], c: 18, p: 1 },
  biscuits: { n: ['biscuit sec', 'biscuits secs'], c: 6, p: 0.5, gluten: 1 },
  pates: { g: 1, n: 'pâtes', c: 30, p: 5, gluten: 1, starch: 1 },
  riz: { g: 1, n: 'riz', c: 28, p: 3, starch: 1 },
  oeuf: { n: ['œuf', 'œufs'], c: 0, p: 6.5, animal: 1 },
  poulet: { n: ['blanc de poulet (ou un filet de poisson)', 'blancs de poulet (ou filets de poisson)'], c: 0, p: 28, meat: 1, animal: 1 },
  sirop: { n: ['grand verre de sirop ou de boisson sucrée', 'grands verres de sirop ou de boisson sucrée'], c: 25, p: 0 },
  tofu: { g: 1, n: 'tofu', c: 2, p: 13 },
  lentilles: { g: 1, n: 'lentilles ou pois chiches cuits', c: 15, p: 8 },
};

const ok = (k, pr) => {
  const f = F[k];
  if (f.meat && pr.regime !== 'omni') return false;
  if (f.animal && pr.regime === 'vegan') return false;
  if (f.lactose && pr.noLactose) return false;
  if (f.gluten && pr.noGluten) return false;
  return true;
};

/* ---------- Calcul des portions ---------- */
// Un menu = une liste [aliment, rôle, quantité ou maximum, minimum] ;
// rôle : 'fix', 'c' (complète les glucides), 'p' (complète les protéines)

function solve(menu, target) {
  const q = menu.map(([, role, n]) => (role === 'fix' ? n : 0));
  const sum = (key) => menu.reduce((s, [k], i) => s + F[k][key] * q[i], 0);
  for (const role of ['p', 'c']) {
    menu.forEach(([k, r, max, min = 0], i) => {
      if (r !== role) return;
      const f = F[k];
      const missing = (role === 'p' ? target.p : target.c) - sum(role);
      const step = f.g ? 0.5 : 1;
      let n = missing > 0 ? Math.round(missing / f[role] / step) * step : 0;
      if (f.g && n) n = Math.max(n, 1);
      q[i] = Math.max(min, Math.min(n, max || 9));
    });
  }
  return { items: menu.map(([k], i) => [k, q[i]]).filter(([, n]) => n > 0), c: sum('c'), p: sum('p') };
}

function pick(options, pr, target) {
  const menu = options.find((m) => m.every(([k]) => ok(k, pr))) || options[options.length - 1];
  return solve(menu, target);
}

const plateSize = (g) => (g <= 150 ? 'une petite assiette' : g <= 250 ? 'une assiette' : g <= 350 ? 'une grande assiette' : 'une très grande assiette');

function itemText([k, n]) {
  const f = F[k];
  if (f.g) {
    const g = Math.round(n * 100);
    return f.starch ? `${plateSize(g)} de ${f.n} (${g} g cuits)` : `${g} g de ${f.n}`;
  }
  return `${n} ${n > 1 ? f.n[1] : f.n[0]}`;
}

export function joinFr(list) {
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`;
}

const text = (r) => joinFr(r.items.map(itemText));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const starch = (pr) => (pr.noGluten ? 'riz' : 'pates');
const bread = (pr) => (pr.noGluten ? 'painSG' : 'pain');

/* ---------- Situations ---------- */

// Dans l'heure après une séance dure ou longue : 1 g/kg de glucides, 0,3 g/kg de protéines
export function recovery(over) {
  const pr = foodProfile(over);
  const t = { c: clamp(pr.w, 45, 110), p: clamp(0.3 * pr.w, 15, 35) };
  const snack = pick([
    [['laitChoco', 'fix', 1], ['skyr', 'p', 2], ['banane', 'c', 3]],
    [['sojaChoco', 'p', 2], ['yaourtSoja', 'p', 2], ['banane', 'c', 3]],
  ], pr, t);
  const prot = { omni: ['poulet', 'p', 1], vege: ['oeuf', 'p', 4], vegan: ['tofu', 'p', 3] }[pr.regime];
  const meal = solve([[starch(pr), 'c', 6], prot], t);
  return { snack: text(snack), meal: text(meal) };
}

// Collation 30 à 60 min avant : 15 à 35 g de glucides
export function preSnack(over) {
  const pr = foodProfile(over);
  const c = clamp(0.3 * pr.w, 15, 35);
  return `${text(solve([['banane', 'c', 2, 1]], { c, p: 0 }))}, ou ${text(solve([['compote', 'c', 3, 1]], { c, p: 0 }))}`;
}

// Repas 2 à 3 h avant une séance dure : 1 g/kg de glucides
export function preMeal(over, moment) {
  const pr = foodProfile(over);
  const t = { c: clamp(pr.w, 45, 110), p: 0 };
  const m = moment || pr.moment;
  const breakfast = text(solve([[bread(pr), 'c', 5, 1], ['confiture', 'fix', 1], ['banane', 'fix', 1], ['jus', 'c', 1]], t));
  const lunch = text(pick([
    [[starch(pr), 'c', 5], ['yaourt', 'fix', 1]],
    [[starch(pr), 'c', 5], ['yaourtSoja', 'fix', 1]],
  ], pr, t));
  if (m === 'matin') return { main: breakfast, label: 'au réveil, 2 à 3 heures avant si possible' };
  if (m === 'midi') return { main: breakfast, label: 'au petit-déjeuner (et une collation vers 10 h si tu as faim)' };
  if (m === 'soir') return { main: lunch, label: 'au déjeuner' };
  return { main: lunch, alt: breakfast, label: '2 à 3 heures avant' };
}

// Petit-déjeuner du jour de course, 3 h avant
export function raceBreakfast(long, over) {
  const pr = foodProfile(over);
  const t = { c: clamp((long ? 2 : 0.8) * pr.w, 40, 200), p: 0 };
  const menu = long
    ? [[bread(pr), 'c', 5, 2], ['confiture', 'fix', 2], ['banane', 'fix', 1], ['jus', 'c', 2, 1]]
    : [[bread(pr), 'c', 3, 1], ['confiture', 'fix', 1], ['banane', 'fix', 1]];
  return text(solve(menu, t));
}

// Recharge en glucides : une journée type (g/kg par jour)
export function loadingDay(gPerKg, over) {
  const pr = foodProfile(over);
  const day = gPerKg * pr.w;
  const meals = [
    ['Petit-déjeuner', 0.25, [[bread(pr), 'c', 5, 2], ['confiture', 'fix', 2], ['banane', 'fix', 1], ['jus', 'c', 2, 1]]],
    ['Déjeuner', 0.3, [[starch(pr), 'c', 5, 2], [bread(pr), 'fix', 2], ['compote', 'fix', 1], ['sirop', 'c', 2]]],
    ['Collation', 0.15, [['banane', 'fix', 1], [bread(pr), 'c', 3, 1], ['confiture', 'fix', 1], ['jus', 'c', 2]]],
    ['Dîner', 0.3, [[starch(pr), 'c', 5, 2], [bread(pr), 'fix', 2], ['compote', 'fix', 1], ['sirop', 'c', 2]]],
  ];
  return meals.map(([label, share, menu]) => [label, text(solve(menu, { c: day * share, p: 0 }))]);
}

// Une portion de protéines pour un repas : environ 0,3 g/kg
export function proteinServing(over) {
  const pr = foodProfile(over);
  const t = { c: 0, p: clamp(0.3 * pr.w, 15, 35) };
  // Chaque proposition : la première variante compatible avec l'alimentation
  const alts = {
    omni: [[[['poulet', 'p', 2]]], [[['oeuf', 'p', 5]]], [[['skyr', 'p', 3]], [['yaourtSoja', 'p', 4]]]],
    vege: [[[['oeuf', 'p', 5]]], [[['skyr', 'p', 3]], [['yaourtSoja', 'p', 4]]], [[['lentilles', 'p', 4]]], [[['tofu', 'p', 3]]]],
    vegan: [[[['tofu', 'p', 3]]], [[['lentilles', 'p', 4]]], [[['yaourtSoja', 'p', 4]]]],
  }[pr.regime];
  const list = alts.map((variants) => variants.find((m) => m.every(([k]) => ok(k, pr)))).filter(Boolean).slice(0, 3);
  return list.map((m) => text(solve(m, t))).join(', ou ');
}

// Café : 2 à 3 mg/kg une heure avant, en expressos (≈ 80 mg)
export function coffee(over) {
  const pr = foodProfile(over);
  if (!pr.coffee) return null;
  const lo = clamp(Math.round((2 * pr.w) / 80), 1, 3);
  const hi = clamp(Math.round((3 * pr.w) / 80), 1, 3);
  return lo === hi ? `${lo} expresso${lo > 1 ? 's' : ''}` : `${lo} expresso${lo > 1 ? 's' : ''} (${hi} si tu en as l’habitude)`;
}

// Hydratation : perte maximale conseillée (2 %) et quantité à reboire
export function hydration(over) {
  const pr = foodProfile(over);
  const maxLoss = Math.round(pr.w * 0.02 * 10) / 10;
  return { maxLoss: String(maxLoss).replace('.', ','), perKg: '1,5 litre (6 grands verres)' };
}

export function portionNote(over) {
  const pr = foodProfile(over);
  return pr.weight
    ? `Portions calculées pour ${String(pr.weight).replace('.', ',')} kg${pr.regime !== 'omni' || pr.noLactose || pr.noGluten ? ', selon ton alimentation' : ''}.`
    : 'Portions pour environ 70 kg : indique ton poids pour les ajuster.';
}
