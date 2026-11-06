// Conseils : bibliothèque, conseils adaptés à chaque séance, guide du jour J.
// Repères tirés des positions officielles (ACSM / Academy of Nutrition and Dietetics / Dietitians of Canada,
// GSSI, ISSN) et des méta-analyses sur la prévention des blessures. Ce ne sont pas des conseils médicaux.
import { store, allSessions } from './store.js';
import { totalTime } from './steps.js';
import { clock, daysBetween, esc, distance as fmtDist } from './util.js';

const kg = () => {
  const w = Number(store.tools.weight);
  return w >= 35 && w <= 160 ? w : null;
};
// « 1 g/kg » devient « environ 70 g » si le poids est connu
const perKg = (g, unit = 'g', round = 5) => {
  const w = kg();
  if (!w) return `${String(g).replace('.', ',')} ${unit} par kg de poids`;
  return `environ ${Math.round((g * w) / round) * round} ${unit}`;
};
const range = (a, b, unit = 'g') => {
  const w = kg();
  if (!w) return `${String(a).replace('.', ',')} à ${String(b).replace('.', ',')} ${unit} par kg`;
  const r = (x) => Math.round((x * w) / 10) * 10;
  return `${r(a)} à ${r(b)} ${unit}`;
};

export const SOURCES = {
  acsm: ['ACSM, AND, DC – Nutrition and Athletic Performance (2016)', 'https://www.myhealthcareer.com.au/dietetics/joint-position-statement-sport-nutritions'],
  gssi: ['GSSI – Dietary carbohydrate and the endurance athlete (2022)', 'https://www.gssiweb.org/sports-science-exchange/article/dietary-carbohydrate-and-the-endurance-athlete-contemporary-perspectives'],
  issn: ['ISSN – Caffeine and exercise performance (2021)', 'https://jissn.biomedcentral.com/articles/10.1186/s12970-020-00383-4'],
  fluid: ['ACSM – Exercise and fluid replacement', 'https://pubmed.ncbi.nlm.nih.gov/17277604/'],
  lauersen: ['Lauersen et al., BJSM 2014 – prévention des blessures', 'https://blogs.bmj.com/bjsm/2014/07/20/exercises-to-prevent-sports-injuries-lots-of-talk-but-do-they-work/'],
};

/* =========================================================================
   Bibliothèque
   ========================================================================= */

