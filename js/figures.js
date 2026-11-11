// Schémas des exercices : un personnage dessiné en aplats de couleur, dans la position à tenir.
// Chaque pose donne les articulations (tête, épaules, bassin, coudes, mains, genoux, chevilles, pointes)
// dans un cadre de 200 × 120, sol à y = 104. Le membre le plus loin de l'œil est dessiné plus clair.

const G = 104; // sol

// h tête · s épaules · p bassin · a1/a2 bras [coude, main] · l1/l2 jambes [genou, cheville, pointe]
// Le 1 est le membre au premier plan. props : mur, marche, flèches, tapis.
const POSES = {
  'Montées de genoux': {
    h: [101, 13], s: [100, 25], p: [100, 56],
    a1: [[91, 39], [86, 52]], a2: [[110, 37], [119, 27]],
    l1: [[121, 54], [120, 78], [129, 80]], l2: [[99, 80], [98, 100], [107, 103]],
    props: [['arrow', 132, 70, 132, 52]],
  },
  'Talons-fesses': {
    h: [106, 13], s: [103, 25], p: [100, 56],
    a1: [[112, 38], [120, 30]], a2: [[94, 39], [88, 51]],
    l1: [[103, 80], [88, 70], [83, 63]], l2: [[101, 80], [100, 100], [109, 103]],
    props: [['arc', 76, 86, 70, 72, 80, 62]],
  },
  'Pas chassés': {
    h: [100, 14], s: [100, 26], p: [100, 57],
    a1: [[84, 35], [72, 45]], a2: [[116, 35], [128, 45]],
    l1: [[85, 79], [75, 100], [68, 103]], l2: [[115, 79], [125, 100], [132, 103]],
    front: true, props: [['arrow', 140, 80, 162, 80], ['arrow', 60, 80, 38, 80]],
  },
  'Balancés de jambe avant-arrière': {
    h: [86, 13], s: [85, 25], p: [85, 56],
    a1: [[79, 39], [74, 52]], a2: [[105, 31], [132, 31]],
    l1: [[104, 72], [121, 86], [129, 82]], l2: [[85, 80], [85, 100], [94, 103]],
    props: [['wall', 134], ['arc', 60, 90, 84, 112, 118, 98]],
  },
  'Balancés de jambe sur le côté': {
    h: [92, 14], s: [92, 26], p: [92, 57],
    a1: [[80, 34], [84, 44]], a2: [[104, 34], [100, 44]],
    l1: [[90, 80], [89, 100], [83, 103]], l2: [[112, 74], [130, 88], [137, 87]],
    front: true, props: [['arc', 108, 100, 130, 108, 146, 92]],
  },
  'Fentes marchées': {
    h: [100, 26], s: [100, 38], p: [99, 70],
    a1: [[92, 54], [101, 64]], a2: [[106, 53], [112, 63]],
    l1: [[123, 73], [122, 100], [131, 103]], l2: [[86, 95], [66, 92], [62, 101]],
    props: [['arrow', 140, 60, 160, 60]],
  },
  'Foulées bondissantes': {
    h: [111, 9], s: [107, 20], p: [100, 50],
    a1: [[96, 30], [86, 22]], a2: [[118, 30], [128, 38]],
    l1: [[124, 50], [122, 74], [131, 76]], l2: [[82, 66], [62, 78], [56, 85]],
    props: [['shadow', 96], ['arrow', 142, 44, 156, 30]],
  },
  'Accélérations progressives': {
    h: [114, 17], s: [109, 28], p: [98, 57],
    a1: [[98, 40], [88, 34]], a2: [[120, 40], [128, 30]],
    l1: [[119, 62], [114, 86], [123, 88]], l2: [[86, 76], [68, 70], [61, 76]],
    props: [['shadow', 100], ['speed', 30, 34], ['speed', 24, 52], ['speed', 34, 70]],
  },
  'Gainage ventral': {
    f: [0.6, 1], h: [154, 66], s: [141, 73], p: [96, 86],
    a1: [[141, 101], [159, 101]], a2: null,
    l1: [[68, 94], [45, 100], [43, 104]], l2: null,
    props: [['mat', 30, 172], ['guide', 44, 92, 150, 62]],
  },
  'Pont fessier': {
    f: [0.2, -1], h: [40, 96], s: [53, 99], p: [96, 76],
    a1: [[70, 101], [86, 101]], a2: null,
    l1: [[120, 68], [127, 100], [136, 103]], l2: null,
    props: [['mat', 26, 150], ['arrow', 96, 98, 96, 84]],
  },
  'Gainage latéral': {
    f: [1, 0.2], h: [151, 54], s: [139, 63], p: [92, 83],
    a1: [[139, 101], [154, 101]], a2: [[122, 58], [106, 70]],
    l1: [[66, 93], [43, 100], [41, 104]], l2: null,
    props: [['mat', 28, 170], ['arrow', 92, 100, 92, 90]],
  },
  Squats: {
    f: [1, 0.35], h: [107, 35], s: [102, 46], p: [88, 75],
    a1: [[118, 49], [134, 49]], a2: null,
    l1: [[114, 75], [108, 100], [118, 103]], l2: null,
    props: [['arrow', 74, 56, 74, 76]],
  },
  'Mollets sur une marche': {
    h: [94, 10], s: [94, 21], p: [94, 48],
    a1: [[100, 34], [112, 40]], a2: [[90, 35], [88, 48]],
    l1: [[94, 69], [92, 88], [101, 93]], l2: [[105, 66], [99, 80], [105, 85]],
    props: [['step', 97, 158, 94], ['arrow', 74, 84, 74, 68], ['arrow', 82, 68, 82, 84]],
  },
  'Fentes arrière': {
    h: [100, 26], s: [100, 38], p: [99, 70],
    a1: [[92, 54], [101, 64]], a2: [[106, 53], [112, 63]],
    l1: [[123, 73], [122, 100], [131, 103]], l2: [[86, 95], [66, 92], [62, 101]],
    props: [['arrow', 56, 78, 38, 78]],
  },
  'Pont sur une jambe': {
    f: [0.2, -1], h: [40, 96], s: [53, 99], p: [96, 76],
    a1: [[70, 101], [86, 101]], a2: null,
    l1: [[120, 68], [127, 100], [136, 103]], l2: [[119, 65], [142, 54], [149, 50]],
    props: [['mat', 26, 150], ['arrow', 96, 98, 96, 84]],
  },
  'Équilibre sur un pied': {
    h: [100, 13], s: [100, 25], p: [100, 56],
    a1: [[88, 38], [78, 48]], a2: [[112, 38], [122, 48]],
    l1: [[112, 72], [104, 88], [110, 93]], l2: [[101, 79], [99, 100], [108, 103]],
    props: [],
  },
  Marche: {
    h: [101, 13], s: [100, 25], p: [100, 56],
    a1: [[94, 40], [98, 53]], a2: [[105, 40], [100, 53]],
    l1: [[110, 79], [117, 100], [126, 103]], l2: [[93, 80], [81, 98], [89, 103]],
    props: [['arrow', 140, 60, 160, 60]],
  },
  Mollets: {
    h: [123, 24], s: [117, 34], p: [100, 62],
    a1: [[133, 39], [146, 33]], a2: null,
    l1: [[84, 82], [66, 100], [75, 103]], l2: [[121, 80], [123, 100], [132, 103]],
    props: [['wall', 149], ['zone', 74, 90]],
  },
  Quadriceps: {
    h: [100, 13], s: [100, 25], p: [100, 56],
    a1: [[92, 44], [89, 66]], a2: [[110, 38], [121, 44]],
    l1: [[102, 81], [88, 69], [82, 64]], l2: [[100, 80], [100, 100], [109, 103]],
    props: [['zone', 101, 68]],
  },
  'Ischio-jambiers': {
    f: [1, 0.8], h: [125, 36], s: [115, 43], p: [92, 60],
    a1: [[119, 57], [126, 69]], a2: null,
    l1: [[112, 77], [132, 92], [135, 84]], l2: [[90, 82], [88, 100], [97, 103]],
    props: [['step', 124, 152, 94], ['zone', 104, 76]],
  },
  Fessiers: {
    f: [0.2, -1], h: [44, 96], s: [57, 99], p: [100, 98],
    a1: [[80, 87], [107, 77]], a2: null,
    l1: [[123, 85], [112, 70], [107, 64]], l2: [[110, 69], [134, 71], [138, 63]],
    props: [['mat', 30, 150], ['zone', 110, 92]],
  },
  'Fléchisseurs de hanche': {
    h: [99, 28], s: [99, 40], p: [98, 72],
    a1: [[91, 56], [99, 66]], a2: [[105, 55], [111, 65]],
    l1: [[122, 76], [121, 100], [130, 103]], l2: [[84, 101], [62, 100], [56, 103]],
    props: [['mat', 44, 140], ['arrow', 100, 86, 114, 86], ['zone', 92, 80]],
  },
  Respiration: {
    f: [0.2, -1], h: [44, 96], s: [57, 99], p: [100, 99],
    a1: [[74, 90], [88, 93]], a2: null,
    l1: [[124, 99], [148, 99], [150, 91]], l2: null,
    props: [['mat', 30, 164], ['breath', 84, 80]],
  },
};

