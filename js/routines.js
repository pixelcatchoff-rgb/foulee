// Routines guidées à la voix : échauffement dynamique, renforcement, retour au calme.
import { store } from './store.js';
import { esc } from './util.js';

const ex = (name, dur, how, side) => ({ name, dur, how, side });
const rest = (dur = 15) => ({ name: 'Récupération', dur, how: 'Souffle, prépare l’exercice suivant.', rest: true });

const ROUTINES = {
  echauffement: {
    id: 'echauffement', tone: 'quality', title: 'Échauffement dynamique',
    when: 'Après 10 à 15 min de footing, avant une séance rapide ou une course',
    intro: 'Sur 15 à 20 mètres, aller en exercice, retour en marchant. Relâché, sans forcer.',
    steps: [
      ex('Montées de genoux', 30, 'Genoux à hauteur des hanches, pieds rapides, buste droit, bras actifs.'),
      ex('Talons-fesses', 30, 'Talons vers les fesses, petits pas rapides, genoux vers le sol.'),
      ex('Pas chassés', 30, 'De côté, face à droite à l’aller, face à gauche au retour.'),
      ex('Balancés de jambe avant-arrière', 30, 'Une main contre un mur, balance la jambe libre d’avant en arrière, de plus en plus haut.', 'jambe droite puis gauche'),
      ex('Balancés de jambe sur le côté', 30, 'Face au mur, balance la jambe de gauche à droite devant toi.', 'jambe droite puis gauche'),
      ex('Fentes marchées', 40, 'Grands pas, genou arrière près du sol, buste droit.'),
      ex('Foulées bondissantes', 30, 'Pousse fort du pied, genou haut, comme un saut de cabri allongé.'),
      ex('Accélérations progressives', 60, '3 fois 80 mètres en accélérant jusqu’à l’allure de la séance, retour en marchant.'),
    ],
  },
  renforcement: {
    id: 'renforcement', tone: 'easy', title: 'Renforcement du coureur',
    when: '2 fois par semaine, après un footing facile ou un jour sans course',
    intro: 'Un tapis ou de l’herbe, une marche d’escalier. Deux tours si tu es à l’aise, un seul pour commencer.',
    rounds: 2,
    steps: [
      ex('Gainage ventral', 40, 'Sur les avant-bras, corps aligné des épaules aux talons, ventre serré, ne creuse pas le dos.'),
      ex('Pont fessier', 40, 'Sur le dos, genoux pliés : monte le bassin en serrant les fessiers, redescends lentement.'),
      ex('Gainage latéral droit', 30, 'Sur l’avant-bras droit, corps aligné, bassin haut.'),
      ex('Gainage latéral gauche', 30, 'Sur l’avant-bras gauche, corps aligné, bassin haut.'),
      ex('Squats', 40, 'Pieds largeur d’épaules, descends comme pour t’asseoir, genoux dans l’axe des pieds.'),
      ex('Mollets sur une marche', 45, 'Avant des pieds sur la marche : monte sur deux pieds, redescends lentement sur un seul, talon sous la marche. Alterne.'),
      ex('Fentes arrière', 40, 'Grand pas en arrière, genou près du sol, remonte en poussant sur la jambe avant. Alterne.'),
      ex('Pont sur une jambe', 30, 'Comme le pont fessier, une jambe tendue en l’air.', 'droite puis gauche'),
      ex('Équilibre sur un pied', 30, 'Sur un pied, genou légèrement fléchi, yeux ouverts puis fermés.', 'droite puis gauche'),
    ],
  },
  'retour-calme': {
    id: 'retour-calme', tone: 'long', title: 'Retour au calme',
    when: 'Après une séance dure, une sortie longue ou une course',
    intro: 'Doux, sans jamais forcer ni rebondir. Respire lentement.',
    steps: [
      ex('Marche', 90, 'Marche tranquille pour faire redescendre le souffle.'),
      ex('Mollets', 30, 'Mains contre un mur, jambe arrière tendue, talon au sol.', 'droit puis gauche'),
      ex('Quadriceps', 30, 'Debout, attrape ta cheville derrière toi, genoux serrés, bassin en avant.', 'droit puis gauche'),
      ex('Ischio-jambiers', 30, 'Talon posé sur une marche basse, jambe tendue, penche-toi en avant dos droit.', 'droit puis gauche'),
      ex('Fessiers', 30, 'Sur le dos, cheville posée sur le genou opposé, tire la cuisse vers toi.', 'droit puis gauche'),
      ex('Fléchisseurs de hanche', 30, 'Un genou au sol, avance le bassin jusqu’à sentir l’avant de la hanche s’étirer.', 'droit puis gauche'),
      ex('Respiration', 60, 'Allongé, une main sur le ventre : inspire 4 secondes, souffle 6 secondes.'),
    ],
  },
};

