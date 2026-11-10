// Cardio : saisie de la fréquence cardiaque (moyenne et maximum), zones, lecture d'une séance,
// et conseils du coach tirés du cœur (footings trop intenses, fatigue, progrès d'endurance).
import { store, allSessions, allRuns } from './store.js';
import { daysBetween, esc } from './util.js';

const valid = (v) => Number.isFinite(v) && v >= 60 && v <= 230;
const EASY_TOP = 0.79;   // haut de la zone facile, en part de la FC max
const EASY_WARN = 0.83;  // au-delà : trop intense pour un footing
const HARD = new Set(['qualite', 'test', 'objectif']);

export const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M5.5 12.5h3l1.5-3 2.5 5 1.5-2h4.5"/></svg>';

/* ---------- Saisie ---------- */

export function hrFields(avg, max) {
  const cell = (name, label, v) => `
    <label class="field"><span>${label}</span>
      <span class="unit-input"><input name="${name}" data-hr-in="${name}" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" value="${v ? Math.round(v) : ''}"><em>bpm</em></span>
    </label>`;
  return `
    <fieldset class="hr-in">
      <legend><span class="hr-in-ico">${HEART}</span>Fréquence cardiaque <small>facultatif</small></legend>
      <div class="field-row hr-row">${cell('hr_avg', 'Moyenne', avg)}${cell('hr_max', 'Maximum', max)}</div>
      <p class="hint">À lire sur ta montre après la séance. Elle sert à vérifier que tes footings sont assez faciles et à suivre tes progrès.</p>
    </fieldset>`;
}

// Lit les deux champs ; `error` si les valeurs sont impossibles.
export function readHr(root) {
  const get = (n) => {
    const el = root.querySelector(`[data-hr-in="${n}"]`);
    const raw = el ? String(el.value).trim() : '';
    return raw === '' ? null : parseInt(raw, 10);
  };
  const a = get('hr_avg'), m = get('hr_max');
  if (a !== null && !valid(a)) return { error: 'FC moyenne : une valeur entre 60 et 230 bpm' };
  if (m !== null && !valid(m)) return { error: 'FC maximum : une valeur entre 60 et 230 bpm' };
  if (a && m && m < a) return { error: 'La FC maximum ne peut pas être sous la moyenne' };
  return { hrAvg: a, hrMax: m };
}

/* ---------- Sorties en plus du programme : footing ou sortie soutenue ---------- */

// Le genre choisi, sinon déduit du ressenti (7/10 et plus = soutenue)
export function runKind(a) {
  if (a.kind === 'facile' || a.kind === 'soutenue') return a.kind;
  if (a.rpe) return a.rpe >= 7 ? 'soutenue' : 'facile';
  return null;
}

export function kindField(kind) {
  const r = (v, l) => `<label><input type="radio" name="run_kind" value="${v}" data-run-kind ${kind === v ? 'checked' : ''}><span>${l}</span></label>`;
  return `
    <div class="field kind-field"><span>C’était</span>
      <div class="segmented segmented-compact">${r('facile', 'Un footing tranquille')}${r('soutenue', 'Une sortie soutenue')}</div>
    </div>`;
}

/* ---------- FC max et zones ---------- */

// Cardio d'une séance : le compte rendu, sinon la sortie rattachée
export function sessionHr(s) {
  const e = store.entry(s.id);
  if (!e?.done) return null;
  const a = e.activityId ? store.activities.find((x) => x.id === e.activityId) : null;
  const hrAvg = e.hrAvg || a?.hrAvg || null;
  const hrMax = e.hrMax || a?.hrMax || null;
  return hrAvg || hrMax ? { hrAvg, hrMax } : null;
}

