// Onglet Analyse : volume, allures, fréquence cardiaque, tests et liste des sorties.
import { allRuns, allSessions, store } from './store.js';
import { addDays, clock, dateShort, dayMonth, daysBetween, esc, parseISO } from './util.js';

const W = 340;

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

/* ---------- Volume par semaine ---------- */

function weeklyVolume(runs, plan, t, maxWeeks = 16) {
  // Semaines alignées sur le jour de départ du plan
  const first = runs.length ? runs[0].date : plan.start;
  const offset = ((daysBetween(plan.start, first) % 7) + 7) % 7;
  let start = addDays(first, -offset);
  const end = t;
  const weeks = [];
  while (start <= end) {
    const to = addDays(start, 6);
    const km = runs.filter((r) => r.date >= start && r.date <= to).reduce((s, r) => s + r.distance / 1000, 0);
    weeks.push({ start, km });
    start = addDays(start, 7);
  }
  return weeks.slice(-maxWeeks);
}

function volumeChart(weeks) {
  const H = 150, top = 14, bottom = 22, left = 26;
  const max = niceMax(Math.max(...weeks.map((w) => w.km), 5));
  const bw = (W - left) / weeks.length;
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return `
  <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Kilomètres par semaine">
    ${ticks.map((v) => `<line x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${left - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}</text>`).join('')}
    ${weeks.map((w, i) => {
      const x = left + i * bw + bw * 0.18;
      const h = y(0) - y(w.km);
      const last = i === weeks.length - 1;
      return `<rect x="${x}" y="${y(w.km)}" width="${bw * 0.64}" height="${Math.max(h, w.km ? 1.5 : 0)}" rx="2" class="${last ? 'bar bar-now' : 'bar'}"><title>Semaine du ${dayMonth(w.start)} : ${w.km.toFixed(1).replace('.', ',')} km</title></rect>
        ${last || i === 0 || i % 4 === 0 ? `<text x="${x + bw * 0.32}" y="${H - 6}" class="axis" text-anchor="middle">${parseISO(w.start).getDate()}/${parseISO(w.start).getMonth() + 1}</text>` : ''}
        ${last && w.km ? `<text x="${x + bw * 0.32}" y="${y(w.km) - 4}" class="axis axis-strong" text-anchor="middle">${Math.round(w.km)}</text>` : ''}`;
    }).join('')}
  </svg>`;
}

/* ---------- Nuage de points dans le temps ---------- */

function timeChart(points, { invert = false, fmt = String, label, band, bandFit = true, refLine } = {}) {
  const H = 170, top = 12, bottom = 22, left = 38, right = 6;
  const xs = points.map((p) => parseISO(p.date).getTime());
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 86400000 * 7);
  let vals = points.map((p) => p.v);
  if (band && bandFit) vals = vals.concat(band);
  if (refLine) vals = vals.concat(refLine.map((p) => p.v));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.12, invert ? 10 : 3);
  lo -= pad; hi += pad;
  const x = (d) => left + ((parseISO(d).getTime() - x0) / (x1 - x0)) * (W - left - right);
  const y = (v) => {
    const r = (v - lo) / (hi - lo);
    return top + (H - top - bottom) * (invert ? r : 1 - r);
  };
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];

  // Moyenne glissante sur 4 sorties
  const avg = points.map((p, i) => {
    const win = points.slice(Math.max(0, i - 3), i + 1);
    return { date: p.date, v: win.reduce((s, q) => s + q.v, 0) / win.length };
  });

  return `
  <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">
    ${band ? (() => {
      const b0 = Math.max(lo, Math.min(hi, band[0])), b1 = Math.max(lo, Math.min(hi, band[1]));
      return `<rect x="${left}" width="${W - left - right}" y="${Math.min(y(b0), y(b1))}" height="${Math.abs(y(b0) - y(b1))}" class="band"/>`;
    })() : ''}
    ${ticks.map((v) => `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${left - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${fmt(v)}</text>`).join('')}
    ${refLine ? `<polyline points="${refLine.map((p) => `${x(p.date)},${y(p.v)}`).join(' ')}" class="ref-line"/>` : ''}
    ${points.length > 2 ? `<polyline points="${avg.map((p) => `${x(p.date)},${y(p.v)}`).join(' ')}" class="trend"/>` : ''}
    ${points.map((p) => `<circle cx="${x(p.date)}" cy="${y(p.v)}" r="4" class="dot"><title>${dateShort(p.date)} : ${fmt(p.v)}</title></circle>`).join('')}
    <text x="${left}" y="${H - 6}" class="axis">${dayMonth(points[0].date)}</text>
    <text x="${W - right}" y="${H - 6}" class="axis" text-anchor="end">${dayMonth(points[points.length - 1].date)}</text>
  </svg>`;
}

