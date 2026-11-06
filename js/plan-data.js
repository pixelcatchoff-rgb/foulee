// Programme par défaut : 3 km en 17 min (mi-mars 2027), départ dimanche 8 novembre 2026.
// Allures en secondes par km : [rapide, lent].
export const PACE = {
  easy: [510, 540],
  long7: [415, 425],
  seuil: [385, 395],
  seuil640: [395, 405],
  fartlek: [385, 395],
  obj: [340, 340],
  obj35: [335, 335],
  vma: [320, 330],
};

const run = (min, pace = PACE.easy, label) => ({ k: 'run', dur: min * 60, pace, label });
const runD = (m, pace = PACE.easy, label) => ({ k: 'run', dist: m, pace, label });
const wu = (min = 15) => ({ k: 'warmup', dur: min * 60, pace: PACE.easy });
const cd = (min = 10) => ({ k: 'cooldown', dur: min * 60, pace: PACE.easy });
const work = (o) => ({ k: 'work', ...o });
const rec = (o) => ({ k: 'recovery', ...o });
const rep = (times, steps) => ({ k: 'repeat', times, steps });

const strides = (n) => rep(n, [
  work({ dur: 20, label: 'rapide, sans être à fond' }),
  rec({ dur: 60, label: 'marche' }),
]);

const easyRun = (min, note) => ({ type: 'facile', title: `${min} min faciles`, steps: [run(min)], note });
const longRun = (min) => ({ type: 'longue', title: `${min} min faciles`, steps: [run(min)], note: 'Sortie longue : la plus longue de la semaine, toujours en aisance.' });
const easyStrides = (min, n) => ({ type: 'qualite', title: `${min} min faciles + ${n} × 20 s rapides`, steps: [run(min), strides(n)] });
const intervals = (title, times, workStep, recStep, note) => ({ type: 'qualite', title, steps: [wu(), rep(times, [work(workStep), rec(recStep)]), cd()], note });
const test3k = (repere) => ({
  type: 'test', title: 'Test 3 km', repere,
  steps: [wu(), work({ dist: 3000, label: 'le plus vite possible, allure régulière' }), cd()],
  note: 'Note ton temps exact : il sert à ajuster la suite du programme.',
});

const at = (day, s) => ({ day, ...s });