// FC max : la valeur saisie, sinon la plus haute vue. « solid » : fiable pour juger les footings
// (saisie, ou mesurée lors d'un effort dur ; un maximum vu en footing sous-estime la vraie FC max).
export function fcMax() {
  if (store.tools.fcMax) return { v: store.tools.fcMax, src: 'saisie', solid: true };
  const seen = [];
  for (const s of allSessions()) {
    const h = sessionHr(s);
    const e = store.entry(s.id);
    if (h?.hrMax) seen.push({ v: h.hrMax, hard: HARD.has(s.type) || (e?.rpe || 0) >= 8 });
  }
  for (const a of store.activities) if (a.hrMax) seen.push({ v: a.hrMax, hard: (a.rpe || 0) >= 8 || runKind(a) === 'soutenue' });
  const ok = seen.filter((x) => x.v >= 140 && x.v <= 225);
  if (!ok.length) return null;
  const best = ok.reduce((m, x) => (x.v > m.v ? x : m));
  const solid = best.v >= 175 || ok.some((x) => x.hard && x.v >= best.v * 0.97);
  return { v: Math.round(best.v), src: 'mesurée', solid };
}

export function hrZones(max) {
  return [
    ['Facile', 'Footings, sortie longue', 0.6, EASY_TOP],
    ['Seuil', 'Tempo, seuil', 0.8, 0.88],
    ['Intervalles', 'Fractionné, tests', 0.89, 1],
  ].map(([name, use, a, b]) => ({ name, use, lo: Math.round(max * a), hi: Math.round(max * b) }));
}

export const easyHrCap = () => { const m = fcMax(); return m ? Math.round(m.v * EASY_TOP) : null; };

const zoneOf = (pct) => (pct <= EASY_TOP + 0.005 ? 'Facile' : pct < 0.885 ? 'Seuil' : 'Intervalles');

/* ---------- Lecture d'une séance ---------- */

function verdict(type, hrAvg, hrMax, M) {
  const easy = type === 'facile' || type === 'longue';
  if (hrAvg && easy) {
    const p = hrAvg / M.v;
    if (p <= EASY_TOP + 0.005) return ['good', 'Zone facile : c’est exactement l’intensité qu’il faut pour un footing.'];
    if (p <= EASY_WARN) return ['warn', `Un peu haut pour un footing (zone facile jusqu’à ${Math.round(M.v * EASY_TOP)} bpm). Ralentis de 10 s/km la prochaine fois.`];
    return ['bad', `Trop intense pour un footing : tu étais en zone ${zoneOf(p).toLowerCase()}. Ralentis nettement, quitte à marcher dans les côtes.`];
  }
  if (type === 'test' || type === 'objectif') {
    if (hrMax) return hrMax >= M.v * 0.95 ? ['good', 'Tu es allé au bout de l’effort : ce chrono reflète bien ton niveau.'] : ['info', `Maximum à ${Math.round((hrMax / M.v) * 100)} % de ta FC max : il te restait peut-être un peu de marge.`];
    return ['info', 'Sur un test, c’est la FC maximum qui dit si tu es allé au bout : note-la la prochaine fois.'];
  }
  if (hrAvg && type === 'qualite') {
    return hrAvg / M.v >= 0.78 ? ['good', 'Séance bien dans la zone de travail.'] : ['info', 'Moyenne basse : c’est normal si les récupérations étaient longues. Sur les fractions, fie-toi à l’allure.'];
  }
  return ['info', hrAvg ? `Moyenne en zone ${zoneOf(hrAvg / M.v).toLowerCase()}.` : ''];
}

