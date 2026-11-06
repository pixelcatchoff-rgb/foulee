// Cartes OpenStreetMap (Leaflet), chargées seulement quand un écran en a besoin.
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4';
let loading;

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  loading ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET}/leaflet.min.css`;
    document.head.append(css);
    const js = document.createElement('script');
    js.src = `${LEAFLET}/leaflet.min.js`;
    js.onload = () => resolve(window.L);
    js.onerror = () => { loading = null; reject(new Error('Carte indisponible (pas de réseau ?)')); };
    document.head.append(js);
  });
  return loading;
}

export async function createMap(el, { interactive = true } = {}) {
  const L = await loadLeaflet();
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: true,
    dragging: interactive,
    touchZoom: interactive,
    scrollWheelZoom: false,
    doubleClickZoom: interactive,
    boxZoom: false,
    keyboard: interactive,
  }).setView([46.6, 2.4], 5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);
  return { L, map };
}

export function trackLayer(L, map, latlngs = []) {
  const line = L.polyline(latlngs, { color: getComputedStyle(document.documentElement).getPropertyValue('--quality').trim() || '#E0A912', weight: 5, opacity: 0.95, lineJoin: 'round' }).addTo(map);
  return line;
}

export function meMarker(L, map) {
  return L.circleMarker([0, 0], {
    radius: 8, weight: 3, color: '#fff', fillColor: '#2C5872', fillOpacity: 1,
  }).addTo(map);
}

// Distance en mètres entre deux points (formule de haversine)
export function haversine(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