export function articles() {
  return [
    {
      id: 'alimentation', title: 'Bien manger au quotidien', lead: 'Assez d’énergie, des glucides selon l’entraînement, des protéines à chaque repas.',
      body: [
        ['Les glucides, le carburant', [
          `Jour léger ou de repos : ${range(3, 5)} de glucides sur la journée.`,
          `Environ une heure d’entraînement par jour : ${range(5, 7)}.`,
          'Les jours de séance dure ou de sortie longue, augmente la part de féculents, pain, fruits ; les jours calmes, réduis-la.',
          'Sources : pâtes, riz, pommes de terre, pain, flocons d’avoine, fruits, légumes secs.',
        ]],
        ['Les protéines, pour réparer', [
          `Sur la journée : ${range(1.2, 2)} de protéines.`,
          `Réparties sur 3 à 4 prises de ${perKg(0.3)} chacune plutôt qu’en un seul gros repas.`,
          'Œufs, produits laitiers, viande, poisson, légumineuses, tofu.',
        ]],
        ['Ne pas manger trop peu', [
          'Courir en restriction fatigue, blesse et fait stagner : manger assez fait partie de l’entraînement.',
          'Fatigue qui dure, blessures à répétition, règles qui s’arrêtent : parles-en à un médecin.',
          'Fer (viande, légumineuses, avec de la vitamine C), calcium et vitamine D comptent pour les os des coureurs.',
        ]],
      ],
      sources: ['acsm'],
    },
    {
      id: 'avant', title: 'Manger avant de courir', lead: 'Le bon délai évite les crampes d’estomac et le coup de mou.',
      body: [
        ['Le repas', [
          'Repas principal 2 à 4 heures avant une séance dure : riche en glucides, pauvre en graisses et en fibres.',
          'Exemples : riz ou pâtes avec un peu de poulet ; pain, miel et yaourt.',
        ]],
        ['La collation', [
          '30 à 60 minutes avant, si tu as faim : une banane, une compote, deux biscuits secs.',
          'Footing facile de moins d’une heure : tu peux courir à jeun si tu le supportes bien.',
          'Séance de qualité, test ou sortie longue : ne pars pas à jeun.',
        ]],
      ],
      sources: ['acsm', 'gssi'],
    },
    {
      id: 'hydratation', title: 'Boire', lead: 'Boire selon la soif, sans excès : trop boire est aussi dangereux que pas assez.',
      body: [
        ['Avant et pendant', [
          'Arrive bien hydraté : urines claires, un grand verre d’eau dans l’heure qui précède.',
          'Moins d’une heure de course : rien à boire pendant, sauf grosse chaleur.',
          'Plus d’une heure : bois selon la soif, par petites gorgées, environ 400 à 800 ml par heure selon la chaleur.',
          'L’objectif : ne pas perdre plus de 2 % de ton poids, mais ne jamais finir plus lourd qu’au départ (risque d’hyponatrémie).',
        ]],
        ['Après', [
          'Pèse-toi avant et après une sortie longue : chaque kilo perdu se compense par environ 1,5 litre de boisson sur les heures suivantes.',
          'Par forte chaleur ou si tu transpires beaucoup (traces blanches sur la casquette), sale un peu plus le repas ou prends une boisson d’effort.',
        ]],
      ],
      sources: ['fluid'],
    },
    {
      id: 'recuperation', title: 'Récupérer', lead: 'Le progrès se fait pendant le repos : sommeil, repas, séances faciles.',
      body: [
        ['Dans l’heure qui suit une séance dure', [
          `Glucides : ${perKg(1)}, pour recharger les muscles.`,
          `Protéines : ${perKg(0.3)}, pour les réparer.`,
          'Exemples : un grand verre de lait chocolaté ; un yaourt, une banane et une tranche de pain ; un repas complet si c’est l’heure.',
          'Après un footing facile, un repas normal suffit.',
        ]],
        ['Le sommeil, premier outil', [
          'Vise 7 à 9 heures par nuit. Une courte sieste de 20 minutes aide aussi.',
          'Pas de café ou de boisson énergisante en fin d’après-midi : la caféine perturbe le sommeil pendant 4 à 6 heures.',
        ]],
        ['Le reste', [
          'Les footings faciles du programme sont de la récupération active : ne les transforme pas en séances.',
          'Massage, rouleau de massage, bain froid : ils soulagent les sensations, sans effet prouvé sur la progression. Le bain froid, réserve-le aux lendemains de course.',
        ]],
      ],
      sources: ['acsm', 'issn'],
    },
    {
      id: 'etirements', title: 'Étirements et échauffement', lead: 'Avant : bouger. Après : s’étirer seulement si ça fait du bien.',
      body: [
        ['Avant de courir', [
          'Pas d’étirements statiques longs avant une séance rapide : ils n’empêchent pas les blessures et peuvent réduire la vivacité.',
          'À la place : 10 à 15 minutes de footing puis un échauffement dynamique (montées de genoux, talons-fesses, balancés de jambes).',
        ]],
        ['Après', [
          'Les étirements ne préviennent ni les blessures ni les courbatures (méta-analyse de 26 000 sportifs).',
          'Ils peuvent aider à se détendre et garder de la mobilité : 5 à 10 minutes doux, sans forcer, si tu aimes.',
        ]],
      ],
      routine: ['echauffement', 'retour-calme'],
      sources: ['lauersen'],
    },
    {
      id: 'renforcement', title: 'Renforcement musculaire', lead: 'La meilleure prévention connue : jusqu’à trois fois moins de blessures.',
      body: [
        ['Pourquoi', [
          'Dans la grande méta-analyse de Lauersen (26 610 sportifs), le renforcement musculaire réduit les blessures d’environ deux tiers. Les étirements, eux, n’ont pas d’effet.',
          'Mollets, fessiers et gainage protègent tendons, genoux et dos, et rendent la foulée plus économique.',
        ]],
        ['Comment', [
          '2 séances de 10 à 15 minutes par semaine, après un footing facile ou un jour sans course. Un tour pour commencer, deux ensuite.',
          'Jamais la veille d’une séance dure ni dans les 3 jours avant une course.',
        ]],
      ],
      routine: ['renforcement'],
      sources: ['lauersen'],
    },
    {
      id: 'blessures', title: 'Douleurs et blessures', lead: 'Savoir quand continuer, et quand s’arrêter.',
      body: [
        ['Arrête-toi et fais-toi examiner si', [
          'la douleur augmente pendant la course, ou t’oblige à modifier ta foulée ;',
          'elle est encore là le lendemain matin, ou dure plus de 2 jours ;',
          'il y a un gonflement, une douleur précise sur un os, ou une douleur la nuit.',
        ]],
        ['Les courbatures, c’est normal', [
          'Une gêne musculaire diffuse 24 à 48 heures après une séance nouvelle est normale : un footing très facile aide.',
          'Une douleur, elle, ne se « soigne » pas en courant plus.',
        ]],
        ['Reprendre', [
          'Après un arrêt, reprends plus bas que là où tu t’étais arrêté, puis augmente progressivement : Foulée peut te recréer un programme « Reprendre ».',
        ]],
      ],
    },
    {
      id: 'cafeine', title: 'Café et performance', lead: 'Un vrai coup de pouce les jours de course, à tester d’abord à l’entraînement.',
      body: [
        ['Ce qui marche', [
          `Dose efficace : ${range(3, 6, 'mg')} de caféine, environ 1 heure avant. Un expresso contient environ 60 à 100 mg.`,
          'Une dose plus faible (1 à 3 mg par kg) aide déjà, avec moins d’effets indésirables.',
        ]],
        ['Les précautions', [
          'Essaie-le d’abord avant une séance dure, jamais pour la première fois le jour de la course.',
          'À éviter si tu es anxieux, sujet aux palpitations, ou si la course est en fin de journée (sommeil).',
          'En cas de problème cardiaque ou de traitement, demande l’avis de ton médecin.',
        ]],
      ],
      sources: ['issn'],
    },
  ];
}

