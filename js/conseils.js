// Conseils : bibliothèque, conseils adaptés à chaque séance, guide du jour J.
// Repères tirés des positions officielles (ACSM / Academy of Nutrition and Dietetics / Dietitians of Canada,
// GSSI, ISSN) et des méta-analyses sur la prévention des blessures. Ce ne sont pas des conseils médicaux.
import { store, allSessions } from './store.js';
import { totalTime } from './steps.js';
import { clock, daysBetween, esc, distance as fmtDist } from './util.js';
import {
  foodProfile, recovery, preSnack, preMeal, raceBreakfast, loadingDay, proteinServing, coffee, hydration, portionNote,
} from './foods.js';

const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

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
        ['Les féculents, selon la journée', [
          'Jour de repos ou footing court : un quart de l’assiette en féculents (pâtes, riz, pommes de terre, pain).',
          'Jour de séance classique : un tiers de l’assiette.',
          'Veille et jour de séance dure ou de sortie longue : la moitié de l’assiette.',
          'Le reste de l’assiette : des légumes et une portion de protéines.',
        ]],
        ['Une portion de protéines à chaque repas', [
          `${cap(proteinServing())}.`,
          'Au petit-déjeuner aussi : un yaourt, un œuf ou un verre de lait comptent déjà.',
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
        ['Avant une séance dure', [
          `${cap(preMeal().label)} : ${preMeal().main}${preMeal().alt ? `. Si tu cours le matin : ${preMeal().alt}` : ''}.`,
          'Peu de gras et de fibres juste avant (pas de friture, de crudités ou de légumes secs en grande quantité).',
        ]],
        ['La collation', [
          `30 à 60 minutes avant, si tu as faim : ${preSnack()}.`,
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
          'Plus d’une heure : bois selon la soif, quelques gorgées toutes les 15 à 20 minutes (un demi-litre à trois quarts de litre par heure, selon la chaleur).',
          `Repère : ne perds pas plus de ${hydration().maxLoss} kg pendant une sortie, mais ne finis jamais plus lourd qu’au départ (trop boire est dangereux).`,
        ]],
        ['Après', [
          `Pèse-toi avant et après une sortie longue : chaque kilo perdu se compense par ${hydration().perKg} sur les heures suivantes.`,
          'Par forte chaleur ou si tu transpires beaucoup (traces blanches sur la casquette), sale un peu plus le repas ou prends une boisson d’effort.',
        ]],
      ],
      sources: ['fluid'],
    },
    {
      id: 'recuperation', title: 'Récupérer', lead: 'Le progrès se fait pendant le repos : sommeil, repas, séances faciles.',
      body: [
        ['Dans l’heure qui suit une séance dure', [
          `En collation : ${recovery().snack}.`,
          `Ou, si c’est l’heure du repas : ${recovery().meal}.`,
          'De quoi recharger les muscles (les glucides) et les réparer (les protéines). Après un footing facile, un repas normal suffit.',
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
          coffee() ? `Pour toi : ${coffee()}, environ 1 heure avant une course ou une séance dure.` : 'Tu ne bois pas de café : inutile de commencer pour la course, il risque surtout de te nouer l’estomac.',
          'Un café filtre ou un thé fort marchent aussi ; les boissons énergisantes contiennent souvent beaucoup de sucre en plus.',
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
    const m = preMeal();
    tips.before.push(`${cap(m.label)} : ${m.main}.`);
    tips.before.push(`Ou, 30 à 60 minutes avant : ${preSnack()}.`);
  } else {
    tips.before.push(foodProfile().moment === 'matin'
      ? 'Footing facile le matin : à jeun possible si tu le supportes, sinon une banane.'
      : 'Footing facile : pas besoin de manger spécialement avant.');
  }
  if (hard) tips.routines.push(['echauffement', 'Après le footing d’échauffement : 6 minutes d’éducatifs']);

  if (min >= 75) {
    tips.during.push(`Prends de l’eau et ${min >= 90 ? '30 à 60 g de glucides par heure (un gel, une boisson d’effort ou 2 à 3 dattes toutes les 30 à 45 minutes)' : 'éventuellement un gel ou quelques dattes après une heure'}. Profites-en pour tester ce que tu prendras en course.`);
  } else if (min >= 55) {
    tips.during.push('Rien d’obligatoire : de l’eau seulement s’il fait chaud.');
  }

  if (hard || long) {
    tips.after.push(`Dans l’heure : ${recovery().snack}. Ou un repas : ${recovery().meal}.`);
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
  const cafe = coffee();

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

    ${long ? `<section class="jj-block">
      <h2 class="section-title">La recharge en glucides</h2>
      <p>Les ${marathon ? '2 jours' : 'deux derniers jours'} avant la course, une journée type :</p>
      <dl class="menu">${loadingDay(marathon ? 10 : 8).map(([l, t]) => `<div><dt>${l}</dt><dd>${esc(cap(t))}</dd></div>`).join('')}</dl>
      <ul>
        <li>Peu de légumes, de crudités et de légumes secs ces jours-là : moins de fibres, digestion plus légère.</li>
        <li>Trop copieux ? Remplace une partie des féculents par du jus ou du sirop.</li>
        <li>Prendre 1 à 2 kg est normal : c’est de l’eau stockée avec les glucides.</li>
      </ul>
    </section>` : sec('Les repas des derniers jours', [
      'Pas de recharge spéciale pour un 3, 5 ou 10 km : elle ne sert que pour les courses de plus de 90 minutes.',
      'La veille, un repas normal avec une bonne part de féculents (la moitié de l’assiette), sans excès ni plat inhabituel.',
    ])}

    ${sec('Le matin', [
      `Petit-déjeuner ${long ? '3 heures' : '2 à 3 heures'} avant : ${raceBreakfast(long)}. Des aliments que tu connais, peu de gras et de fibres.`,
      'Un grand verre d’eau au réveil, puis par petites gorgées jusqu’à une heure avant.',
      cafe ? `Café, si tu l’as testé à l’entraînement : ${cafe} une heure avant le départ.` : null,
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
      `Dans l’heure : de l’eau, puis ${recovery().snack}.`,
      'Marche 10 minutes plutôt que de t’asseoir tout de suite.',
      marathon ? 'Les 1 à 2 semaines suivantes : repos puis reprise très douce. Le corps a besoin de récupérer, même si les jambes vont mieux.' : 'Le lendemain : repos ou 20 minutes très faciles. Puis tu choisis ton prochain objectif !',
    ])}

    <p class="hint">${portionNote()}</p>
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

    ${profilePanel()}
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
    ${['alimentation', 'avant', 'hydratation', 'recuperation', 'cafeine'].includes(a.id) ? `<p class="hint">${portionNote()} <a href="#/conseils">Modifier mon profil</a></p>` : ''}
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

/* ---------- Profil alimentaire ---------- */

export function profileFields(pr) {
  const r = (v, l) => `<label><input type="radio" name="pf-regime" value="${v}" ${pr.regime === v ? 'checked' : ''} data-pref="regime"><span>${l}</span></label>`;
  const c = (k, l, on) => `<label class="pf-check"><input type="checkbox" data-pref="${k}" ${on ? 'checked' : ''}> ${l}</label>`;
  const m = (v, l) => `<label><input type="radio" name="pf-moment" value="${v}" ${pr.moment === v ? 'checked' : ''} data-pref="moment"><span>${l}</span></label>`;
  return `
    <label class="field weight-field"><span>Poids</span><span class="unit-input"><input data-pref="weight" inputmode="decimal" autocomplete="off" value="${pr.weight ?? ''}" aria-label="Poids en kilos"><em>kg</em></span></label>
    <div class="field"><span>Je mange</span><div class="segmented segmented-compact">${r('omni', 'De tout')}${r('vege', 'Végétarien')}${r('vegan', 'Végétalien')}</div></div>
    <div class="pf-checks">${c('noLactose', 'Sans lactose', pr.noLactose)}${c('noGluten', 'Sans gluten', pr.noGluten)}${c('coffee', 'Je bois du café', pr.coffee)}</div>
    <div class="field"><span>Je cours plutôt</span><div class="segmented segmented-compact">${m('matin', 'Matin')}${m('midi', 'Midi')}${m('soir', 'Soir')}${m('variable', 'Variable')}</div></div>`;
}

function profilePanel() {
  return `
    <section class="panel" data-profile>
      <h2>Mon profil</h2>
      <p>Pour des conseils en portions concrètes, adaptés à ton alimentation. Il reste sur ce téléphone.</p>
      ${profileFields(foodProfile())}
    </section>`;
}

// Lit un champ du profil et l'enregistre
export function savePref(el) {
  const t = store.tools;
  const diet = { ...(t.diet || {}) };
  const k = el.dataset.pref;
  if (k === 'weight') {
    const n = parseFloat(String(el.value).replace(',', '.'));
    store.saveTools({ weight: Number.isFinite(n) && n >= 35 && n <= 160 ? Math.round(n * 10) / 10 : null });
    return;
  }
  if (k === 'moment') { store.saveTools({ moment: el.value }); return; }
  if (k === 'regime') diet.regime = el.value;
  else if (k === 'coffee') diet.coffee = el.checked;
  else diet[k] = el.checked;
  store.saveTools({ diet });
}