/* ---------- Dessin : personnage en aplats (peau, haut, corsaire, baskets) ---------- */

const C = {
  skin: '#F0B088', skinFar: '#D9966E', top: '#16A974', topFar: '#11895E',
  legs: '#2B3654', legsFar: '#465377', shoe: '#E8474C', shoeFar: '#C43A3F', hair: '#4B2E22',
  mat: '#9CCBF0', ground: '#D3DAE6', prop: '#8A96AB', arrow: '#0B9A64', zone: '#F59E0B',
};

const seg = (a, b, color, w) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
const dot = (c, r, color) => `<circle cx="${c[0]}" cy="${c[1]}" r="${r}" fill="${color}"/>`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function arrowHead(x1, y1, x2, y2) {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 6;
  const w = (d) => `${(x2 - L * Math.cos(a + d)).toFixed(1)},${(y2 - L * Math.sin(a + d)).toFixed(1)}`;
  return `<polyline points="${w(0.5)} ${x2},${y2} ${w(-0.5)}" fill="none" stroke="${C.arrow}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function prop(p) {
  const [k, a, b, c, d, e, f] = p;
  const arrowStyle = `fill="none" stroke="${C.arrow}" stroke-width="2.8" stroke-linecap="round"`;
  if (k === 'wall') return `<rect x="${a}" y="6" width="9" height="${G - 6}" rx="2" fill="#DDE3EC"/><line x1="${a}" y1="6" x2="${a}" y2="${G}" stroke="${C.prop}" stroke-width="2"/>`;
  if (k === 'step') return `<path d="M${a} ${G}V${c + 3}a3 3 0 0 1 3 -3H${b - 3}a3 3 0 0 1 3 3V${G}z" fill="#C9D2E0"/><line x1="${a + 1}" y1="${c}" x2="${b - 1}" y2="${c}" stroke="${C.prop}" stroke-width="2.4" stroke-linecap="round"/>`;
  if (k === 'mat') return `<polygon points="${a + 9},${G - 3} ${b - 9},${G - 3} ${b},${G + 5} ${a},${G + 5}" fill="${C.mat}"/>`;
  if (k === 'shadow') return `<ellipse cx="${a}" cy="${G}" rx="24" ry="3.2" fill="#C9D2E0"/>`;
  if (k === 'arrow') return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" ${arrowStyle}/>${arrowHead(a, b, c, d)}`;
  if (k === 'arc') return `<path d="M${a} ${b}Q${c} ${d} ${e} ${f}" ${arrowStyle}/>${arrowHead(c, d, e, f)}${arrowHead(c, d, a, b)}`;
  if (k === 'speed') return `<line x1="${a}" y1="${b}" x2="${a + 26}" y2="${b}" stroke="${C.prop}" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>`;
  if (k === 'guide') return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${C.arrow}" stroke-width="2" stroke-dasharray="3 5" stroke-linecap="round"/>`;
  if (k === 'zone') return `<circle cx="${a}" cy="${b}" r="10" fill="${C.zone}" opacity=".3"/><circle cx="${a}" cy="${b}" r="10" fill="none" stroke="${C.zone}" stroke-width="1.6" stroke-dasharray="2.5 3.5"/>`;
  if (k === 'breath') return `<path d="M${a} ${b}v-12M${a + 12} ${b + 2}v-10M${a - 12} ${b + 2}v-10" ${arrowStyle}/>`;
  return '';
}