/* =========================================================================
   Conseils pour une séance
   ========================================================================= */

export function sessionTips(s) {
  const min = Math.round(totalTime(s.steps) / 60);
  const hard = s.type === 'qualite' || s.type === 'test' || s.type === 'objectif';
  const long = s.type === 'longue' || min >= 75;
  const tips = { before: [], during: [], after: [], routines: [] };

  if (s.type === 'objectif') return null; // la course a son propre guide

  if (hard || long) {
    tips.before.push('Repas 2 à 3 heures avant, riche en glucides et léger en graisses, ou une banane 30 à 60 minutes avant.');
  } else {
    tips.before.push('Footing facile : à jeun possible si tu le supportes, sinon une petite collation.');
  }
  if (hard) tips.routines.push(['echauffement', 'Après le footing d’échauffement : 6 minutes d’éducatifs']);

  if (min >= 75) {
    tips.during.push(`Prends de l’eau et ${min >= 90 ? '30 à 60 g de glucides par heure (un gel, une boisson d’effort ou 2 à 3 dattes toutes les 30 à 45 minutes)' : 'éventuellement un gel ou quelques dattes après une heure'}. Profites-en pour tester ce que tu prendras en course.`);
  } else if (min >= 55) {
    tips.during.push('Rien d’obligatoire : de l’eau seulement s’il fait chaud.');
  }

  if (hard || long) {
    tips.after.push(`Dans l’heure : glucides (${perKg(1)}) et protéines (${perKg(0.3)}). Par exemple un grand verre de lait chocolaté, ou yaourt, banane et pain.`);
    tips.routines.push(['retour-calme', '8 minutes de retour au calme']);
  } else {
    tips.after.push('Un repas normal suffit.');
  }
  if (s.note?.includes('renforcement') || s.type === 'facile') tips.routines.push(['renforcement', 'Renforcement du coureur']);
  return tips;
}

