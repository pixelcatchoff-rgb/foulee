// Générateur de plan : même méthode que le programme de départ (base, vitesse, spécifique,
// tests en fin de phase, semaines allégées, affûtage), adaptée à l'objectif et au niveau.
import { predict, zonesFrom } from './tools.js';
import { addDays, clock, daysBetween, distance as fmtDist, parseISO } from './util.js';

export const GOALS = [[3000, '3 km'], [5000, '5 km'], [10000, '10 km'], [21097, 'Semi']];
export const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const LONG_MAX = { 3000: 65, 5000: 70, 10000: 85, 21097: 115 };
const SPEC_REPS = { 3000: [600, 800, 1000, 1000, 1200], 5000: [1000, 1200, 1600, 2000, 2000], 10000: [1600, 2000, 3000, 3000, 3000] };
const SPEC_VOL = { 3000: [3000, 4000], 5000: [5000, 6400], 10000: [6000, 9000] };

const lerp = (a, b, f) => a + (b - a) * f;
const r5 = (x) => Math.max(5, Math.round(x / 5) * 5);
const rs = (x) => Math.round(x);

/* ---------- Étapes ---------- */
const run = (min, pace, label) => ({ k: 'run', dur: min * 60, pace, label });
const wu = (pace) => ({ k: 'warmup', dur: 900, pace });
const cd = (pace) => ({ k: 'cooldown', dur: 600, pace });
const work = (o) => ({ k: 'work', ...o });
const rec = (o) => ({ k: 'recovery', ...o });
const rep = (times, steps) => ({ k: 'repeat', times, steps });
const strides = (n) => rep(n, [work({ dur: 20, label: 'rapide, sans être à fond' }), rec({ dur: 60, label: 'marche' })]);
const lenLabel = (m) => `${m.toLocaleString('fr-FR')} m`;

export function nextSunday(fromIso) {
  const d = parseISO(fromIso);
  return addDays(fromIso, (7 - d.getDay()) % 7);
}

export function goalLabel(dist, time) {
  const name = GOALS.find(([d]) => d === dist)?.[1] ?? fmtDist(dist);
  return `${name === 'Semi' ? 'Semi-marathon' : name} en ${time >= 3600 ? clock(time) : `${Math.floor(time / 60)} min${time % 60 ? ` ${String(time % 60).padStart(2, '0')}` : ''}`}`;
}

// Écart entre le niveau actuel et l'objectif, pour prévenir si c'est trop ambitieux.
export function feasibility(o) {
  const now = predict(o.ref.time, o.ref.dist, o.goalDist);
  const weeks = Math.ceil((daysBetween(o.start, o.goalDate) + 1) / 7);
  const gain = now / o.goalTime - 1; // 0,10 = 10 % plus rapide qu'aujourd'hui
  const perWeek = gain / Math.max(weeks, 1);
  let level = 'ok';
  if (gain <= 0) level = 'easy';
  else if (perWeek > 0.012 || gain > 0.2) level = 'hard';
  else if (perWeek > 0.007) level = 'stretch';
  return { now, gain, weeks, level };
}

export function validate(o) {
  const errs = [];
  if (!o.goalDist || !o.goalTime) errs.push('Indique la distance et le temps visé.');
  if (!o.ref?.dist || !o.ref?.time) errs.push('Indique un chrono de référence.');
  const weeks = Math.ceil((daysBetween(o.start, o.goalDate) + 1) / 7);
  if (!o.goalDate || weeks < 6) errs.push('Laisse au moins 6 semaines entre le début et l’objectif.');
  if (weeks > 30) errs.push('30 semaines maximum : choisis une date d’objectif plus proche.');
  if (o.days.length !== o.perWeek) errs.push(`Choisis ${o.perWeek} jours de course.`);
  return errs;
}