function leg(root, parts, far) {
  if (!parts) return '';
  const [knee, ankle, toe] = parts;
  const calf = mix(knee, ankle, 0.22); // le corsaire descend un peu sous le genou
  return seg(knee, ankle, far ? C.skinFar : C.skin, 7.6)
    + seg(root, knee, far ? C.legsFar : C.legs, 11.5)
    + seg(knee, calf, far ? C.legsFar : C.legs, 9.4)
    + seg(ankle, toe, far ? C.shoeFar : C.shoe, 6.6)
    + dot(ankle, 3.9, far ? C.shoeFar : C.shoe);
}

function arm(root, parts, far) {
  if (!parts) return '';
  const [elbow, hand] = parts;
  const skin = far ? C.skinFar : C.skin;
  return seg(root, elbow, skin, 7) + seg(elbow, hand, skin, 6) + dot(hand, 3.6, skin);
}

function head(P) {
  // Direction du visage : la chevelure couvre l'arrière du crâne, une queue de cheval part à l'opposé
  const f = P.f || (P.front ? [0, 1] : [1, 0.25]);
  const n = Math.hypot(f[0], f[1]) || 1;
  const u = [f[0] / n, f[1] / n];
  const h = P.h;
  const face = [h[0] + u[0] * 2.4, h[1] + u[1] * 2.4];
  const tail = P.front ? '' : seg([h[0] - u[0] * 6.5, h[1] - u[1] * 6.5 - 1], [h[0] - u[0] * 13 + u[1] * 3, h[1] - u[1] * 13 + Math.abs(u[0]) * 6], C.hair, 4.4);
  return `${tail}${dot(h, 8.2, C.hair)}${dot(face, 6.6, C.skin)}`;
}