export function buildDefaultPlan() {
  const weeks = [
    // Phase 1 – Base
    { light: false, sessions: [at(0, easyRun(30, 'Marche-course autorisée si la FC grimpe.')), at(2, easyStrides(25, 6)), at(4, { ...longRun(40), note: 'Terrain plat de préférence.' })] },
    { light: false, sessions: [at(0, easyRun(35)), at(2, easyStrides(30, 6)), at(4, longRun(40))] },
    { light: false, sessions: [at(0, longRun(45)), at(2, easyRun(35)), at(4, easyStrides(30, 8))] },
    { light: false, sessions: [at(0, longRun(50)), at(2, easyRun(35)), at(4, intervals('Fartlek 6 × 1 min', 6, { dur: 60, pace: PACE.fartlek, label: 'soutenu' }, { dur: 90, label: 'trot' }))] },
    { light: true, sessions: [at(0, easyRun(45)), at(2, easyRun(30)), at(4, test3k(1170))] },
    // Phase 2 – Vitesse
    { light: false, sessions: [at(0, longRun(50)), at(2, easyRun(35)), at(4, intervals('8 × 200 m', 8, { dist: 200, pace: PACE.vma }, { dur: 90, label: 'trot' }))] },
    { light: false, sessions: [at(0, longRun(55)), at(2, easyRun(40)), at(4, intervals('2 × 8 min au seuil', 2, { dur: 480, pace: PACE.seuil640 }, { dur: 120, label: 'trot' }))] },
    { light: true, sessions: [at(0, easyRun(45)), at(2, easyStrides(30, 6)), at(4, easyRun(30))] },
    { light: false, sessions: [at(0, longRun(55)), at(2, easyRun(40)), at(4, intervals('10 × 200 m', 10, { dist: 200, pace: PACE.vma }, { dur: 90, label: 'trot' }))] },
    { light: false, sessions: [at(0, longRun(60)), at(2, easyRun(40)), at(4, intervals('3 × 7 min au seuil', 3, { dur: 420, pace: PACE.seuil }, { dur: 120, label: 'trot' }))] },
    { light: false, sessions: [at(0, longRun(65)), at(2, easyRun(40)), at(4, intervals('6 × 400 m', 6, { dist: 400, pace: PACE.vma }, { dur: 90, label: 'trot' }))] },
    { light: true, sessions: [at(0, easyRun(50)), at(2, easyRun(35)), at(4, test3k(1095))] },
    // Phase 3 – Spécifique
    { light: false, sessions: [at(0, { type: 'longue', title: '8 km vers 7:00/km', steps: [runD(8000, PACE.long7)] }), at(2, easyRun(40)), at(4, intervals('5 × 600 m', 5, { dist: 600, pace: PACE.obj }, { dur: 120, label: 'trot' }))] },
    { light: false, sessions: [at(0, { type: 'longue', title: '9 km vers 7:00/km', steps: [runD(9000, PACE.long7)] }), at(2, easyRun(40)), at(4, { type: 'qualite', title: '20 min au seuil', steps: [wu(), work({ dur: 1200, pace: PACE.seuil }), cd()] })] },
    { light: false, sessions: [at(0, { type: 'longue', title: '10 km vers 7:00/km', steps: [runD(10000, PACE.long7)] }), at(2, easyRun(40)), at(4, intervals('4 × 800 m', 4, { dist: 800, pace: PACE.obj35 }, { dur: 120, label: 'trot' }))] },
    { light: true, sessions: [at(0, { type: 'facile', title: '8 km faciles', steps: [runD(8000)] }), at(2, easyRun(35)), at(4, test3k(1050))] },
    { light: false, sessions: [at(0, { type: 'longue', title: '10 km dont 3 km à 6:30', steps: [runD(7000, [405, 415]), runD(3000, [385, 395], 'allure 10 km')] }), at(2, easyRun(40)), at(4, intervals('3 × 1000 m', 3, { dist: 1000, pace: PACE.obj35 }, { dur: 150, label: 'trot' }))] },
    { light: true, sessions: [
      at(0, easyStrides(40, 4)),
      at(2, intervals('2 × 1000 m', 2, { dist: 1000, pace: PACE.obj }, { dur: 180, label: 'trot' })),
      at(4, { type: 'facile', title: '20 min très faciles + 3 × 20 s', steps: [run(20), strides(3)] }),
      at(6, { type: 'objectif', title: 'Objectif 3 km en 17 min', repere: 1020, steps: [wu(), work({ dist: 3000, pace: [340, 340], label: 'départ calme, puis régulier' })], note: 'Pars un peu plus lentement que 5:40 sur les 500 premiers mètres, puis tiens 5:40.' }),
    ] },
  ];

  const phases = [
    { name: 'Base', from: 1, to: 5, aim: 'Courir régulièrement sans forcer, sortie longue jusqu’à 50 min.' },
    { name: 'Vitesse', from: 6, to: 12, aim: 'Fractionné court et seuil, sortie longue jusqu’à 65 min.' },
    { name: 'Spécifique', from: 13, to: 18, aim: 'Allure 5:40/km et sortie longue jusqu’à 10 km.' },
  ];

  weeks.forEach((w, i) => {
    w.n = i + 1;
    w.sessions.forEach((s, j) => { s.id = `w${w.n}s${j + 1}`; });
  });

  return {
    id: 'plan-3k-17',
    name: '3 km en 17 min',
    start: '2026-11-08',
    goal: { distance: 3000, time: 1020, label: '3 km en 17 min', secondary: '10 km à 6:30/km' },
    baseline: 'environ 6:20/km sur 1,65 km le 6 novembre 2026.',
    phases,
    weeks,
  };
}