export function buildPlan(o) {
  const { goalDist, goalTime, goalDate, start, perWeek, ref } = o;
  const days = [...o.days].sort((a, b) => a - b);
  const longDay = days.includes(o.longDay) ? o.longDay : days[0];
  const n = Math.ceil((daysBetween(start, goalDate) + 1) / 7);
  const ws = parseISO(start).getDay();
  const off = (wd) => (wd - ws + 7) % 7;

  // Phases
  const base = Math.max(2, Math.round(n * 0.3));
  const spec = Math.max(2, Math.round(n * 0.3));
  const speed = Math.max(1, n - base - spec);
  const phases = [
    { name: 'Base', from: 1, to: base, aim: 'Courir régulièrement sans forcer et allonger la sortie longue.' },
    { name: 'Vitesse', from: base + 1, to: base + speed, aim: 'Fractionné court et travail au seuil.' },
    { name: 'Spécifique', from: base + speed + 1, to: n, aim: `Habituer le corps à l’allure objectif (${clock(goalTime / (goalDist / 1000))}/km), puis affûtage.` },
  ];

  // Allures : niveau actuel → objectif, au fil des semaines
  const z0 = zonesFrom(ref.dist, ref.time);
  const z1 = zonesFrom(goalDist, goalTime);
  const zone = (i, f) => [rs(lerp(z0[i][2][0], z1[i][2][0], f)), rs(lerp(z0[i][2][1], z1[i][2][1], f))];
  const goalPace = rs(goalTime / (goalDist / 1000));
  const testDist = goalDist <= 5000 ? goalDist : 5000;
  const testTimeAt = (f) => r5(lerp(predict(ref.time, ref.dist, testDist), predict(goalTime, goalDist, testDist), f));

  const testWeeks = new Set([base, base + speed, n - 2 > base + speed ? n - 2 : null].filter(Boolean));
  const longMax = LONG_MAX[goalDist] ?? 70;
  const weeks = [];

  for (let i = 1; i <= n; i += 1) {
    const f = (i - 1) / Math.max(n - 1, 1);
    const easy = zone(0, f * 0.6);
    const seuil = zone(1, f);
    const fast = zone(3, f);
    const phase = i <= base ? 0 : i <= base + speed ? 1 : 2;
    const k = i - phases[phase].from; // rang dans la phase
    const isTest = testWeeks.has(i);
    const nearTest = testWeeks.has(i - 1) || testWeeks.has(i + 1);
    const light = isTest || (i % 4 === 0 && !nearTest && i < n - 1);
    const longMin = r5(lerp(40, longMax, Math.min(1, (i - 1) / Math.max(n - 3, 1))) * (light ? 0.8 : 1));
    const easyMin = r5(lerp(30, 45, f) * (light ? 0.85 : 1));

    let quality;
    if (isTest) {
      quality = {
        type: 'test', title: `Test ${fmtDist(testDist)}`, repere: testTimeAt(i / n), testDist,
        steps: [wu(easy), work({ dist: testDist, label: 'le plus vite possible, allure régulière' }), cd(easy)],
        note: 'Note ton temps exact : il dit si tu es sur la bonne trajectoire.',
      };
    } else if (phase === 0) {
      if (k >= 2 && !light) {
        quality = { type: 'qualite', title: `Fartlek ${6 + Math.min(2, k - 2)} × 1 min`, steps: [wu(easy), rep(6 + Math.min(2, k - 2), [work({ dur: 60, pace: seuil, label: 'soutenu' }), rec({ dur: 90, label: 'trot' })]), cd(easy)] };
      } else {
        const nS = Math.min(10, 6 + 2 * Math.floor(k / 2));
        quality = { type: 'qualite', title: `${easyMin} min faciles + ${nS} × 20 s rapides`, steps: [run(easyMin, easy), strides(nS)] };
      }
    } else if (phase === 1) {
      if (k % 2 === 0) {
        const j = k / 2;
        const d = j < 2 ? 200 : 400;
        const times = d === 200 ? 8 + 2 * j : 6 + Math.min(2, j - 2);
        quality = { type: 'qualite', title: `${times} × ${d} m`, steps: [wu(easy), rep(times, [work({ dist: d, pace: fast }), rec({ dur: 90, label: 'trot' })]), cd(easy)] };
      } else {
        const blocks = [[2, 8], [3, 7], [2, 10], [1, 20], [1, 25]][Math.min(4, Math.floor(k / 2))];
        const title = blocks[0] === 1 ? `${blocks[1]} min au seuil` : `${blocks[0]} × ${blocks[1]} min au seuil`;
        const main = blocks[0] === 1
          ? work({ dur: blocks[1] * 60, pace: seuil })
          : rep(blocks[0], [work({ dur: blocks[1] * 60, pace: seuil }), rec({ dur: 120, label: 'trot' })]);
        quality = { type: 'qualite', title, steps: [wu(easy), main, cd(easy)] };
      }
    } else {
      if (goalDist > 10000) {
        const min = [20, 30, 35, 40, 45][Math.min(4, k)];
        quality = { type: 'qualite', title: `${min} min à l’allure objectif`, steps: [wu(easy), work({ dur: min * 60, pace: [goalPace, goalPace] }), cd(easy)] };
      } else {
        const reps = SPEC_REPS[goalDist] || SPEC_REPS[5000];
        const d = reps[Math.min(reps.length - 1, k)];
        const [v0, v1] = SPEC_VOL[goalDist] || SPEC_VOL[5000];
        const vol = lerp(v0, v1, Math.min(1, k / Math.max(spec - 2, 1)));
        const times = Math.max(2, Math.round(vol / d));
        quality = {
          type: 'qualite', title: `${times} × ${lenLabel(d)}`,
          steps: [wu(easy), rep(times, [work({ dist: d, pace: [goalPace, goalPace] }), rec({ dur: d >= 1500 ? 150 : 120, label: 'trot' })]), cd(easy)],
        };
      }
    }

    // Sortie longue le jour choisi, qualité le jour le plus éloigné, footings ailleurs
    const others = days.filter((d) => d !== longDay);
    const gap = (d) => Math.min(Math.abs(off(d) - off(longDay)), 7 - Math.abs(off(d) - off(longDay)));
    const qDay = [...others].sort((a, b) => gap(b) - gap(a))[0];
    const sessions = days.map((d) => {
      let s;
      if (d === longDay) s = { type: 'longue', title: `${longMin} min faciles`, steps: [run(longMin, easy)], note: 'Sortie longue : la plus longue de la semaine, toujours en aisance.' };
      else if (d === qDay) s = quality;
      else s = { type: 'facile', title: `${easyMin} min faciles`, steps: [run(easyMin, easy)] };
      return { day: off(d), ...s };
    }).sort((a, b) => a.day - b.day);

    weeks.push({ n: i, light, sessions, easy });
  }

  // Affûtage : les 6 jours avant l'objectif sont remplacés, même s'ils tombent sur deux semaines.
  const taperFrom = addDays(goalDate, -6);
  const dateOf = (w, s) => addDays(start, (w.n - 1) * 7 + s.day);
  for (const w of weeks) {
    const before = w.sessions.length;
    w.sessions = w.sessions.filter((s) => dateOf(w, s) < taperFrom);
    if (w.sessions.length !== before) w.light = true;
  }
  // Semaine précédant l'affûtage : sortie longue raccourcie
  for (const w of weeks) {
    for (const sess of w.sessions) {
      if (sess.type === 'longue' && dateOf(w, sess) >= addDays(goalDate, -13)) {
        const min = Math.min(sess.steps[0].dur / 60, r5(longMax * 0.7));
        sess.title = `${min} min faciles`;
        sess.steps = [run(min, sess.steps[0].pace)];
      }
    }
  }
  const place = (date, s) => {
    const wi = Math.floor(daysBetween(start, date) / 7);
    weeks[wi].sessions.push({ day: daysBetween(start, date) - wi * 7, ...s });
    weeks[wi].light = true;
  };
  const easyEnd = weeks[weeks.length - 1].easy;
  const list = taperSessions({ goalDist, goalPace, easy: easyEnd });
  const slots = [];
  for (let d = -6; d <= -2; d += 1) {
    const date = addDays(goalDate, d);
    if (days.includes(parseISO(date).getDay())) slots.push(date);
  }
  const chosen = slots.slice(-3);
  chosen.forEach((date, idx) => {
    let sess = list[idx + (3 - chosen.length)];
    if (sess.goalWork && daysBetween(date, goalDate) < 3) sess = list[2];
    const { goalWork, ...clean } = sess;
    place(date, clean);
  });
  place(goalDate, {
    type: 'objectif', title: `Objectif ${goalLabel(goalDist, goalTime)}`, repere: goalTime, testDist: goalDist,
    steps: [wu(easyEnd), work({ dist: goalDist, pace: [goalPace, goalPace], label: 'départ calme, puis régulier' })],
    note: `Pars un peu plus lentement que ${clock(goalPace)}/km sur le premier kilomètre, puis tiens l’allure.`,
  });
  weeks.forEach((w) => { w.sessions.sort((a, b) => a.day - b.day); delete w.easy; });

  weeks.forEach((w) => w.sessions.forEach((s, j) => { s.id = `w${w.n}s${j + 1}`; }));

  return {
    id: `plan-${goalDist}-${goalTime}-${goalDate}`,
    name: goalLabel(goalDist, goalTime),
    start,
    goal: { distance: goalDist, time: goalTime, label: goalLabel(goalDist, goalTime), secondary: '' },
    baseline: `${fmtDist(ref.dist)} en ${clock(ref.time)}.`,
    easyPace: zone(0, 0),
    generated: { ...o, days },
    phases,
    weeks,
  };
}

function taperSessions({ goalDist, goalPace, easy }) {
  const d = goalDist >= 10000 ? 2000 : 1000;
  return [
    { type: 'qualite', title: '35 min faciles + 4 × 20 s rapides', steps: [run(35, easy), strides(4)] },
    {
      goalWork: true, type: 'qualite', title: `2 × ${lenLabel(d)} à l’allure objectif`,
      steps: [wu(easy), rep(2, [work({ dist: d, pace: [goalPace, goalPace] }), rec({ dur: 180, label: 'trot' })]), cd(easy)],
    },
    { type: 'facile', title: '20 min très faciles + 3 × 20 s', steps: [run(20, easy), strides(3)] },
  ];
}