// Une séquence à plat : les exercices « droite puis gauche » sont dédoublés, les tours répétés
function sequence(r) {
  const rounds = r.rounds && (store.plan?.coach?.level ?? 2) >= 2 ? r.rounds : 1;
  const out = [];
  for (let t = 1; t <= rounds; t += 1) {
    r.steps.forEach((s, i) => {
      if (s.side) {
        out.push({ ...s, name: `${s.name}, côté droit`, round: t });
        out.push({ ...s, name: `${s.name}, côté gauche`, round: t });
      } else out.push({ ...s, round: t });
      if (r.id === 'renforcement' && i < r.steps.length - 1) out.push({ ...rest(15), round: t });
    });
    if (t < rounds) out.push({ ...rest(60), name: 'Pause avant le 2e tour', round: t });
  }
  return { list: out, rounds };
}

export function routinesList() {
  return Object.values(ROUTINES).map((r) => ({ ...r, total: sequence(r).list.reduce((s, x) => s + x.dur, 0) }));
}

/* ---------- Lecteur ---------- */

let p = null; // { r, list, i, left, running, timer, wake, voice }

function say(text) {
  if (!p?.voice || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  const fr = speechSynthesis.getVoices().find((v) => v.lang?.startsWith('fr'));
  if (fr) u.voice = fr;
  speechSynthesis.speak(u);
}

export function viewRoutine(id) {
  const r = ROUTINES[id];
  if (!r) return '<p class="lede">Cette routine n’existe pas. <a href="#/conseils">Retour</a></p>';
  const { list, rounds } = sequence(r);
  p = { r, list, rounds, i: 0, left: list[0].dur, running: false, timer: null, wake: null, voice: true, done: false };
  const total = list.reduce((s, x) => s + x.dur, 0);
  return `
    <div class="routine" data-routine>
      <a class="back" href="#/conseils" data-back>Conseils</a>
      <h1 class="page-title">${esc(r.title)}</h1>
      <p class="lede">${esc(r.when)}. ${Math.round(total / 60)} minutes${rounds > 1 ? `, ${rounds} tours` : ''}.</p>
      <p class="hint">${esc(r.intro)}</p>
      <div class="rt-card" data-rt-card></div>
      <div class="live-controls" data-rt-controls></div>
      <label class="live-voice"><input type="checkbox" data-rt-voice checked> Annonces vocales</label>
      <ol class="rt-list" data-rt-list></ol>
    </div>`;
}

export function mountRoutine(root) {
  p.root = root;
  paint();
}

export function unmountRoutine() {
  if (!p) return;
  clearInterval(p.timer);
  p.wake?.release?.();
  p = null;
}

function paint() {
  if (!p?.root) return;
  const cur = p.list[p.i];
  const next = p.list[p.i + 1];
  const card = p.root.querySelector('[data-rt-card]');
  if (p.done) {
    card.className = 'rt-card is-done';
    card.innerHTML = '<span class="rt-name">Terminé</span><span class="rt-how">Bravo. Pense à le noter dans ta séance du jour.</span>';
  } else {
    card.className = `rt-card${cur.rest ? ' is-rest' : ''}`;
    card.innerHTML = `
      ${p.rounds > 1 || cur.round > 1 ? `<span class="rt-round">Tour ${cur.round}</span>` : ''}
      <span class="rt-name">${esc(cur.name)}</span>
      <span class="rt-time">${Math.floor(p.left / 60)}:${String(p.left % 60).padStart(2, '0')}</span>
      <span class="rt-how">${esc(cur.how)}</span>
      ${next ? `<span class="rt-next">Ensuite : ${esc(next.name)}</span>` : ''}
      <span class="rt-progress"><span style="width:${Math.round((p.i / p.list.length) * 100)}%"></span></span>`;
  }
  const ctr = p.root.querySelector('[data-rt-controls]');
  const state = p.done ? 'done' : p.running ? 'run' : p.i === 0 && p.left === p.list[0].dur ? 'ready' : 'pause';
  if (ctr.dataset.state !== state) {
    ctr.dataset.state = state;
    ctr.innerHTML = {
      ready: '<button class="btn btn-primary btn-big" data-rt="start">Démarrer</button>',
      run: '<button class="btn btn-big" data-rt="pause">Pause</button><button class="btn btn-ghost btn-big" data-rt="skip">Passer</button>',
      pause: '<button class="btn btn-primary btn-big" data-rt="start">Reprendre</button><button class="btn btn-ghost btn-big" data-rt="skip">Passer</button>',
      done: '<a class="btn btn-primary btn-big" href="#/conseils">Terminer</a>',
    }[state];
  }
  p.root.querySelector('[data-rt-list]').innerHTML = p.list.filter((x) => !x.rest).map((x) => {
    const idx = p.list.indexOf(x);
    return `<li class="${idx < p.i || p.done ? 'is-done' : idx === p.i ? 'is-now' : ''}"><span>${esc(x.name)}</span><span>${x.dur} s</span></li>`;
  }).join('');
}

function announce() {
  const cur = p.list[p.i];
  say(cur.rest ? `${cur.name}. Ensuite : ${p.list[p.i + 1]?.name || 'fin'}.` : `${cur.name}, ${cur.dur} secondes.`);
}

function tick() {
  p.left -= 1;
  if (p.left === 3 && !p.list[p.i].rest) say('3, 2, 1');
  if (p.left <= 0) advance();
  paint();
}

function advance() {
  p.i += 1;
  if (p.i >= p.list.length) {
    p.done = true;
    p.running = false;
    clearInterval(p.timer);
    p.wake?.release?.();
    say('Routine terminée. Bravo.');
    return;
  }
  p.left = p.list[p.i].dur;
  announce();
}

async function keepAwake() {
  try { if ('wakeLock' in navigator && !p.wake) p.wake = await navigator.wakeLock.request('screen'); } catch { /* pas grave */ }
}

export function handleRoutineClick(ev, root) {
  if (!p || !root) return false;
  const t = ev.target.closest('[data-rt]');
  if (!t) return false;
  const act = t.dataset.rt;
  if (act === 'start') {
    if (!p.running) {
      const first = p.i === 0 && p.left === p.list[0].dur;
      p.running = true;
      say(' ');
      if (first) announce(); else say('Reprise.');
      keepAwake();
      clearInterval(p.timer);
      p.timer = setInterval(tick, 1000);
    }
  } else if (act === 'pause') {
    p.running = false;
    clearInterval(p.timer);
    say('Pause.');
  } else if (act === 'skip') {
    advance();
  }
  paint();
  return true;
}

export function handleRoutineInput(ev) {
  if (!p || !ev.target.matches('[data-rt-voice]')) return false;
  p.voice = ev.target.checked;
  return true;
}

// Pour les tests
window.fouleeRoutine = { get state() { return p; }, tick: () => tick() };