/* ---------- Tests ---------- */

function testsBlock(ctx) {
  const tests = allSessions().filter((s) => s.type === 'test' || s.type === 'objectif');
  if (!tests.length) return '';
  const g = store.plan.goal;
  const testDist = (s) => s.testDist || g.distance;
  const results = tests.map((s) => ({ s, t: store.entry(s.id)?.time3k || null }));
  const done = results.filter((r) => r.t);
  const chart = done.length ? timeChart(
    done.map((r) => ({ date: store.entry(r.s.id).date || r.s.date, v: r.t / (testDist(r.s) / 1000) })),
    { invert: true, fmt: (v) => clock(v), label: 'Allure des tests', refLine: tests.map((s) => ({ date: s.date, v: s.repere / (testDist(s) / 1000) })) },
  ) : '';

  return `
    <section class="analyse-block">
      <h2 class="section-title">Tests</h2>
      <p class="hint">Repères vers l’objectif ${esc(g.label)}. ${esc(store.plan.baseline ? `Point de départ : ${store.plan.baseline}` : '')}</p>
      ${chart ? `${chart}<p class="legend"><span class="lg-dot"></span>tes tests <span class="lg-ref"></span>repères (allure par km)</p>` : ''}
      <ul class="tests">
        ${results.map(({ s, t }) => {
          const gap = t ? t - s.repere : null;
          const d = testDist(s);
          return `
          <li class="test ${s.type === 'objectif' ? 'is-goal' : ''}">
            <a href="#/seance/${s.id}">
              <span class="test-name">${s.type === 'objectif' ? 'Objectif' : esc(s.title)}</span>
              <span class="test-date">${dateShort(s.date)}</span>
              <span class="test-target">Repère ${clock(s.repere)}</span>
              <span class="test-result">${t ? clock(t) : '—'}</span>
              <span class="test-gap ${gap === null ? '' : gap <= 0 ? 'is-good' : gap <= 30 ? 'is-close' : 'is-far'}">
                ${gap === null ? (s.date < ctx.t ? 'pas de chrono saisi' : 'à venir') : gap <= 0 ? `${clock(-gap)} d’avance` : `${clock(gap)} de retard`}
              </span>
              ${t ? `<span class="test-pace">${clock(t / (d / 1000))}/km</span>` : ''}
            </a>
          </li>`;
        }).join('')}
      </ul>
      <p class="hint">Plus de 30 secondes de retard sur un repère : ralentis un peu les allures de la phase suivante plutôt que de forcer.</p>
    </section>`;
}

/* ---------- Écran ---------- */

