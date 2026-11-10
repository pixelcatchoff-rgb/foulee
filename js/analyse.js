// Onglet Analyse : volume, allures, fréquence cardiaque, tests et liste des sorties.
import { allRuns, allSessions, store } from './store.js';
import { records } from './ui.js';
import { addDays, clock, dateShort, dayMonth, daysBetween, esc, parseISO } from './util.js';
import { hrBlock, easyHrCap, shoesBlock, painBlock } from './extras.js';
import { easySamples } from './cardio.js';

const W = 340;

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

/* ---------- Volume par semaine ---------- */

function weeklyVolume(runs, plan, t, maxWeeks = 16) {
  // Semaines alignées sur le jour de départ du plan
  const first = runs.length ? runs[0].date : t;
  const anchor = plan?.start || first;
  const offset = ((daysBetween(anchor, first) % 7) + 7) % 7;
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
    ${points.map((p) => `<circle cx="${x(p.date)}" cy="${y(p.v)}" r="${p.cls ? 4.5 : 4}" class="dot${p.cls ? ` ${p.cls}` : ''}"><title>${dateShort(p.date)} : ${fmt(p.v)}${p.note ? ` · ${p.note}` : ''}</title></circle>`).join('')}
    <text x="${left}" y="${H - 6}" class="axis">${dayMonth(points[0].date)}</text>
    <text x="${W - right}" y="${H - 6}" class="axis" text-anchor="end">${dayMonth(points[points.length - 1].date)}</text>
  </svg>`;
}

/* ---------- Tests ---------- */

function testsBlock(ctx) {
  if (!store.plan) return '';
  const tests = allSessions().filter((s) => s.type === 'test' || s.type === 'objectif');
  if (!tests.length) return '';
  const g = store.plan.goal;
  const testDist = (s) => s.testDist || g.distance;
  const results = tests.map((s) => ({ s, t: store.entry(s.id)?.time3k || null }));
  const done = results.filter((r) => r.t);
  const chart = done.length ? timeChart(
    done.map((r) => ({ date: store.entry(r.s.id).date || r.s.date, v: r.t / (testDist(r.s) / 1000) })),
    { invert: true, fmt: (v) => clock(v), label: 'Allure des tests', refLine: tests.filter((s) => s.repere).map((s) => ({ date: s.date, v: s.repere / (testDist(s) / 1000) })) },
  ) : '';

  return `
    <section class="analyse-block">
      <h2 class="section-title">Tests</h2>
      <p class="hint">Repères vers l’objectif : ${esc(g.label)}. ${esc(store.plan.baseline ? `Point de départ : ${store.plan.baseline}.` : '')}</p>
      ${chart ? `${chart}<p class="legend"><span class="lg-dot"></span>tes tests <span class="lg-ref"></span>repères (allure par km)</p>` : ''}
      <ul class="tests">
        ${results.map(({ s, t }) => {
          const gap = t && s.repere ? t - s.repere : null;
          const d = testDist(s);
          return `
          <li class="test ${s.type === 'objectif' ? 'is-goal' : ''}">
            <a href="#/seance/${s.id}">
              <span class="test-name">${s.type === 'objectif' ? 'Objectif' : esc(s.title)}</span>
              <span class="test-date">${dateShort(s.date)}</span>
              <span class="test-target">${s.repere ? `Repère ${clock(s.repere)}` : 'Objectif : finir'}</span>
              <span class="test-result">${t ? clock(t) : '—'}</span>
              <span class="test-gap ${gap === null ? '' : gap <= 0 ? 'is-good' : gap <= 30 ? 'is-close' : 'is-far'}">
                ${gap === null ? (t ? 'terminé' : s.date < ctx.t ? 'pas de chrono saisi' : 'à venir') : gap <= 0 ? `${clock(-gap)} d’avance` : `${clock(gap)} de retard`}
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
  const easy = store.plan?.easyPace || null;

  const importBlock = `
    <section class="analyse-block import">
      <h2 class="section-title">Ajouter des sorties</h2>
      <div class="form-actions"><a class="btn btn-primary" href="#/courir">Courir avec Foulée</a><a class="btn" href="#/ajouter-sortie">Saisir une sortie</a><a class="btn" href="#/parcours">Trouver un parcours</a></div>
      ${strava}
      <div class="form-actions">
        <label class="btn">Importer activities.csv<input type="file" accept=".csv,text/csv" data-import-csv hidden></label>
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
      <div class="empty">
        <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 54h44M16 54V38M28 54V26M40 54V32M52 54V16"/><path d="M14 30l12-10 12 6 14-14" stroke-dasharray="3 4"/></svg>
        <p>Tes graphiques apparaîtront ici dès ta première sortie : kilomètres par semaine, allures, fréquence cardiaque, records.</p>
      </div>
      ${importBlock}
      ${testsBlock(ctx)}
      ${shoesBlock(ctx.t)}
      ${painBlock()}`;
  }

  const weeks = weeklyVolume(runs, store.plan, ctx.t);
  // Type de séance de chaque sortie, pour colorer les points : un footing trop rapide ressort en orange
  const typeOf = {};
  for (const s of allSessions()) {
    const e = store.entry(s.id);
    if (e?.activityId) typeOf[e.activityId] = s.type;
    typeOf[`log-${s.id}`] = s.type;
  }
  const paceKind = (r) => {
    if (!easy) return {};
    const p = pace(r);
    const t = typeOf[r.id];
    const easyType = t === 'facile' || t === 'longue';
    if (p < easy[0] - 5) return easyType ? { cls: 'is-fast', note: 'trop rapide pour un footing' } : (t ? { cls: 'is-work', note: 'séance rapide' } : { cls: 'is-work' });
    if (p <= easy[1] + 20) return { cls: 'is-easy', note: 'zone facile' };
    return { cls: 'is-slow' };
  };
  const pacePts = runs.slice(-40).map((r) => ({ date: r.date, v: pace(r), ...paceKind(r) }));
  const fastEasy = pacePts.filter((p) => p.cls === 'is-fast').length;
  const hrPts = runs.slice(-40).filter((r) => r.hrAvg).map((r) => ({ date: r.date, v: r.hrAvg }));
  const hrCap = easyHrCap() || 150;

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
      <p class="legend">${easy ? '<span class="lg-dot is-easy"></span>facile <span class="lg-dot is-work"></span>séance rapide <span class="lg-dot is-fast"></span>footing trop rapide' : '<span class="lg-dot"></span>une sortie'} <span class="lg-trend"></span>moyenne sur 4</p>
      <p class="hint">Plus haut = plus rapide.${easy ? ' Une majorité de points verts, c’est le bon dosage.' : ''}${fastEasy ? ` ${fastEasy} footing${fastEasy > 1 ? 's' : ''} couru${fastEasy > 1 ? 's' : ''} trop vite : ralentis, tu progresseras plus.` : ''}</p>
    </section>

    ${hrPts.length >= 2 ? `
    <section class="analyse-block">
      <h2 class="section-title">Fréquence cardiaque moyenne</h2>
      ${timeChart(hrPts, { fmt: (v) => Math.round(v), label: 'Fréquence cardiaque moyenne', band: [0, hrCap], bandFit: false })}
      <p class="legend"><span class="lg-dot"></span>une sortie <span class="lg-band"></span>sous ${hrCap}, zone facile${easyHrCap() ? '' : ' (repère général)'}</p>
    </section>` : ''}

    ${(() => {
      const es = easySamples().slice(-30);
      if (es.length < 3) return '';
      const first = es.slice(0, Math.min(3, Math.floor(es.length / 2))), last = es.slice(-Math.min(3, Math.floor(es.length / 2)));
      const avg = (xs) => xs.reduce((s, x) => s + x.bpk, 0) / xs.length;
      const d = Math.round((1 - avg(last) / avg(first)) * 100);
      return `
    <section class="analyse-block">
      <h2 class="section-title">Efficacité du cœur</h2>
      ${timeChart(es.map((x) => ({ date: x.date, v: x.bpk })), { invert: true, fmt: (v) => Math.round(v), label: 'Battements par kilomètre sur les footings' })}
      <p class="legend"><span class="lg-dot"></span>un footing <span class="lg-trend"></span>moyenne sur 4</p>
      <p class="hint">Battements du cœur pour courir un kilomètre, sur tes footings. Plus haut sur le graphique = moins de battements = meilleure endurance. ${d >= 3 ? `Tu as gagné ${d} % : ton endurance progresse.` : d <= -3 ? `En hausse de ${-d} % : fatigue, chaleur ou footings trop rapides.` : 'Stable pour l’instant : la tendance se lit sur plusieurs semaines.'}</p>
    </section>`;
    })()}
    ${hrBlock(runs)}
    ${records(runs)}
    ${testsBlock(ctx)}
    ${shoesBlock(ctx.t)}
    ${painBlock()}

    <section class="analyse-block">
      <h2 class="section-title">Dernières sorties</h2>
      <ul class="runs">
        ${runs.slice(-12).reverse().map((r) => `
          <li><a href="${r.source === 'log' ? `#/seance/${r.id.slice(4)}` : `#/sortie/${encodeURIComponent(r.id)}`}">
            <span class="run-date">${dateShort(r.date)}${{ log: ' · saisie', gps: ' · Foulée', manual: ' · saisie' }[r.source] || ''}${r.extra ? ' · <b class="extra-tag">En plus</b>' : ''}</span>
            <span class="run-name">${esc(r.name)}</span>
            <span class="run-figs">${(r.distance / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km · ${clock(r.moving || r.elapsed)} · ${clock(pace(r))}/km${r.hrAvg ? ` · FC ${Math.round(r.hrAvg)}` : ''}</span>
          </a></li>`).join('')}
      </ul>
    </section>

    ${importBlock}`;
}