function draw(P) {
  const neck = mix(P.s, P.h, 0.45);
  const waist = mix(P.s, P.p, 0.74);
  const back = (P.props || []).filter((p) => !['arrow', 'arc', 'breath', 'guide', 'zone'].includes(p[0]));
  const front = (P.props || []).filter((p) => ['arrow', 'arc', 'breath', 'guide', 'zone'].includes(p[0]));
  const hasMat = back.some((p) => p[0] === 'mat');
  return `
    ${hasMat ? '' : `<line x1="16" y1="${G + 1}" x2="184" y2="${G + 1}" stroke="${C.ground}" stroke-width="2.4" stroke-linecap="round"/>`}
    ${back.map(prop).join('')}
    ${leg(P.p, P.l2, true)}${arm(P.s, P.a2, true)}
    ${seg(P.s, neck, C.skin, 5.6)}
    ${seg(P.s, waist, C.top, 15)}${seg(waist, P.p, C.legs, 14.6)}
    ${leg(P.p, P.l1, false)}
    ${head(P)}
    ${arm(P.s, P.a1, false)}
    ${front.map(prop).join('')}`;
}

// Nom d'exercice → pose. « …, côté gauche » et « … gauche » donnent la figure en miroir.
function lookup(name) {
  const left = /gauche\s*$/.test(name);
  const base = name.replace(/,\s*côté (droit|gauche)$/, '').replace(/\s+(droit|gauche)$/, '');
  return { P: POSES[base] || null, left };
}

export function hasFigure(name) { return !!lookup(name).P; }

export function figure(name, cls = '') {
  const { P, left } = lookup(name);
  if (!P) return '';
  // Cadre resserré sur la figure : les positions au sol ne laissent pas un grand vide au-dessus
  const ys = [P.h[1] - 8, P.s[1], P.p[1], ...[P.a1, P.a2, P.l1, P.l2].filter(Boolean).flat().map((q) => q[1])];
  const tall = (P.props || []).some((q) => q[0] === 'wall');
  const y0 = tall ? 0 : Math.max(0, Math.min(40, Math.min(...ys) - 12));
  return `<svg class="fig ${cls}" viewBox="0 ${y0} 200 ${112 - y0}" role="img" aria-label="Position : ${name.replace(/"/g, '')}">${left ? `<g transform="translate(200 0) scale(-1 1)">${draw(P)}</g>` : draw(P)}</svg>`;
}

export const FIGURE_NAMES = Object.keys(POSES);
