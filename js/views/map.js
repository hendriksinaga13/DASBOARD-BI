import { esc, compactRp, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { toast } from '../ui/feedback.js';

let mapInstance = null; 
let markersLayer = null;

// Database Koordinat (Latitude, Longitude) - Diperluas
const GEO_DB = {
  // JAWA
  'SURABAYA': [-7.2575, 112.7521], 'JAKARTA': [-6.2088, 106.8456], 'BANDUNG': [-6.9175, 107.6191],
  'SEMARANG': [-6.9667, 110.4167], 'YOGYAKARTA': [-7.7956, 110.3695], 'MALANG': [-7.9666, 112.6333],
  'SIDOARJO': [-7.4478, 112.7183], 'GRESIK': [-7.1554, 112.6556], 'MOJOKERTO': [-7.4722, 112.4338],
  'KEDIRI': [-7.8480, 112.0178], 'JEMBER': [-8.1681, 113.7022], 'BANYUWANGI': [-8.2192, 114.3691],
  'SERANG': [-6.1104, 106.1503], 'TANGERANG': [-6.1781, 106.6319], 'BEKASI': [-6.2383, 106.9756],
  'BOGOR': [-6.5971, 106.8060], 'DEPOK': [-6.4025, 106.7942], 'CIREBON': [-6.7320, 108.5523],
  'TASIKMALAYA': [-7.3195, 108.2208], 'SUKABUMI': [-6.9277, 106.9300], 'PURWOKERTO': [-7.4249, 109.2302],
  'SOLO': [-7.5755, 110.8243], 'MADIUN': [-7.6298, 111.5239], 'PROBOLINGGO': [-7.7543, 113.2159],
  'PASURUAN': [-7.6469, 112.9075], 'SIDOARJO': [-7.4478, 112.7183],
  
  // SUMATERA
  'MEDAN': [3.5952, 98.6722], 'PALEMBANG': [-2.9761, 104.7754], 'PADANG': [-0.9471, 100.4172],
  'PEKANBARU': [0.5071, 101.4478], 'BANDAR LAMPUNG': [-5.3971, 105.2668], 'JAMBI': [-1.6101, 103.6131],
  'BENGKULU': [-3.7928, 102.2608], 'BANDA ACEH': [5.5483, 95.3238], 'BATAM': [1.1301, 104.0529],
  
  // KALIMANTAN
  'BALIKPAPAN': [-1.2379, 116.8529], 'SAMARINDA': [-0.5022, 117.1536], 'BANJARMASIN': [-3.3186, 114.5944],
  'PONTIANAK': [-0.0263, 109.3425], 'PALANGKARAYA': [-2.2080, 113.9165], 'TARAKAN': [3.3273, 117.5797],
  
  // SULAWESI
  'MAKASSAR': [-5.1477, 119.4327], 'MANADO': [1.4748, 124.8421], 'PALU': [-0.8917, 119.8707],
  'KENDARI': [-3.9984, 122.5127], 'GORONTALO': [0.5435, 123.0568], 'MAMUJU': [-2.6743, 118.8884],
  
  // BALI & NUSA TENGGARA
  'DENPASAR': [-8.6705, 115.2126], 'MATARAM': [-8.5833, 116.1167], 'KUPANG': [-10.1772, 123.6070],
  
  // PAPUA & MALUKU
  'JAYAPURA': [-2.5916, 140.6690], 'AMBON': [-3.6954, 128.1814], 'SORONG': [-0.8762, 131.2558],
  'TIMIKA': [-4.5483, 136.8867], 'MERAUKE': [-8.4932, 140.4018]
};

function shell(){
  return `
    <div class="card" style="padding:0; overflow:hidden; border-radius:12px; position:relative; height: calc(100vh - 180px); min-height: 400px;">
      <div id="leaflet-map" style="height: 100%; width: 100%; z-index:1;"></div>
      
      <!-- Overlay Kontrol -->
      <div style="position:absolute; top:12px; right:12px; z-index:1000; background:rgba(255,255,255,0.95); padding:12px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.15); display:flex; flex-direction:column; gap:8px;">
        <div class="tiny" style="font-weight:800; color:#0F172A; text-transform:uppercase;">Tampilkan:</div>
        <select id="mapMetric" class="btn sm" style="padding:6px 10px; font-weight:700; font-size:12px; border:1px solid #E2E8F0; outline:none;">
          <option value="omset">Omset (Rp)</option>
          <option value="oa">Outlet Aktif (OA)</option>
        </select>
      </div>

      <!-- Legenda -->
      <div style="position:absolute; bottom:24px; left:12px; z-index:1000; background:rgba(255,255,255,0.95); padding:10px 12px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.15); font-size:11px;">
        <div style="font-weight:800; margin-bottom:6px; color:#0F172A;">Keterangan:</div>
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
          <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#3B82F6; opacity:0.6;"></span> Besar Omset
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#A78BFA; opacity:0.6;"></span> Jumlah Outlet
        </div>
      </div>
    </div>
  `;
}

function update(container, state){
  const metric = document.getElementById('mapMetric')?.value || 'omset';
  const rows = selectFiltered(state);
  
  // 1. Inisialisasi Peta (Hanya sekali)
  if (!mapInstance) {
    const mapEl = document.getElementById('leaflet-map');
    if (!mapEl) return;

    mapInstance = L.map('leaflet-map', { zoomControl: false }).setView([-2.548926, 118.0148634], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18
    }).addTo(mapInstance);
    L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);
    
    markersLayer = L.layerGroup().addTo(mapInstance);
  }

  // 2. Bersihkan Marker Lama
  markersLayer.clearLayers();

  if (rows.length === 0) return;

  // 3. Agregasi Data berdasarkan Kabupaten
  const kabGroups = groupBy(rows, r => r.kabupaten, metric).filter(g => g.label && g.label !== '—');
  
  let maxVal = 1;
  kabGroups.forEach(g => { if(g.value > maxVal) maxVal = g.value; });

  // 4. Plot ke Peta
  kabGroups.forEach(g => {
    const kabName = g.label.toUpperCase();
    let coords = GEO_DB[kabName];
    
    // Fallback: Jika tidak ada di DB, tebar secara acak di koordinat Indonesia
    if (!coords) {
      coords = [-2.5 + (Math.random() - 0.5) * 8, 118 + (Math.random() - 0.5) * 15];
    }

    const radius = 8 + (g.value / maxVal) * 25; // Min 8, Max 33
    const color = metric === 'omset' ? '#1D4ED8' : '#8B5CF6';
    const fillColor = metric === 'omset' ? '#3B82F6' : '#A78BFA';

    const marker = L.circleMarker(coords, {
      radius: radius, fillColor: fillColor, color: color,
      weight: 2, opacity: 1, fillOpacity: 0.6
    }).addTo(markersLayer);

    const valStr = metric === 'omset' ? compactRp(g.value) : NF1.format(g.value) + ' Outlet';
    const rawOmset = groupBy(g.rows, r=>'x', 'omset')[0]?.value || 0;
    const rawOA = groupBy(g.rows, r=>'x', 'oa')[0]?.value || 0;
    
    // Popup dengan Tombol Aksi (Drill-Down)
    marker.bindPopup(`
      <div style="font-family:system-ui; min-width:180px;">
        <div style="font-weight:800; font-size:14px; border-bottom:1px solid #E2E8F0; padding-bottom:6px; margin-bottom:6px; color:#0F172A;">${esc(g.label)}</div>
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
          <span style="color:#64748B">Omset:</span> <b style="color:#1D4ED8">${compactRp(rawOmset)}</b>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:12px;">
          <span style="color:#64748B">Outlet Aktif:</span> <b style="color:#8B5CF6">${rawOA}</b>
        </div>
        <button onclick="window._mapDrillDown('${esc(g.label)}')" style="width:100%; padding:8px; background:#1D4ED8; color:#fff; border:none; border-radius:6px; font-weight:700; cursor:pointer; font-size:11px;">
          Lihat Detail Outlet →
        </button>
      </div>
    `);
  });
}

// Fungsi Global untuk Drill-Down
window._mapDrillDown = function(kabupaten) {
  store.state.filters.kabupaten = new Set([kabupaten]);
  store.set({ view: 'outlet' });
  toast(`Filter diterapkan: ${kabupaten}`);
};

registerView('map', { 
  label: 'Peta Sebaran', 
  title: 'Peta Sebaran Wilayah', 
  sub: 'Visualisasi geografis performa sales', 
  shell, 
  update,
  mount() {
    document.addEventListener('change', (e) => {
      if (e.target.id === 'mapMetric') {
        store.emit(); 
      }
    });
  }
});