// Carte « Cardio » d'une séance ou d'une sortie. `type` : facile, longue, qualite, test, objectif ou null.
export function hrCard({ hrAvg, hrMax, type = null, askKind = false }) {
  if (!hrAvg && !hrMax) return '';
  const M = fcMax();
  const pct = (v) => (M && v ? Math.round((v / M.v) * 100) : null);
  const pos = (v) => Math.max(0, Math.min(100, ((v / M.v - 0.55) / 0.45) * 100));
  const [tone, text] = M ? verdict(type, hrAvg, hrMax, M) : ['info', ''];
  const cell = (k, v) => `<div><dt>${k}</dt><dd>${v ? `${Math.round(v)}<small>bpm</small>` : '–'}</dd>${pct(v) ? `<dd class="cardio-pct">${pct(v)} % de ta FC max</dd>` : ''}</div>`;
  return `
    <section class="cardio is-${tone}">
      <h2 class="cardio-title"><span class="cardio-ico">${HEART}</span>Cardio${M && hrAvg ? `<span class="cardio-zone">Zone ${zoneOf(hrAvg / M.v).toLowerCase()}</span>` : ''}</h2>
      <dl class="cardio-figs">${cell('Moyenne', hrAvg)}${cell('Maximum', hrMax)}</dl>
      ${M ? `
        <div class="gauge" role="img" aria-label="Position dans tes zones cardiaques">
          <span class="gauge-z z1" style="left:${pos(M.v * 0.55)}%;width:${pos(M.v * 0.795) - pos(M.v * 0.55)}%"></span>
          <span class="gauge-z z2" style="left:${pos(M.v * 0.795)}%;width:${pos(M.v * 0.885) - pos(M.v * 0.795)}%"></span>
          <span class="gauge-z z3" style="left:${pos(M.v * 0.885)}%;width:${100 - pos(M.v * 0.885)}%"></span>
          ${hrMax ? `<i class="gauge-max" style="left:${pos(hrMax)}%"></i>` : ''}
          ${hrAvg ? `<i class="gauge-avg" style="left:${pos(hrAvg)}%"></i>` : ''}
        </div>
        <p class="gauge-legend"><span>Facile</span><span>Seuil</span><span>Intervalles</span></p>
        ${text ? `<p class="cardio-text">${esc(text)}</p>` : ''}
        ${askKind ? '<p class="hint">Indique ci-dessous si c’était un footing ou une sortie soutenue : le coach saura comment lire ce cardio.</p>' : ''}
        ${M.solid ? '' : `<p class="hint">Zones calculées sur ${M.v} bpm, la plus haute valeur vue jusqu’ici. Elles se préciseront à ton premier test, ou saisis ta FC max dans <a href="#/analyse">Analyse</a>.</p>`}`
        : '<p class="hint">Indique ta FC max dans <a href="#/analyse">Analyse</a>, ou note la FC maximum de ton prochain test : Foulée situera chaque séance dans tes zones.</p>'}
    </section>`;
}

/* ---------- Footings avec cardio : la base des conseils ---------- */