export function sessionTipsHTML(s) {
  const t = sessionTips(s);
  if (!t) return `<a class="tip-card tip-race" href="#/jour-j"><span class="tip-title">Guide du jour J</span><span>Derniers jours, repas, échauffement, allure, ravitaillement.</span></a>`;
  const block = (title, list) => (list.length ? `<div class="tip-block"><h3>${title}</h3><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
  return `
    <section class="tips">
      <h2 class="section-title">Conseils pour cette séance</h2>
      ${block('Avant', t.before)}
      ${block('Pendant', t.during)}
      ${block('Après', t.after)}
      ${t.routines.length ? `<div class="tip-routines">${t.routines.map(([id, label]) => `<a class="btn btn-small" href="#/routine/${id}">${esc(label)}</a>`).join('')}</div>` : ''}
    </section>`;
}

/* =========================================================================
   Guide du jour J
   ========================================================================= */

export function raceSession() {
  return allSessions().find((s) => s.type === 'objectif') || null;
}

export function viewJourJ(today) {
  const plan = store.plan;
  const race = raceSession();
  const dist = race?.testDist || plan?.goal?.distance || 5000;
  const goalPace = plan?.coach?.goalPace || (race?.repere ? race.repere / (dist / 1000) : null);
  const long = dist >= 21097;
  const marathon = dist >= 42195;
  const days = race ? daysBetween(today, race.date) : null;
  const w = kg();

  const splits = goalPace ? (() => {
    const marks = [];
    const step = dist <= 5000 ? 1000 : dist <= 10000 ? 1000 : 5000;
    for (let m = step; m < dist; m += step) marks.push(m);
    marks.push(dist);
    return `<ol class="split-list">${marks.map((m) => `<li><span>${m === dist ? 'Arrivée' : fmtDist(m)}</span><span>${clock((m / 1000) * goalPace)}</span></li>`).join('')}</ol>`;
  })() : '';

  const sec = (title, items) => `<section class="jj-block"><h2 class="section-title">${title}</h2><ul>${items.filter(Boolean).map((x) => `<li>${x}</li>`).join('')}</ul></section>`;

  return `
    <a class="back" href="#/conseils" data-back>Conseils</a>
    <h1 class="page-title">Jour J</h1>
    <p class="lede">${race ? `${esc(race.title.replace('Objectif : ', ''))}${days !== null && days >= 0 ? `, ${days === 0 ? 'c’est aujourd’hui' : days === 1 ? 'demain' : `dans ${days} jours`}` : ''}.` : 'Ton guide pour la course.'} Rien de nouveau le jour J : tout ce que tu fais a été testé à l’entraînement.</p>

    ${sec('La semaine d’avant', [
      'Le programme réduit le volume, pas l’intensité : suis-le, et résiste à l’envie d’en rajouter.',
      'Dors bien deux nuits avant : la dernière nuit compte moins, le stress est normal.',
      'Prépare tout la veille : dossard, épingles, tenue testée, chaussures déjà portées, montre chargée.',
    ])}

    ${sec(long ? 'La recharge en glucides' : 'Les repas des derniers jours', long ? [
      `Les ${marathon ? '2 jours' : '1 à 2 jours'} avant : ${range(marathon ? 10 : 8, marathon ? 12 : 10)} de glucides par jour. Pâtes, riz, pain, pommes de terre, jus de fruits.`,
      'Réduis en même temps les fibres et les graisses pour alléger la digestion.',
      'Prendre 1 à 2 kg pendant la recharge est normal : c’est de l’eau stockée avec les glucides.',
    ] : [
      'Pas de recharge spéciale pour un 3, 5 ou 10 km : elle ne sert que pour les courses de plus de 90 minutes.',
      'La veille, un repas normal, plutôt riche en glucides, sans excès ni plat inhabituel.',
    ])}

    ${sec('Le matin', [
      long
        ? `Petit-déjeuner 3 heures avant : ${w ? `${Math.round((w * 2) / 10) * 10} à ${Math.round((w * 3) / 10) * 10} g` : '2 à 3 g par kg'} de glucides que tu connais (pain, confiture, miel, flocons d’avoine, banane), peu de fibres et de graisses.`
        : 'Petit-déjeuner habituel et léger, 2 à 3 heures avant (pain, confiture ou miel, une banane) : pour une course courte, pas besoin de manger plus.',
      'Un grand verre d’eau au réveil, puis par petites gorgées jusqu’à une heure avant.',
      `Café si tu l’as testé à l’entraînement : ${perKg(3, 'mg', 10)} de caféine une heure avant le départ (un expresso ≈ 80 mg). Si tu n’en bois pas d’habitude, ${perKg(1.5, 'mg', 10)} suffisent.`,
    ])}

    ${sec('L’échauffement', marathon ? [
      '5 à 10 minutes de marche et de trot très léger : le début de course fera le reste.',
    ] : long ? [
      '10 minutes de footing très facile, quelques éducatifs, 2 accélérations.',
    ] : [
      '15 minutes de footing facile, puis la routine d’échauffement dynamique (6 min) et 3 à 4 accélérations jusqu’à l’allure de course.',
      'Termine 10 minutes avant le départ et garde-toi au chaud.',
    ])}

    <section class="jj-block">
      <h2 class="section-title">L’allure</h2>
      <ul>
        <li>${goalPace ? `Allure objectif : <strong>${clock(goalPace)}/km</strong>.` : 'Pars à une allure où tu te sens presque trop à l’aise.'} Le premier kilomètre, 5 à 10 secondes plus lent : l’euphorie du départ coûte cher à la fin.</li>
        <li>Régulier au milieu, puis tout donner sur le dernier ${dist <= 5000 ? 'kilomètre' : dist <= 10000 ? '2 kilomètres' : '5 kilomètres'}.</li>
      </ul>
      ${splits ? `<h3 class="sub-title">Temps de passage</h3>${splits}` : ''}
    </section>

    ${sec('Pendant la course', dist <= 10000 ? [
      'Rien à manger. De l’eau au ravitaillement seulement s’il fait chaud.',
    ] : marathon ? [
      'Glucides : 60 à 90 g par heure, soit un gel toutes les 20 à 30 minutes dès la première demi-heure, avec quelques gorgées d’eau.',
      'Bois selon la soif à chaque ravitaillement, sans forcer.',
      'Uniquement des gels et boissons testés pendant tes sorties longues.',
    ] : [
      'Glucides : 30 à 60 g par heure, par exemple un gel vers le 8e et le 15e kilomètre, avec de l’eau.',
      'Bois selon la soif aux ravitaillements.',
    ])}

    ${sec('Après', [
      `Dans l’heure : boisson, glucides (${perKg(1)}) et protéines (${perKg(0.3)}).`,
      'Marche 10 minutes plutôt que de t’asseoir tout de suite.',
      marathon ? 'Les 1 à 2 semaines suivantes : repos puis reprise très douce. Le corps a besoin de récupérer, même si les jambes vont mieux.' : 'Le lendemain : repos ou 20 minutes très faciles. Puis tu choisis ton prochain objectif !',
    ])}

    ${!w ? '<p class="hint">Indique ton poids dans Conseils pour des quantités précises.</p>' : ''}
    <p class="hint">Repères généraux pour des adultes en bonne santé, ce ne sont pas des conseils médicaux.</p>
    <p class="sources">Sources : ${['gssi', 'fluid', 'issn'].map((k) => `<a href="${SOURCES[k][1]}" target="_blank" rel="noopener">${SOURCES[k][0]}</a>`).join(' · ')}</p>`;
}

/* =========================================================================
   Écrans
   ========================================================================= */

export function viewConseils(today, routines) {
  const race = raceSession();
  const days = race ? daysBetween(today, race.date) : null;
  return `
    <a class="back" href="#/course" data-back>Courir</a>
    <h1 class="page-title">Conseils</h1>
    <p class="lede">Ce qui marche vraiment, d’après les recommandations scientifiques, sans les idées reçues.</p>

    ${race ? `<a class="tip-card tip-race" href="#/jour-j"><span class="tip-title">Guide du jour J</span><span>${days !== null && days >= 0 ? `Ta course : ${days === 0 ? 'aujourd’hui' : days === 1 ? 'demain' : `dans ${days} jours`}. ` : ''}Recharge, repas, échauffement, allure et temps de passage.</span></a>` : ''}

    <h2 class="section-title">Routines guidées</h2>
    <ul class="hub">
      ${routines.map((r) => `<li><a class="hub-card t-${r.tone}" href="#/routine/${r.id}"><span class="hub-title">${esc(r.title)}</span><span class="hub-text">${esc(r.when)} · ${Math.round(r.total / 60)} min</span></a></li>`).join('')}
    </ul>

    <h2 class="section-title">À lire</h2>
    <ul class="articles">
      ${articles().map((a) => `<li><a href="#/conseil/${a.id}"><span class="art-title">${esc(a.title)}</span><span class="art-lead">${esc(a.lead)}</span></a></li>`).join('')}
    </ul>

    <section class="panel">
      <h2>Ton poids (facultatif)</h2>
      <p>Pour transformer « grammes par kilo » en quantités précises. Il reste sur ce téléphone.</p>
      <label class="field weight-field"><span class="unit-input"><input data-weight inputmode="decimal" autocomplete="off" value="${kg() ?? ''}" aria-label="Poids en kilos"><em>kg</em></span></label>
    </section>
    <p class="hint">Repères généraux pour des adultes en bonne santé. En cas de maladie, de traitement ou de grossesse, demande l’avis d’un professionnel de santé.</p>`;
}

export function viewArticle(id) {
  const a = articles().find((x) => x.id === id);
  if (!a) return '<p class="lede">Ce conseil n’existe pas. <a href="#/conseils">Retour</a></p>';
  return `
    <a class="back" href="#/conseils" data-back>Conseils</a>
    <h1 class="page-title">${esc(a.title)}</h1>
    <p class="lede">${esc(a.lead)}</p>
    ${a.body.map(([h, items]) => `<section class="jj-block"><h2 class="section-title">${esc(h)}</h2><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')}
    ${a.routine ? `<div class="form-actions">${a.routine.map((r) => `<a class="btn btn-primary" href="#/routine/${r}">Lancer la routine</a>`).join('')}</div>` : ''}
    ${a.body.some(([, items]) => items.some((x) => /par kg/.test(x))) && !kg() ? '<p class="hint">Indique ton poids dans Conseils pour des quantités précises.</p>' : ''}
    ${a.sources ? `<p class="sources">Sources : ${a.sources.map((k) => `<a href="${SOURCES[k][1]}" target="_blank" rel="noopener">${SOURCES[k][0]}</a>`).join(' · ')}</p>` : ''}`;
}

// Petit conseil sur l'écran Aujourd'hui, lié à la prochaine séance
export function todayTip(next, today) {
  const race = raceSession();
  if (race) {
    const d = daysBetween(today, race.date);
    if (d >= 0 && d <= 7) return `<a class="tip-card tip-race" href="#/jour-j"><span class="tip-title">${d === 0 ? 'C’est le jour J' : d === 1 ? 'Course demain' : `Course dans ${d} jours`}</span><span>Ton guide : repas, échauffement, allure, temps de passage.</span></a>`;
  }
  if (!next) return '';
  const min = Math.round(totalTime(next.steps) / 60);
  let text;
  if (next.type === 'qualite' || next.type === 'test') text = 'Séance dure : mange 2 à 3 heures avant, et fais les éducatifs après ton footing d’échauffement.';
  else if (min >= 75) text = 'Sortie longue : emporte de l’eau, et teste ce que tu mangeras en course.';
  else text = 'Footing facile : si tu peux parler, tu es à la bonne allure. Ajoute la routine de renforcement après, deux fois par semaine.';
  return `<a class="tip-card" href="#/seance/${next.id}"><span class="tip-title">Conseil</span><span>${esc(text)}</span></a>`;
}

export function saveWeight(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  store.saveTools({ weight: Number.isFinite(n) && n >= 35 && n <= 160 ? Math.round(n * 10) / 10 : null });
}
