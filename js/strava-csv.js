// Lecture du fichier activities.csv de l'archive Strava (export en français ou en anglais).
import { toISO } from './util.js';

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").trim();

// Strava répète certaines colonnes (Distance en km puis en m, Temps écoulé…) : on garde toutes les positions.
function indexer(header) {
  const map = new Map();
  header.forEach((h, i) => {
    const k = norm(h.replace(/^﻿/, ''));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  });
  return (names, which = 'first') => {
    for (const n of names) {
      const idx = map.get(norm(n));
      if (idx) return which === 'last' ? idx[idx.length - 1] : idx[0];
    }
    return -1;
  };
}

const MONTHS = {
  janv: 0, jan: 0, janvier: 0, fevr: 1, fev: 1, feb: 1, fevrier: 1, mars: 2, mar: 2, avr: 3, apr: 3, avril: 3,
  mai: 4, may: 4, juin: 5, jun: 5, juil: 6, jul: 6, juillet: 6, aout: 7, aug: 7, sept: 8, sep: 8, septembre: 8,
  oct: 9, octobre: 9, nov: 10, novembre: 10, dec: 11, decembre: 11,
};

// "6 nov. 2026, 10:23:32" ou "Nov 6, 2026, 10:23:32 AM". Strava exporte en UTC.
export function parseStravaDate(str) {
  const s = norm(str).replace(/\./g, '');
  let m = s.match(/^(\d{1,2}) ([a-z]+) (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?/);
  let day, mon, year, hh, mm, ss;
  if (m) { [, day, mon, year, hh, mm, ss] = m; } else {
    m = s.match(/^([a-z]+) (\d{1,2}),? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?(am|pm)?/);
    if (!m) {
      const d = new Date(str);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    [, mon, day, year, hh, mm, ss] = m;
    if (m[7] === 'pm' && +hh < 12) hh = +hh + 12;
    if (m[7] === 'am' && +hh === 12) hh = 0;
  }
  const month = MONTHS[mon] ?? MONTHS[mon.slice(0, 4)] ?? MONTHS[mon.slice(0, 3)];
  if (month === undefined) return null;
  return new Date(Date.UTC(+year, month, +day, +hh, +mm, +(ss || 0)));
}

const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const IS_RUN = /course|run|trail|footing|jog/i;

export function readStravaCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('Le fichier est vide.');
  const col = indexer(rows[0]);
  const c = {
    id: col(['ID de l\'activité', 'Activity ID']),
    date: col(['Date de l\'activité', 'Activity Date']),
    name: col(['Nom de l\'activité', 'Activity Name']),
    type: col(['Type d\'activité', 'Activity Type']),
    elapsed: col(['Temps écoulé', 'Elapsed Time']),
    moving: col(['Durée de déplacement', 'Moving Time']),
    distKm: col(['Distance']),
    distM: col(['Distance'], 'last'),
    hrMax: col(['Fréquence cardiaque max.', 'Max Heart Rate'], 'last'),
    hrAvg: col(['Fréquence cardiaque moyenne', 'Average Heart Rate']),
    elev: col(['Dénivelé positif', 'Elevation Gain']),
  };
  if (c.date < 0 || c.type < 0) throw new Error('Ce fichier ne ressemble pas à activities.csv de Strava.');

  const out = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    if (!IS_RUN.test(r[c.type] || '')) { skipped += 1; continue; }
    const d = parseStravaDate(r[c.date] || '');
    if (!d) { skipped += 1; continue; }
    let distance = c.distM !== c.distKm ? num(r[c.distM]) : null;
    if (!distance) distance = (num(r[c.distKm]) || 0) * 1000;
    if (!distance) { skipped += 1; continue; }
    const elapsed = num(r[c.elapsed]);
    const moving = num(r[c.moving]) || elapsed;
    out.push({
      id: `strava-${r[c.id] || d.getTime()}`,
      source: 'archive',
      name: r[c.name] || 'Course à pied',
      start: d.toISOString(),
      date: toISO(d), // date locale du téléphone
      distance: Math.round(distance),
      elapsed: elapsed ? Math.round(elapsed) : null,
      moving: moving ? Math.round(moving) : null,
      hrAvg: num(r[c.hrAvg]),
      hrMax: num(r[c.hrMax]),
      elev: num(r[c.elev]),
    });
  }
  return { runs: out, skipped };
}
