// Description des étapes d'une séance et marche à suivre pour l'Apple Watch.
import { clock, duration, distance, paceRange } from './util.js';

const KIND = { warmup: 'Échauffement', cooldown: 'Retour au calme', run: 'Course', work: 'Effort', recovery: 'Récup' };

function amount(st) {
  return st.dist ? distance(st.dist) : duration(st.dur);
}

// Temps de passage cible d'un effort sur distance : 600 m à 5:40 -> 3:24
export function splitFor(st) {
  if (!st.dist || !st.pace || st.pace[0] !== st.pace[1]) {
    if (st.dist && st.pace) {
      const a = clock((st.dist / 1000) * st.pace[0]);
      const b = clock((st.dist / 1000) * st.pace[1]);
      return a === b ? a : `${a}–${b}`;
    }
    return null;
  }
  return clock((st.dist / 1000) * st.pace[0]);
}

// Lignes lisibles pour l'écran de séance
export function describe(steps) {
  return steps.map((st) => {
    if (st.k === 'repeat') {
      return { kind: 'repeat', times: st.times, items: describe(st.steps) };
    }
    const split = st.k === 'work' ? splitFor(st) : null;
    return {
      kind: st.k,
      name: KIND[st.k],
      amount: amount(st),
      pace: st.k === 'warmup' || st.k === 'cooldown' ? 'facile' : (st.pace ? paceRange(st.pace) : ''),
      split,
      label: st.label || '',
    };
  });
}

// Marge de l'alerte d'allure : une cible unique devient ±10 s
function alertRange(p) {
  if (!p) return null;
  return p[0] === p[1] ? [p[0] - 10, p[0] + 10] : p;
}

export function totalTime(steps) {
  let t = 0;
  for (const st of steps) {
    if (st.k === 'repeat') t += st.times * totalTime(st.steps);
    else if (st.dur) t += st.dur;
    else if (st.dist) t += (st.dist / 1000) * ((st.pace?.[1] ?? 540));
  }
  return t;
}

// Marche à suivre dans l'app Forme (iPhone), générée à partir des étapes.
export function watchGuide(session) {
  const steps = session.steps;
  const structured = steps.some((s) => s.k === 'repeat' || s.k === 'warmup' || s.k === 'work') || steps.length > 1;

  if (!structured) {
    const st = steps[0];
    const goal = st.dist ? `Distance ${distance(st.dist)}` : `Durée ${duration(st.dur)}`;
    return {
      simple: true,
      lines: [
        'Pas besoin d’entraînement personnalisé.',
        `Sur la montre : Exercice, Course en extérieur, bouton …, objectif ${goal}.`,
        st.pace && st.pace !== null && st.pace[0] < 500
          ? `Ajoute une alerte d’allure ${paceRange(st.pace)}.`
          : 'Ajoute une alerte de fréquence cardiaque à 150 pour rester en aisance.',
      ],
    };
  }

  const lines = [
    'Ouvre Forme, onglet Exercice, puis Course en extérieur.',
    'Touche l’icône chronomètre, puis Personnalisé, puis +.',
    `Nomme la séance « ${session.title} ».`,
  ];

  const stepLine = (st) => {
    if (st.k === 'warmup') return `Échauffement : active-le, ${amount(st)}.`;
    if (st.k === 'cooldown') return `Retour au calme : ${amount(st)}.`;
    const goal = st.dist ? `Distance ${distance(st.dist)}` : `Durée ${duration(st.dur)}`;
    const name = st.k === 'recovery' ? 'Récup' : st.k === 'work' ? 'Effort' : 'Course';
    const r = st.k !== 'recovery' ? alertRange(st.pace) : null;
    const alert = r ? `, alerte d’allure ${clock(r[0])}–${clock(r[1])}/km` : '';
    return `Ajouter une étape « ${name} » : ${goal}${alert}.`;
  };

  for (const st of steps) {
    if (st.k === 'repeat') {
      st.steps.forEach((inner) => lines.push(stepLine(inner)));
      lines.push(`Ajouter une répétition : sélectionne ces ${st.steps.length} étapes, ${st.times} répétitions.`);
    } else {
      lines.push(stepLine(st));
    }
  }
  lines.push('Valide avec la coche : la séance arrive sur la montre dans Exercice, Course en extérieur, Personnalisé.');
  return { simple: false, lines };
}