// Footings et sorties longues faits, avec FC moyenne, durée et distance. bpk = battements par kilomètre.
export function easySamples() {
  const out = [];
  for (const s of allSessions()) {
    if (s.type !== 'facile' && s.type !== 'longue') continue;
    const e = store.entry(s.id);
    const h = sessionHr(s);
    if (!h?.hrAvg || !e.duration || !e.distance) continue;
    const pace = e.duration / e.distance;
    if (pace < 180 || pace > 900) continue;
    out.push({ id: s.id, date: e.date || s.date, hr: h.hrAvg, pace, bpk: (h.hrAvg * pace) / 60, rpe: e.rpe || null });
  }
  // Les footings faits en plus du programme comptent aussi
  for (const a of allRuns()) {
    if (!a.extra || !a.hrAvg || runKind(a) !== 'facile' || !a.distance) continue;
    const pace = (a.moving || a.elapsed) / (a.distance / 1000);
    if (pace < 180 || pace > 900) continue;
    out.push({ id: a.id, date: a.date, hr: a.hrAvg, pace, bpk: (a.hrAvg * pace) / 60, rpe: a.rpe || null, extra: true });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const median = (xs) => { const a = xs.slice().sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };

// Lecture de la situation : sert au coach (accueil) et à l'estimation du chrono.
export function cardioState(t) {
  const M = fcMax();
  const all = easySamples().filter((x) => x.date <= t);
  const recent = all.filter((x) => daysBetween(x.date, t) <= 21).slice(-3);
  const shift = store.plan?.coach?.easyShift || 0;
  const st = { M, all, recent, shift, kind: null };
  if (!all.length) return st;
  const last = all[all.length - 1];
  if (M?.solid && recent.length >= 2) {
    const high = recent.filter((x) => x.hr > M.v * EASY_WARN);
    if (high.length >= 2) return { ...st, kind: 'high', avg: Math.round(mean(recent.map((x) => x.hr))), cap: Math.round(M.v * EASY_TOP) };
  }
  if (all.length >= 4 && daysBetween(last.date, t) <= 3) {
    const base = median(all.slice(-7, -1).map((x) => x.bpk));
    if (last.bpk > base * 1.07) return { ...st, kind: 'fatigue', last, over: Math.round((last.bpk / base - 1) * 100) };
  }
  if (M?.solid && shift > 0 && recent.length >= 3 && recent.every((x) => x.hr <= M.v * 0.75)) return { ...st, kind: 'restore' };
  if (all.length >= 6 && daysBetween(last.date, t) <= 10) {
    const win = all.slice(-8);
    const a = mean(win.slice(0, 3).map((x) => x.bpk)), b = mean(win.slice(-3).map((x) => x.bpk));
    if (b < a * 0.97) return { ...st, kind: 'progress', gain: Math.round((1 - b / a) * 100) };
  }
  if (M?.solid && recent.length >= 2 && recent.every((x) => x.hr <= M.v * (EASY_TOP + 0.005))) return { ...st, kind: 'ok' };
  if (M && !M.solid && recent.length >= 2) return { ...st, kind: 'needmax' };
  return st;
}

/* ---------- Carte du coach (Aujourd'hui) ---------- */

export function cardioCoach(ctx) {
  if (ctx.empty) return '';
  const st = cardioState(ctx.t);
  const snoozed = store.tools.cardioSnooze && daysBetween(store.tools.cardioSnooze, ctx.t) < 10;
  const card = (cls, title, body, actions = '') => `
    <section class="coach coach-cardio ${cls}">
      <p class="coach-kicker"><span class="cardio-ico">${HEART}</span>Coach · cardio</p>
      <h2 class="coach-title">${title}</h2>
      ${body}
      ${actions ? `<div class="coach-actions">${actions}</div>` : ''}
    </section>`;
  if (st.kind === 'high' && !snoozed) {
    const can = st.shift < 45;
    return card('is-warn', 'Tes footings sont trop intenses',
      `<p class="coach-text">FC moyenne de tes ${st.recent.length} derniers footings : <b>${st.avg} bpm</b>, pour une zone facile qui s’arrête à <b>${st.cap} bpm</b>. À cette intensité, tu accumules de la fatigue sans progresser davantage : c’est l’erreur la plus courante.</p>
       ${can ? '<p class="coach-text">Je peux ralentir les allures faciles de toutes tes séances à venir. Tes séances rapides et tes tests ne changent pas.</p>' : '<p class="coach-text">Tes allures faciles sont déjà ralenties de 45 s/km. Cours à la sensation : tu dois pouvoir parler en phrases complètes, quitte à marcher dans les côtes.</p>'}`,
      `${can ? '<button class="btn btn-primary" data-cardio-shift="15">Ralentir mes footings de 15 s/km</button>' : ''}<button class="btn btn-ghost" data-cardio-snooze>Garder mes allures</button>`);
  }
  if (st.kind === 'fatigue' && ctx.next && !snoozed) {
    return card('is-warn', 'Ton cœur bat plus haut que d’habitude',
      `<p class="coach-text">Sur ton dernier footing, ${st.over} % de battements en plus par kilomètre que d’ordinaire. C’est souvent de la fatigue, de la chaleur, un manque de sommeil ou un début de rhume.</p>
       <p class="coach-text">Si tu te sens entamé, allège la prochaine séance : une séance en moins coûte moins cher qu’une semaine d’arrêt.</p>`,
      `<button class="btn btn-primary" data-cardio-fatigue="${ctx.next.id}">Alléger la prochaine séance</button><button class="btn btn-ghost" data-cardio-snooze>Je me sens bien</button>`);
  }
  if (st.kind === 'restore') {
    return card('', 'Tes footings sont redevenus faciles',
      `<p class="coach-text">Tes 3 derniers footings sont bien en zone facile. Tes allures faciles avaient été ralenties de ${st.shift} s/km : tu peux revenir à celles calculées d’après ton niveau.</p>`,
      `<button class="btn btn-primary" data-cardio-shift="${-st.shift}">Revenir à mes allures d’origine</button>`);
  }
  if (st.kind === 'progress') {
    return card('', 'Ton endurance progresse',
      `<p class="coach-text"><b>−${st.gain} %</b> de battements par kilomètre sur tes footings : ton cœur travaille moins pour la même allure. C’est le signe le plus fiable que la base se construit. Continue à courir facile.</p>`);
  }
  if (st.kind === 'needmax' && !snoozed) {
    return card('', 'Il me manque ta FC max',
      `<p class="coach-text">Tu notes ta fréquence cardiaque, c’est parfait. Pour dire si tes footings sont assez faciles, il me faut ta FC max : saisis-la si tu la connais, sinon elle sera mesurée à ton prochain test (note bien la FC maximum ce jour-là).</p>`,
      '<a class="btn btn-primary" href="#/analyse">Saisir ma FC max</a><button class="btn btn-ghost" data-cardio-snooze>Plus tard</button>');
  }
  return '';
}

// Ligne courte pour l'estimation du chrono
export function cardioConfidence(t) {
  const k = cardioState(t).kind;
  return k === 'high' ? -4 : k === 'ok' || k === 'progress' || k === 'restore' ? 4 : 0;
}

/* ---------- Analyse ---------- */

export function hrBlock(runs) {
  const m = fcMax();
  const withHr = runs.filter((r) => r.hrAvg).slice(-20);
  const Z = m ? hrZones(m.v) : null;
  let dist = '';
  if (Z && withHr.length >= 3) {
    const easyN = withHr.filter((r) => r.hrAvg <= Z[0].hi).length;
    const pct = Math.round((easyN / withHr.length) * 100);
    dist = `<p class="hr-mix"><b>${pct} %</b> de tes ${withHr.length} dernières sorties en zone facile (fréquence moyenne). ${pct >= 70 ? 'Bon dosage.' : 'Trop peu : ralentis tes footings, ce sont eux qui construisent l’endurance.'}</p>`;
  }
  return `
    <section class="analyse-block" data-hr>
      <h2 class="section-title">Zones cardiaques</h2>
      <label class="field"><span>Fréquence cardiaque maximale</span>
        <span class="unit-input"><input data-hr-max inputmode="numeric" maxlength="3" autocomplete="off" value="${store.tools.fcMax || ''}" placeholder="${m ? m.v : 'ex. 185'}"><em>bpm</em></span>
      </label>
      ${m ? `<p class="hint">${m.src === 'mesurée' ? `${m.v} bpm, la plus haute valeur vue dans tes séances${m.solid ? '' : ' (pas encore lors d’un effort à fond : sans doute sous-estimée)'}. Saisis ta vraie FC max si tu la connais.` : 'Valeur saisie. Elle est relevée toute seule si une séance la dépasse.'}</p>` : '<p class="hint">Indique ta FC max si tu la connais. Sinon, note la FC maximum de tes séances : elle sera mesurée à ton premier test à fond.</p>'}
      ${Z ? `<table class="table zones-table"><tbody>${Z.map((z) => `<tr><th scope="row">${z.name}<small>${z.use}</small></th><td>${z.lo}–${z.hi} bpm</td></tr>`).join('')}</tbody></table>` : ''}
      ${dist}
      <p class="hint">Repères en pourcentage de la FC max. La fréquence met 2 à 3 minutes à monter : sur les fractions courtes, fie-toi plutôt à l’allure.</p>
    </section>`;
}
