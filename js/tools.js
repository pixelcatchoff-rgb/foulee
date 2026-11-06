// Onglet Outils : trois calculateurs mis à jour en direct pendant la saisie.
import { clock } from './util.js';

export const DISTANCES = [
  [1000, '1 km'], [3000, '3 km'], [5000, '5 km'], [10000, '10 km'], [21097, 'Semi'], [42195, 'Marathon'],
];

const RIEGEL = 1.06;
export const predict = (t1, d1, d2) => t1 * Math.pow(d2 / d1, RIEGEL);

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const km = (m) => (m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const distLabel = (m) => DISTANCES.find(([d]) => d === m)?.[1] ?? `${km(m)} km`;

/* ---------- Petits champs ---------- */

function timeInputs(prefix, sec, { hours = false, label, disabled = false } = {}) {
  const h = hours && sec ? Math.floor(sec / 3600) || '' : '';
  const m = sec ? (hours ? Math.floor((sec % 3600) / 60) : Math.floor(sec / 60)) : '';
  const s = sec ? String(Math.round(sec) % 60).padStart(2, '0') : '';
  const cell = (n, v, unit, max) => `<span class="unit-input"><input data-f="${prefix}_${n}" inputmode="numeric" pattern="[0-9]*" maxlength="${max}" autocomplete="off" aria-label="${label}, ${unit}" value="${v}" ${disabled ? 'disabled' : ''}><em>${n}</em></span>`;
  return `<div class="time-pair${hours ? ' has-hours' : ''}">${hours ? cell('h', h, 'heures', 2) : ''}${cell('min', m, 'minutes', 3)}${cell('s', s, 'secondes', 2)}</div>`;
}

function readTime(root, prefix) {
  const g = (n) => num(root.querySelector(`[data-f="${prefix}_${n}"]`)?.value);
  const h = g('h'), m = g('min'), s = g('s');
  if (h === null && m === null && s === null) return null;
  const t = (h || 0) * 3600 + (m || 0) * 60 + Math.min(59, s || 0);
  return t > 0 ? t : null;
}

function writeTime(root, prefix, sec) {
  const set = (n, v) => { const el = root.querySelector(`[data-f="${prefix}_${n}"]`); if (el) el.value = v; };
  if (!sec || !Number.isFinite(sec)) { set('h', ''); set('min', ''); set('s', ''); return; }
  sec = Math.round(sec);
  const hasH = !!root.querySelector(`[data-f="${prefix}_h"]`);
  set('h', hasH ? Math.floor(sec / 3600) || '' : '');
  set('min', hasH ? Math.floor((sec % 3600) / 60) : Math.floor(sec / 60));
  set('s', String(sec % 60).padStart(2, '0'));
}

function distField(prefix, meters, label) {
  return `
    <div class="field">
      <span>${label}</span>
      <span class="unit-input"><input data-f="${prefix}" inputmode="decimal" autocomplete="off" aria-label="${label} en km" value="${meters ? km(meters) : ''}"><em>km</em></span>
      <div class="chips" role="group" aria-label="Distances courantes">
        ${DISTANCES.map(([d, l]) => `<button type="button" class="chip${d === meters ? ' is-on' : ''}" data-chip="${prefix}" data-m="${d}">${l}</button>`).join('')}
      </div>
    </div>`;
}

const readDist = (root, prefix) => {
  const v = num(root.querySelector(`[data-f="${prefix}"]`)?.value);
  return v && v > 0 ? Math.round(v * 1000) : null;
};

/* ---------- Écran ---------- */

export function viewTools(saved, reference) {
  const a = saved.calc || { solve: 'pace', dist: 3000, time: 1020, pace: 340 };
  const sp = saved.splits || { dist: 3000, time: 1020, step: 200 };
  const pr = saved.predict || reference;

  return `
    <h1 class="page-title">Outils</h1>
    <p class="lede">Les calculs se font pendant que tu tapes. Tes dernières valeurs sont gardées.</p>

    <section class="tool" data-tool="calc" data-solve="${a.solve}">
      <h2 class="section-title">Allure, temps, distance</h2>
      <div class="field">
        <span>Je cherche</span>
        <div class="segmented segmented-compact" role="radiogroup" aria-label="Valeur à calculer">
          ${[['pace', 'L’allure'], ['time', 'Le temps'], ['dist', 'La distance']].map(([v, l]) => `
            <label><input type="radio" name="solve" value="${v}" ${a.solve === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
      </div>
      <div class="solve-dist">${distField('c_dist', a.dist, 'Distance')}</div>
      <div class="field solve-time"><span>Temps</span>${timeInputs('c_time', a.time, { hours: true, label: 'Temps' })}</div>
      <div class="field solve-pace"><span>Allure par km</span>${timeInputs('c_pace', a.pace, { label: 'Allure' })}</div>
      <p class="result" data-out="calc" aria-live="polite"></p>
    </section>

    <section class="tool" data-tool="splits">
      <h2 class="section-title">Temps de passage</h2>
      ${distField('s_dist', sp.dist, 'Distance de la course')}
      <div class="field"><span>Temps visé</span>${timeInputs('s_time', sp.time, { hours: true, label: 'Temps visé' })}</div>
      <div class="field">
        <span>Un passage tous les</span>
        <div class="segmented segmented-compact" role="radiogroup" aria-label="Intervalle des passages">
          ${[100, 200, 400, 500, 1000].map((v) => `<label><input type="radio" name="step" value="${v}" ${sp.step === v ? 'checked' : ''}><span>${v < 1000 ? `${v} m` : '1 km'}</span></label>`).join('')}
        </div>
      </div>
      <p class="result" data-out="splits-head"></p>
      <ol class="split-list" data-out="splits"></ol>
    </section>

    <section class="tool" data-tool="predict">
      <h2 class="section-title">Prédictions et allures</h2>
      <p class="hint">Entre un chrono récent : test 3 km, course ou sortie à fond. ${reference.fromLog ? 'Ton dernier test est déjà rempli.' : ''}</p>
      ${distField('p_dist', pr.dist, 'Distance courue')}
      <div class="field"><span>Ton temps</span>${timeInputs('p_time', pr.time, { hours: true, label: 'Ton temps' })}</div>
      <h3 class="sub-title">Temps probables</h3>
      <table class="table" data-out="predict"></table>
      <h3 class="sub-title">Tes allures d’entraînement</h3>
      <table class="table" data-out="zones"></table>
      <p class="hint">Estimation par la formule de Riegel, fiable jusqu’à environ 4 fois la distance courue. Au-delà, prends-la comme un ordre de grandeur.</p>
    </section>
  `;
}

/* ---------- Calculs ---------- */

function updateCalc(root) {
  const solve = root.querySelector('[name=solve]:checked').value;
  root.dataset.solve = solve;
  const dist = readDist(root, 'c_dist');
  let time = readTime(root, 'c_time');
  let pace = readTime(root, 'c_pace');
  let d = dist;
  const out = root.querySelector('[data-out=calc]');

  if (solve === 'pace' && dist && time) pace = time / (dist / 1000);
  else if (solve === 'time' && dist && pace) time = pace * (dist / 1000);
  else if (solve === 'dist' && time && pace) d = (time / pace) * 1000;
  else { out.innerHTML = '<span class="result-empty">Remplis les deux autres valeurs.</span>'; return { solve, dist, time, pace }; }

  const speed = 3600 / pace;
  const main = solve === 'pace' ? `${clock(pace)}<small>/km</small>`
    : solve === 'time' ? clock(time)
    : `${km(Math.round(d))}<small> km</small>`;
  out.innerHTML = `<strong>${main}</strong><span>${speed.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km/h${solve !== 'pace' ? ` · ${clock(pace)}/km` : ''}</span>`;
  return { solve, dist: solve === 'dist' ? null : dist, time: solve === 'time' ? null : time, pace: solve === 'pace' ? null : pace };
}

function updateSplits(root) {
  const dist = readDist(root, 's_dist');
  const time = readTime(root, 's_time');
  let step = Number(root.querySelector('[name=step]:checked').value);
  const head = root.querySelector('[data-out=splits-head]');
  const list = root.querySelector('[data-out=splits]');
  if (!dist || !time) { head.innerHTML = '<span class="result-empty">Indique la distance et le temps visé.</span>'; list.innerHTML = ''; return null; }
  const pace = time / (dist / 1000);
  let auto = '';
  while (dist / step > 60) { step = step < 1000 ? 1000 : step * 5; auto = ' (intervalle élargi)'; }
  const marks = [];
  for (let m = step; m < dist; m += step) marks.push(m);
  marks.push(dist);
  head.innerHTML = `<strong>${clock(pace)}<small>/km</small></strong><span>${(3600 / pace).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km/h · ${clock((step / 1000) * pace)} par ${step < 1000 ? `${step} m` : 'km'}${auto}</span>`;
  list.innerHTML = marks.map((m) => `<li><span>${m < 1000 || m % 1000 ? (m >= 1000 ? `${km(m)} km` : `${m} m`) : `${m / 1000} km`}</span><span>${clock((m / 1000) * pace)}</span></li>`).join('');
  return { dist, time, step: Number(root.querySelector('[name=step]:checked').value) };
}

export function zonesFrom(dist, time) {
  const p3 = predict(time, dist, 3000) / 3;
  const p10 = predict(time, dist, 10000) / 10;
  return [
    ['Facile', 'Footings et sortie longue', [p10 * 1.22, p10 * 1.3]],
    ['Seuil', 'Allure 10 km, blocs de 7 à 20 min', [p10, p10 + 10]],
    ['Allure 3 km', '600 m à 1 500 m', [p3, p3]],
    ['Fractionné court', '200 m et 400 m', [p3 - 15, p3 - 8]],
  ];
}

function updatePredict(root) {
  const dist = readDist(root, 'p_dist');
  const time = readTime(root, 'p_time');
  const tPred = root.querySelector('[data-out=predict]');
  const tZones = root.querySelector('[data-out=zones]');
  if (!dist || !time) {
    tPred.innerHTML = '<caption class="result-empty">Indique une distance et un temps.</caption>';
    tZones.innerHTML = '';
    return null;
  }
  tPred.innerHTML = `
    <thead><tr><th scope="col">Distance</th><th scope="col">Temps</th><th scope="col">Allure</th></tr></thead>
    <tbody>${DISTANCES.map(([d, l]) => {
      const t = predict(time, dist, d);
      const far = d / dist > 4 || dist / d > 4;
      return `<tr class="${d === dist ? 'is-ref' : ''}${far ? ' is-far' : ''}"><th scope="row">${l}</th><td>${clock(t)}</td><td>${clock(t / (d / 1000))}/km</td></tr>`;
    }).join('')}</tbody>`;
  tZones.innerHTML = `
    <thead><tr><th scope="col">Zone</th><th scope="col">Allure</th></tr></thead>
    <tbody>${zonesFrom(dist, time).map(([n, use, [a, b]]) => `
      <tr><th scope="row">${n}<small>${use}</small></th><td>${Math.round(a) === Math.round(b) ? clock(a) : `${clock(a)}–${clock(b)}`}/km</td></tr>`).join('')}</tbody>`;
  return { dist, time };
}

/* ---------- Branchement ---------- */

export function bindTools(container, onSave) {
  if (container._toolsBound) { container._toolsInit(); return; }
  container._toolsBound = true;
  const run = () => {
    const calc = container.querySelector('[data-tool=calc]');
    const splits = container.querySelector('[data-tool=splits]');
    const pred = container.querySelector('[data-tool=predict]');
    if (!calc) return;
    const c = updateCalc(calc);
    const s = updateSplits(splits);
    const p = updatePredict(pred);
    const patch = {};
    if (c) {
      patch.calc = {
        solve: c.solve,
        dist: readDist(calc, 'c_dist'),
        time: readTime(calc, 'c_time'),
        pace: readTime(calc, 'c_pace'),
      };
    }
    if (s) patch.splits = s;
    if (p) patch.predict = p;
    onSave(patch);
  };

  // Champ calculé : on y affiche le résultat, il n'est pas modifiable.
  const syncSolved = () => {
    const calc = container.querySelector('[data-tool=calc]');
    if (!calc) return;
    const solve = calc.querySelector('[name=solve]:checked').value;
    calc.querySelectorAll('input[data-f], .chip').forEach((el) => { el.disabled = false; });
    const lock = solve === 'dist' ? '[data-f=c_dist], [data-chip=c_dist]' : `[data-f^=c_${solve}_]`;
    calc.querySelectorAll(lock).forEach((el) => { el.disabled = true; });
  };

  const fillSolved = () => {
    const calc = container.querySelector('[data-tool=calc]');
    if (!calc) return;
    const solve = calc.querySelector('[name=solve]:checked').value;
    const dist = readDist(calc, 'c_dist');
    const time = readTime(calc, 'c_time');
    const pace = readTime(calc, 'c_pace');
    if (solve === 'pace' && dist && time) writeTime(calc, 'c_pace', time / (dist / 1000));
    if (solve === 'time' && dist && pace) writeTime(calc, 'c_time', pace * (dist / 1000));
    if (solve === 'dist' && time && pace) {
      const el = calc.querySelector('[data-f=c_dist]');
      el.value = km(Math.round((time / pace) * 1000));
    }
    calc.querySelectorAll('[data-chip=c_dist]').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.m) === readDist(calc, 'c_dist')));
  };

  container.addEventListener('input', (ev) => {
    if (!ev.target.closest('.tool')) return;
    const chipFor = ev.target.dataset.f;
    if (chipFor) {
      container.querySelectorAll(`[data-chip="${chipFor}"]`).forEach((b) => b.classList.toggle('is-on', Number(b.dataset.m) === readDist(ev.target.closest('.tool'), chipFor)));
    }
    if (ev.target.name === 'solve') syncSolved();
    fillSolved();
    run();
  });

  container.addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-chip]');
    if (!chip || chip.disabled) return;
    const tool = chip.closest('.tool');
    tool.querySelector(`[data-f="${chip.dataset.chip}"]`).value = km(Number(chip.dataset.m));
    tool.querySelectorAll(`[data-chip="${chip.dataset.chip}"]`).forEach((b) => b.classList.toggle('is-on', b === chip));
    fillSolved();
    run();
  });

  container._toolsInit = () => {
    if (!container.querySelector('[data-tool]')) return;
    syncSolved();
    fillSolved();
    run();
  };
  container._toolsInit();
}