export function viewAnalyse(ctx, strava) {
  const runs = allRuns();
  const recent = runs.filter((r) => daysBetween(r.date, ctx.t) < 28 && r.date <= ctx.t);
  const pace = (r) => (r.moving || r.elapsed) / (r.distance / 1000);
  const recentKm = recent.reduce((s, r) => s + r.distance / 1000, 0);
  const recentPace = recent.length ? recent.reduce((s, r) => s + (r.moving || r.elapsed), 0) / (recentKm || 1) : null;
  const easy = store.plan.easyPace || [510, 540];

  const importBlock = `
    <section class="analyse-block import">
      <h2 class="section-title">Mes sorties Strava</h2>
      ${strava}
      <div class="form-actions">
        <label class="btn ${strava.includes('data-strava-connect') ? '' : 'btn-primary'}">Importer activities.csv<input type="file" accept=".csv,text/csv" data-import-csv hidden></label>
      </div>
      <details class="howto">
        <summary>Où trouver ce fichier ?</summary>
        <ol>
          <li>Sur strava.com (dans Safari, pas l’appli) : photo de profil, Paramètres, Mon compte.</li>
          <li>« Télécharger ou supprimer votre compte », puis « Demander votre archive ».</li>
          <li>Strava t’envoie un lien par e-mail. Télécharge le .zip, ouvre-le dans l’app Fichiers (un appui le décompresse).</li>
          <li>Ici, touche « Importer activities.csv » et choisis le fichier dans le dossier décompressé.</li>
        </ol>
        <p class="hint">Les sorties sont rattachées automatiquement aux séances du programme de la même semaine.</p>
      </details>
    </section>`;

  if (!runs.length) {
    return `
      <h1 class="page-title">Analyse</h1>
      <p class="lede">Importe tes sorties Strava ou remplis tes comptes rendus de séance : les graphiques apparaîtront ici.</p>
      ${importBlock}
      ${testsBlock(ctx)}`;
  }

  const weeks = weeklyVolume(runs, store.plan, ctx.t);
  const pacePts = runs.slice(-40).map((r) => ({ date: r.date, v: pace(r) }));
  const hrPts = runs.slice(-40).filter((r) => r.hrAvg).map((r) => ({ date: r.date, v: r.hrAvg }));

  return `
    <h1 class="page-title">Analyse</h1>
    <dl class="stats">
      <div><dt>Km sur 4 semaines</dt><dd>${Math.round(recentKm)}</dd></div>
      <div><dt>Sorties sur 4 semaines</dt><dd>${recent.length}</dd></div>
      <div><dt>Allure moyenne</dt><dd>${recentPace ? clock(recentPace) : '–'}</dd></div>
    </dl>

    <section class="analyse-block">
      <h2 class="section-title">Kilomètres par semaine</h2>
      ${volumeChart(weeks)}
      <p class="hint">Augmente d’environ 10 % par semaine au maximum.</p>
    </section>

    <section class="analyse-block">
      <h2 class="section-title">Allure de chaque sortie</h2>
      ${timeChart(pacePts, { invert: true, fmt: (v) => clock(v), label: 'Allure par sortie', band: easy })}
      <p class="legend"><span class="lg-dot"></span>une sortie <span class="lg-trend"></span>moyenne sur 4 sorties <span class="lg-band"></span>zone facile</p>
      <p class="hint">Plus haut = plus rapide. Une majorité de points dans la zone facile, c’est le bon dosage.</p>
    </section>

    ${hrPts.length >= 2 ? `
    <section class="analyse-block">
      <h2 class="section-title">Fréquence cardiaque moyenne</h2>
      ${timeChart(hrPts, { fmt: (v) => Math.round(v), label: 'Fréquence cardiaque moyenne', band: [0, 150], bandFit: false })}
      <p class="legend"><span class="lg-dot"></span>une sortie <span class="lg-band"></span>sous 150, l’aisance</p>
    </section>` : ''}

    ${testsBlock(ctx)}

    <section class="analyse-block">
      <h2 class="section-title">Dernières sorties</h2>
      <ul class="runs">
        ${runs.slice(-12).reverse().map((r) => `
          <li>
            <span class="run-date">${dateShort(r.date)}${r.source === 'log' ? ' · saisie' : ''}</span>
            <span class="run-name">${esc(r.name)}</span>
            <span class="run-figs">${(r.distance / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km · ${clock(r.moving || r.elapsed)} · ${clock(pace(r))}/km${r.hrAvg ? ` · FC ${Math.round(r.hrAvg)}` : ''}</span>
          </li>`).join('')}
      </ul>
    </section>

    ${importBlock}`;
}
