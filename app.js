/**
 * VEN-SISMO // Portal de Monitoreo Sísmico y Daños en Tiempo Real
 * Cobertura: Terremotos en el Caribe con foco principal en Venezuela.
 * Datos reales de USGS (PAGER, DYFI e Intensidad) y OpenStreetMap Overpass.
 * Proxy robusto integrado para la API de USGS sísmico, detalles PAGER, Overpass OSM y malla DYFI.
 */

// ── Estado de la Aplicación ──────────────────────────────────────────────────
const state = {
  events: [],          // Eventos sísmicos de la USGS
  citizenReports: [],  // Reportes ciudadanos guardados en el servidor
  osmDamages: [],      // Estructuras dañadas de OpenStreetMap (Overpass)
  osmRoads: [],        // Vías bloqueadas de OSM en La Guaira
  filteredMin: 0,      // Filtro de magnitud mínima activa
  selectedId: null,    // ID del sismo seleccionado
  lastFetch: null,
  refreshTimer: null,
  activeScope: 'ven',  // Ámbito de cobertura activa: 'ven' o 'caribe'
  layers: {
    seismic: true,
    citizen: true,
    osm: false,
    roads: true       // Vías bloqueadas y zonas restringidas activas
  }
};

// ── Referencias de Mapa ───────────────────────────────────────────────────────
let map = null;
let tileLayerSatEsri = null;
let tileLayerSatGoogle = null;
let tileLayerStreet = null;
let seismicLayerGroup = null;
let citizenLayerGroup = null;
let osmLayerGroup = null;
let roadsLayerGroup = null;
let dyfiLayerGroup = null; // Malla de intensidad DYFI
let seismicRippleMarker = null;
let clickLocationMarker = null;

// ── Coordenadas de Enfoque Regional (Foco principal en Venezuela) ─────────────
const REGIONS = {
  ven: { center: [10.50, -67.50],    zoom: 7  }, // Centrado en la costa norte venezolana
  ccs: { center: [10.493, -66.852], zoom: 12 },
  suc: { center: [10.668, -63.259], zoom: 12 },
  mer: { center: [8.598, -71.145],  zoom: 12 }
};

// ── Configuración de Coberturas Geográficas (Bounding Box) ────────────────────
const BBOX_PRESETS = {
  ven: {
    minlat: 1.0,     // Cobertura completa de todo el territorio nacional de Venezuela
    maxlat: 15.0,
    minlon: -73.5,
    maxlon: -59.5
  },
  caribe: {
    minlat: 1.0,
    maxlat: 22.0,
    minlon: -85.0,
    maxlon: -59.0
  }
};

// ── Inicio de la Aplicación ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  startClock();
  initMap();
  fetchUSGSData();
  fetchCitizenReports();
  fetchExternalFeedData(); // Cargar 800+ reportes de daños reales
  fetchLiveNews();        // Cargar noticias en vivo
  fetchOSMRoadsData(); // Cargar estado de vías
  bindUIEvents();
  
  // Sincronización automática cada 60 segundos
  state.refreshTimer = setInterval(() => {
    fetchUSGSData();
    fetchCitizenReports();
    fetchExternalFeedData();
    fetchLiveNews();
    if (state.layers.roads) fetchOSMRoadsData();
  }, 60_000);

  log('ok', 'VEN-SISMO v5 activo. Radar nacional e integraciones humanitarias de SOS Venezuela conectadas.');
});

// ── Reloj UTC / Local ────────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('clock');
  const tick = () => {
    const now = new Date();
    el.textContent = now.toISOString().split('T')[1].substring(0, 8) + ' UTC';
  };
  tick();
  setInterval(tick, 1000);
}

// ── Inicialización del Mapa Leaflet ──────────────────────────────────────────
function initMap() {
  map = L.map('map', {
    center: REGIONS.ven.center,
    zoom: REGIONS.ven.zoom,
    zoomControl: true,
    attributionControl: true
  });

  // Capa Satélite Esri (Con escala por aproximación hasta zoom 21)
  tileLayerSatEsri = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: 'Tiles © Esri World Imagery'
    }
  ).addTo(map);

  // Capa Satélite Google (Ultra alta resolución nativa)
  tileLayerSatGoogle = L.tileLayer(
    'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    {
      maxZoom: 21,
      attribution: 'Tiles © Google Maps Satellite'
    }
  );

  // Capa Calles OpenStreetMap
  tileLayerStreet = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }
  );

  // Grupos de capas
  seismicLayerGroup = L.layerGroup().addTo(map);
  citizenLayerGroup = L.layerGroup().addTo(map);
  osmLayerGroup = L.layerGroup().addTo(map);
  roadsLayerGroup = L.layerGroup().addTo(map);
  dyfiLayerGroup = L.layerGroup().addTo(map);

  // Escuchar clics en el mapa para marcar coordenadas de daños
  map.on('click', handleMapClick);
}

// ── Clic en el Mapa para Fijar Coordenadas de Daños ──────────────────────────
function handleMapClick(e) {
  const lat = e.latlng.lat;
  const lon = e.latlng.lng;

  // Rellenar formulario
  document.getElementById('c-lat').value = lat.toFixed(5);
  document.getElementById('c-lon').value = lon.toFixed(5);

  // Dibujar pin en mapa
  if (clickLocationMarker) {
    map.removeLayer(clickLocationMarker);
  }

  const customPin = L.divIcon({
    html: `<div style="color: var(--danger); font-size: 1.25rem; filter: drop-shadow(0px 0px 4px rgba(255, 69, 58, 0.7));"><i class="fa-solid fa-map-pin"></i></div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [6, 20]
  });

  clickLocationMarker = L.marker([lat, lon], { icon: customPin }).addTo(map);
  log('info', `Ubicación marcada en [${lat.toFixed(4)}, ${lon.toFixed(4)}]`);
}

// ── Consulta de Terremotos a través de nuestro Proxy Local (Evita bloqueos de red) ──
function fetchUSGSData() {
  setStatus('loading');
  setRefreshSpinner(true);

  // Lógica de fechas: si es Venezuela, starttime es fijo desde el 24/06/2026.
  // Si es Caribe General, es dinámico (últimos 7 días)
  let starttimeStr = '';
  if (state.activeScope === 'ven') {
    starttimeStr = '2026-06-24T00:00:00';
  } else {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    starttimeStr = sevenDaysAgo.toISOString().split('.')[0];
  }

  const bounds = BBOX_PRESETS[state.activeScope];
  const url = [
    '/api/seismic',
    `?starttime=${starttimeStr}`,
    `&minlatitude=${bounds.minlat}`,
    `&maxlatitude=${bounds.maxlat}`,
    `&minlongitude=${bounds.minlon}`,
    `&maxlongitude=${bounds.maxlon}`,
    '&minmagnitude=0.0',
    '&orderby=time'
  ].join('');

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      state.events = (data.features || []).map(f => ({
        id: f.id,
        mag: f.properties.mag ?? 0,
        place: f.properties.place ?? 'Región del Caribe',
        time: f.properties.time,
        detailUrl: f.properties.detail,
        url: f.properties.url,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        depth: f.geometry.coordinates[2] ?? 0
      }));

      state.lastFetch = data._cached ? data._cacheTime : Date.now();
      
      if (data._cached) {
        setStatus('cached');
        updateDashboardData();
        const dateStr = new Date(data._cacheTime).toLocaleString();
        log('warn', `USGS inalcanzable. Datos cargados desde la caché local del: ${dateStr}`);
      } else {
        setStatus('live');
        updateDashboardData();
        log('ok', `Sismos sincronizados: ${state.events.length} sismos detectados.`);
      }
    })
    .catch(err => {
      setStatus('error');
      log('err', `Error al obtener feed sísmico: ${err.message}`);
    })
    .finally(() => setRefreshSpinner(false));
}

// ── Cargar Reportes de Daños Ciudadanos Locales ──────────────────────────────
function fetchCitizenReports() {
  fetch('/api/reports')
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        state.citizenReports = data.reports || [];
        updateCitizenLayers();
        const totalReports = state.citizenReports.length + (state.externalReports ? state.externalReports.length : 0);
        document.getElementById('m-collapsed').textContent = totalReports;
      }
    })
    .catch(err => {
      console.warn('[Offline Fallback] No se pudieron cargar reportes del servidor.', err);
    });
}

// ── Cargar Feed Humanitario SOS Venezuela (800+ reportes en vivo) ────────────
function fetchExternalFeedData() {
  fetch('/api/external/feed')
    .then(res => res.json())
    .then(data => {
      state.externalReports = data.data || [];
      updateCitizenLayers();
      const totalReports = state.citizenReports.length + state.externalReports.length;
      document.getElementById('m-collapsed').textContent = totalReports;
      log('ok', `Integrados ${state.externalReports.length} reportes humanitarios externos de SOS Venezuela.`);
    })
    .catch(err => {
      console.warn('[SOS Venezuela Feed Proxy Falló]', err.message);
    });
}

// ── Cargar Noticias en Vivo (SOS Venezuela) ──────────────────────────────────
function fetchLiveNews() {
  const container = document.getElementById('news-container');
  if (!container) return;

  fetch('/api/external/news')
    .then(res => res.json())
    .then(data => {
      const news = data.data || [];
      if (news.length === 0) {
        container.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding: 0.5rem 0;">No hay noticias recientes registradas.</div>';
        return;
      }

      container.innerHTML = '';
      news.slice(0, 15).forEach(n => {
        const item = document.createElement('div');
        item.style.borderBottom = '1px solid var(--border)';
        item.style.padding = '0.3rem 0';
        item.style.marginBottom = '0.2rem';

        const sourceStr = n.source ? `[${n.source}]` : '';
        const timeStr = formatTimeElapsed(new Date(n.published_at).getTime());

        item.innerHTML = `
          <div style="font-weight:bold; color:#7dd3fc; margin-bottom:2px; font-size:0.58rem; line-height:1.25;">
            <a href="${n.url}" target="_blank" style="color:#7dd3fc; text-decoration:none;">${n.title}</a>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.5rem; color:var(--text-dim);">
            <span>${sourceStr}</span>
            <span>${timeStr}</span>
          </div>
        `;
        container.appendChild(item);
      });
    })
    .catch(() => {
      container.innerHTML = '<div style="color:var(--danger); text-align:center; padding: 0.5rem 0;">Error al sincronizar noticias en vivo.</div>';
    });
}

// ── Obtener datos de Daños Reales en OSM vía Proxy Local ──────────────────────
function fetchOSMDamagedStructures() {
  if (!state.layers.osm) return;

  log('info', 'Buscando daños estructurales en OSM (Overpass)...');
  const bounds = map.getBounds();
  const url = `/api/osm/damage?south=${bounds.getSouth()}&west=${bounds.getWest()}&north=${bounds.getNorth()}&east=${bounds.getEast()}`;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      if (data.success) {
        state.osmDamages = data.elements || [];
        updateOSMLayers();
        if (data._unreachable) {
          log('warn', 'Capa de daños OSM (Overpass) no disponible temporalmente.');
        } else {
          log('ok', `Cargados ${state.osmDamages.length} daños registrados en OpenStreetMap.`);
        }
      } else {
        throw new Error(data.message || 'Error desconocido.');
      }
    })
    .catch(err => {
      log('err', `Falla en consulta OSM: ${err.message}`);
    });
}

// ── Obtener Vías Obstruidas de OSM en La Guaira ──────────────────────────────
function fetchOSMRoadsData() {
  if (!state.layers.roads) return;

  console.log('[OSM Roads] Iniciando consulta de vías en La Guaira...');
  fetch('/api/osm/roads')
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        state.osmRoads = data.elements || [];
        updateRoadsLayers();
        if (data._unreachable) {
          log('warn', 'Mapeo de vías OSM no disponible temporalmente.');
        }
      }
    })
    .catch(err => {
      console.warn('[OSM Roads Proxy Falló]', err.message);
    });
}

// ── Actualizar Capas de Epicentros Sísmicos ───────────────────────────────────
function updateSeismicLayers() {
  seismicLayerGroup.clearLayers();
  if (!state.layers.seismic) return;

  state.events.forEach(evt => {
    const color = magToColor(evt.mag);
    const radius = Math.max(5, evt.mag * 4.2);
    
    // Resaltar sismos superficiales (< 30km de profundidad) como destructivos (Pin rojo grueso)
    const isSuperficial = evt.depth < 30;

    const marker = L.circleMarker([evt.lat, evt.lon], {
      radius,
      fillColor: isSuperficial ? '#ff003c' : color,
      color: isSuperficial ? '#ffffff' : '#fff',
      weight: isSuperficial ? 2.5 : 1, // Borde más grueso
      opacity: 1,
      fillOpacity: isSuperficial ? 0.65 : 0.4
    });

    marker.bindPopup(buildPopupHtml(evt), { maxWidth: 220 });
    marker.on('click', () => selectEvent(evt.id));
    seismicLayerGroup.addLayer(marker);
  });
}

// ── Actualizar Capas de Reportes Ciudadanos ──────────────────────────────────
function updateCitizenLayers() {
  citizenLayerGroup.clearLayers();
  if (!state.layers.citizen) return;

  // Dibujar reportes locales
  state.citizenReports.forEach(rep => {
    let iconClass = 'fa-road-barrier';
    let color = '#30d5c8';
    let translation = 'Daño';
    
    if (rep.category === 'collapse') {
      iconClass = 'fa-building-crack';
      color = '#ff453a';
      translation = 'Colapso';
    } else if (rep.category === 'structural') {
      iconClass = 'fa-building-crack';
      color = '#ff453a';
      translation = 'Falla Estructural';
    } else if (rep.category === 'roadblock') {
      iconClass = 'fa-road-barrier';
      color = '#ff9f0a';
      translation = 'Vía Obstruida';
    } else if (rep.category === 'outage') {
      iconClass = 'fa-bolt-lightning';
      color = '#ff9f0a';
      translation = 'Corte de Servicio';
    }

    const pin = L.divIcon({
      html: `<div style="background: ${color}; width: 10px; height: 10px; border-radius: 50%; border: 1px solid #fff; box-shadow: 0 0 6px ${color};"></div>`,
      className: 'custom-div-icon',
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });

    const marker = L.marker(rep.coords, { icon: pin });
    marker.bindPopup(`
      <div style="font-family: var(--font-sans); color: #fff; width: 190px; line-height: 1.45;">
        <h4 style="margin: 0 0 3px 0; font-size: 0.78rem; font-weight: bold; color: ${color};">
          <i class="fa-solid ${iconClass}"></i> Reporte Ciudadano (Local)
        </h4>
        <div style="font-size: 0.65rem; color: #a7f3d0; font-family: var(--font-mono); margin-bottom: 2px;">
          <strong>CATEGORÍA:</strong> ${translation.toUpperCase()}
        </div>
        <p style="font-size: 0.65rem; color: #cbd5e1; margin: 0 0 4px 0;">${rep.desc}</p>
        <span style="font-size: 0.58rem; color: var(--text-dim); font-family: var(--font-mono);">${formatTimeElapsed(rep.time)}</span>
      </div>
    `);
    citizenLayerGroup.addLayer(marker);
  });

  // Dibujar reportes externos (zonasafectadasvenezuela.app)
  state.externalReports.forEach(rep => {
    if (!rep.lat || !rep.lng) return;

    const color = rep.severity === 'Crítica' ? '#ff3b30' : '#ff9f0a';
    const pin = L.divIcon({
      html: `<div style="background: ${color}; width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid #fff; box-shadow: 0 0 5px ${color};"></div>`,
      className: '',
      iconSize: [9, 9],
      iconAnchor: [4, 4]
    });

    const marker = L.marker([rep.lat, rep.lng], { icon: pin });
    marker.bindPopup(`
      <div style="font-family: var(--font-sans); color: #fff; width: 210px; line-height: 1.4;">
        <h4 style="margin: 0 0 3px 0; font-size: 0.78rem; font-weight: bold; color: ${color};">
          <i class="fa-solid fa-triangle-exclamation"></i> Daño Reportado (${rep.source})
        </h4>
        <div style="font-size: 0.65rem; color: #cbd5e1; font-family: var(--font-mono); margin-bottom: 2px;">
          <strong>CATEGORÍA:</strong> ${rep.title.toUpperCase()}
        </div>
        <p style="font-size: 0.65rem; color: #cbd5e1; margin: 0 0 4px 0;">${rep.description}</p>
        <span style="font-size: 0.58rem; color: var(--text-dim); font-family: var(--font-mono);">${new Date(rep.created_at).toLocaleString()}</span>
      </div>
    `);
    citizenLayerGroup.addLayer(marker);
  });
}

// ── Actualizar Capas de Daños de OpenStreetMap ──────────────────────────────
function updateOSMLayers() {
  osmLayerGroup.clearLayers();
  if (!state.layers.osm) return;

  state.osmDamages.forEach(el => {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!lat || !lon) return;

    const icon = L.divIcon({
      html: `<div style="background: rgba(255, 51, 51, 0.45); border: 1px solid #ff3333; width: 12px; height: 12px; border-radius: 2px;"></div>`,
      className: '',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    const marker = L.marker([lat, lon], { icon });
    const name = el.tags?.name || `Estructura ID: ${el.id}`;
    const condition = el.tags?.['building:condition'] || el.tags?.ruins || 'dañado';
    marker.bindPopup(`
      <div style="font-family: var(--font-mono); color: #ff3333; font-size: 0.68rem; line-height: 1.4;">
        <strong>[SITUACIÓN OSM REGISTRADA]</strong>
        <div style="color: #fff; font-size: 0.72rem; margin: 4px 0;">${name}</div>
        <div>Condición: ${condition.toUpperCase()}</div>
        <div style="font-size: 0.58rem; color: var(--text-dim); margin-top: 4px;">Origen: Colaboradores de OpenStreetMap</div>
      </div>
    `);
    osmLayerGroup.addLayer(marker);
  });
}

// ── Actualizar Capa de Vías Obstruidas (Líneas y Puntos de Debris) ────────────
function updateRoadsLayers() {
  roadsLayerGroup.clearLayers();
  if (!state.layers.roads) return;

  state.osmRoads.forEach(el => {
    // Si es un camino (way), lo dibujamos como línea roja
    if (el.type === 'way' && el.geometry) {
      const latlngs = el.geometry.map(pt => [pt.lat, pt.lon]);
      const polyline = L.polyline(latlngs, {
        color: '#ff007f',
        weight: 4,
        opacity: 0.8,
        dashArray: '5, 8'
      });

      const name = el.tags?.name || 'Vía Bloqueada / Restringida';
      const barrier = el.tags?.barrier || el.tags?.impassable || 'Bloqueo';
      
      polyline.bindPopup(`
        <div style="font-family: var(--font-mono); font-size: 0.65rem; line-height: 1.45; color: #ff007f;">
          <strong>[VÍA CERRADA EN LA GUAIRA]</strong>
          <div style="color:#fff; font-size:0.7rem; margin:3px 0;">${name}</div>
          <div>Causa/Tag: ${barrier.toUpperCase()}</div>
          <div style="font-size:0.55rem; color:var(--text-dim); margin-top:3px;">Actualizado por: Equipo de Mapeo de Emergencias</div>
        </div>
      `);
      roadsLayerGroup.addLayer(polyline);
    } 
    // Si es un punto o nodo, colocamos un icono de advertencia
    else if (el.type === 'node') {
      const lat = el.lat;
      const lon = el.lon;
      const icon = L.divIcon({
        html: `<div style="color: #ff007f; font-size: 1rem; text-shadow: 0 0 4px #ff007f;"><i class="fa-solid fa-road-barrier"></i></div>`,
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      const marker = L.marker([lat, lon], { icon });
      marker.bindPopup(`
        <div style="font-family: var(--font-mono); font-size: 0.65rem; color: #ff007f;">
          <strong>[OBSTÁCULO VIAL]</strong>
          <div style="color:#fff; margin:3px 0;">Escombros en Vía</div>
          <div>Tag: ${el.tags?.barrier || 'debris'}</div>
        </div>
      `);
      roadsLayerGroup.addLayer(marker);
    }
  });
}

// ── Seleccionar Sismo y Mostrar Detalles de PAGER y Malla DYFI ───────────────
function selectEvent(id) {
  state.selectedId = id;
  const evt = state.events.find(e => e.id === id);
  if (!evt) return;

  renderAftershockFeed();

  const item = document.querySelector(`[data-id="${id}"]`);
  if (item) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  map.setView([evt.lat, evt.lon], 10);
  drawSeismicRipple([evt.lat, evt.lon], evt.mag);

  loadPagerImpactAssessment(evt);
  loadDYFIGridLayer(evt); // Cargar malla comunitaria DYFI
}

// ── Consultar Datos PAGER a través del Proxy Local (Evita fallas de CORS/Https) ──
function loadPagerImpactAssessment(evt) {
  const container = document.getElementById('pager-container');
  container.innerHTML = `
    <div class="feed-loading">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>Cargando análisis PAGER...</span>
    </div>
  `;

  if (!evt.detailUrl) {
    renderOfflinePagerFallback(evt);
    return;
  }

  const proxyUrl = `/api/seismic/detail?url=${encodeURIComponent(evt.detailUrl)}`;

  fetch(proxyUrl)
    .then(res => {
      if (!res.ok) throw new Error('Detalle inaccesible');
      return res.json();
    })
    .then(detail => {
      const products = detail.properties?.products;
      const pager = products?.pager?.[0];
      const dyfi = products?.dyfi?.[0];

      if (!pager) {
        renderOfflinePagerFallback(evt);
        return;
      }

      const alertLevel = pager.properties?.alertlevel || 'green';
      const maxmmi = pager.properties?.maxmmi || 'V';
      const exposure = pager.properties?.mmi_exposure_text || 'Sacudida débil/moderada';
      
      const pdfContents = pager.contents?.['onepager.pdf'];
      const pdfUrl = pdfContents ? pdfContents.url : '';
      const dyfiCount = dyfi?.properties?.receivnum || 0;

      let colorLabel = 'VERDE (Bajo Impacto)';
      if (alertLevel === 'yellow') colorLabel = 'AMARILLO (Daños Locales)';
      else if (alertLevel === 'orange') colorLabel = 'NARANJA (Daños Significativos)';
      else if (alertLevel === 'red') colorLabel = 'ROJO (Catástrofe)';

      container.innerHTML = `
        <div class="pager-alert-badge ${alertLevel}">
          <i class="fa-solid fa-circle-exclamation"></i>
          PAGER: ALERTA ${colorLabel}
        </div>
        <div style="font-family: var(--font-mono); font-size: 0.68rem; line-height: 1.45; color: var(--text);">
          <div style="margin-bottom: 0.4rem;"><strong>Epicentro:</strong> ${evt.place}</div>
          <div class="pager-grid">
            <div class="pager-stat">
              <div class="pager-stat-label">Intensidad Max</div>
              <div class="pager-stat-val ${alertLevel === 'green' ? 'green' : 'red'}">${maxmmi}</div>
            </div>
            <div class="pager-stat">
              <div class="pager-stat-label">Reportes Sentidos</div>
              <div class="pager-stat-val">${dyfiCount}</div>
            </div>
          </div>
          <div style="margin-bottom: 0.4rem;"><strong>Exposición de Población:</strong> ${exposure}</div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 0.5rem; border-top:1px solid var(--border); padding-top:0.4rem;">
            ${pdfUrl ? `<a href="${pdfUrl}" target="_blank" style="color:var(--accent-green); font-size:0.6rem; font-weight:bold;"><i class="fa-solid fa-file-pdf"></i> Reporte PDF oficial</a>` : ''}
            <a href="${evt.url}" target="_blank" style="color:var(--text-sec); font-size:0.6rem;">Ficha USGS ↗</a>
          </div>
        </div>
      `;
    })
    .catch(err => {
      console.error(err);
      renderOfflinePagerFallback(evt);
    });
}

function renderOfflinePagerFallback(evt) {
  const container = document.getElementById('pager-container');
  container.innerHTML = `
    <div style="font-family: var(--font-mono); font-size: 0.65rem; line-height: 1.4;">
      <div style="color:var(--text-sec); margin-bottom: 4px;"><strong>PAGER:</strong> Reportes PAGER disponibles en sismos de M4.5+.</div>
      <div><strong>Coordenadas:</strong> [${evt.lat.toFixed(4)}, ${evt.lon.toFixed(4)}]</div>
      <div><strong>Fecha/Hora UTC:</strong> ${new Date(evt.time).toUTCString()}</div>
      <a href="${evt.url}" target="_blank" style="color:var(--accent-green); display:block; margin-top: 6px; font-size: 0.62rem;">Ficha Detallada USGS ↗</a>
    </div>
  `;
}

// ── Cargar y Renderizar Malla DYFI Comunitario (Sacudida por Barrios) ─────────
function loadDYFIGridLayer(evt) {
  dyfiLayerGroup.clearLayers();

  if (!evt.detailUrl) return;

  const detailUrl = `/api/seismic/detail?url=${encodeURIComponent(evt.detailUrl)}`;
  fetch(detailUrl)
    .then(res => res.json())
    .then(detail => {
      const dyfi = detail.properties?.products?.dyfi?.[0];
      const dyfiGeojson = dyfi?.contents?.['dyfi_geo.geojson'];

      if (!dyfiGeojson?.url) {
        console.log('[DYFI Layer] Sismo sin malla GeoJSON generada aún.');
        return;
      }

      // Consultar la malla a través de nuestro proxy de Node
      const proxyUrl = `/api/seismic/dyfi?url=${encodeURIComponent(dyfiGeojson.url)}`;
      fetch(proxyUrl)
        .then(res => res.json())
        .then(gridData => {
          log('info', `Mapeando malla comunitaria DYFI (${gridData.features?.length || 0} cuadrantes)`);
          
          const leafletGeojson = L.geoJSON(gridData, {
            style: function (feature) {
              const intensity = parseFloat(feature.properties.intensity);
              let color = '#39ff14'; // I-III
              if (intensity >= 6.0) color = '#ff453a'; // VI+
              else if (intensity >= 5.0) color = '#ff9f0a'; // V
              else if (intensity >= 4.0) color = '#30d5c8'; // IV
              
              return {
                fillColor: color,
                color: color,
                weight: 1,
                fillOpacity: 0.35,
                opacity: 0.6
              };
            },
            onEachFeature: function (feature, layer) {
              const intensity = parseFloat(feature.properties.intensity).toFixed(1);
              layer.bindPopup(`
                <div style="font-family: var(--font-mono); font-size: 0.65rem;">
                  <strong>[ZONA DE RESPUESTA SÍSMICA]</strong>
                  <div>Intensidad Reportada: MMI ${intensity}</div>
                  <div>Respuestas en cuadrante: ${feature.properties.nresp || 0} personas</div>
                </div>
              `);
            }
          });
          
          dyfiLayerGroup.addLayer(leafletGeojson);
        })
        .catch(() => {});
    })
    .catch(() => {});
}

// ── Animación Sísmica en Mapa ────────────────────────────────────────────────
function drawSeismicRipple(coords, mag) {
  if (seismicRippleMarker) {
    map.removeLayer(seismicRippleMarker);
  }

  const color = magToColor(mag);
  const size = Math.max(30, mag * 8.5);

  const icon = L.divIcon({
    html: `
      <div style="position:relative; width:${size}px; height:${size}px; margin-left:-${size/2}px; margin-top:-${size/2}px;">
        <div class="ripple-ring" style="border-color:${color}; width:${size}px; height:${size}px; margin:0; position:relative; animation-delay:0s;"></div>
        <div class="ripple-ring" style="border-color:${color}; width:${size}px; height:${size}px; margin:0; position:absolute; top:0; left:0; animation-delay:0.6s;"></div>
        <div class="ripple-ring" style="border-color:${color}; width:${size}px; height:${size}px; margin:0; position:absolute; top:0; left:0; animation-delay:1.2s;"></div>
      </div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });

  seismicRippleMarker = L.marker(coords, { icon, interactive: false }).addTo(map);

  setTimeout(() => {
    if (seismicRippleMarker) {
      map.removeLayer(seismicRippleMarker);
      seismicRippleMarker = null;
    }
  }, 6000);
}

// ── Guardar Reporte Ciudadano de Daños Estructurales (Persistente) ────────────
function submitCitizenDamageReport() {
  const lat = parseFloat(document.getElementById('c-lat').value);
  const lon = parseFloat(document.getElementById('c-lon').value);
  const category = document.getElementById('c-category').value;
  const desc = document.getElementById('c-desc').value.trim();

  if (isNaN(lat) || isNaN(lon) || !desc) {
    log('danger', 'Por favor, haz clic en el mapa para marcar las coordenadas.');
    return;
  }

  const payload = {
    zone: 'otro',
    zoneName: `GPS: [${lat.toFixed(3)}, ${lon.toFixed(3)}]`,
    category,
    desc,
    coords: [lat, lon]
  };

  const btn = document.getElementById('btn-submit-report');
  btn.disabled = true;

  fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        document.getElementById('c-lat').value = '';
        document.getElementById('c-lon').value = '';
        document.getElementById('c-desc').value = '';
        
        if (clickLocationMarker) {
          map.removeLayer(clickLocationMarker);
          clickLocationMarker = null;
        }

        log('ok', `Reporte publicado con éxito en coordenadas [${lat.toFixed(4)}, ${lon.toFixed(4)}]`);
        fetchCitizenReports();
      }
    })
    .catch(err => {
      console.error(err);
      log('warn', 'Servidor desconectado. Reporte guardado temporalmente en el navegador.');
      
      const report = {
        id: `local-${Date.now()}`,
        ...payload,
        time: Date.now()
      };
      state.citizenReports.unshift(report);
      
      document.getElementById('c-lat').value = '';
      document.getElementById('c-lon').value = '';
      document.getElementById('c-desc').value = '';
      
      if (clickLocationMarker) {
        map.removeLayer(clickLocationMarker);
        clickLocationMarker = null;
      }
      
      updateCitizenLayers();
      document.getElementById('m-collapsed').textContent = state.citizenReports.length;
    })
    .finally(() => {
      btn.disabled = false;
    });
}

// ── Realizar Búsqueda de Personas en Albergues ─────────────────────────────────
function searchPersonInShelters() {
  const query = document.getElementById('s-person-query').value.trim();
  const resultsContainer = document.getElementById('search-person-results');

  if (!query) {
    resultsContainer.innerHTML = '<div style="color:var(--text-dim);">Escribe un nombre o cédula...</div>';
    return;
  }

  resultsContainer.innerHTML = '<div style="color:var(--warn);"><i class="fa-solid fa-spinner fa-spin"></i> Consultando registros de albergues...</div>';

  fetch(`/api/people/search?q=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(data => {
      if (data.success && data.results?.length > 0) {
        resultsContainer.innerHTML = '';
        data.results.forEach(p => {
          const card = document.createElement('div');
          card.style.background = 'rgba(57, 255, 20, 0.04)';
          card.style.border = '1px solid var(--border-med)';
          card.style.padding = '0.35rem';
          card.style.borderRadius = '3px';
          card.style.marginBottom = '0.3rem';
          
          card.innerHTML = `
            <div style="color:var(--green); font-weight:bold;">${p.name}</div>
            <div style="color:var(--text-sec); font-size:0.58rem;">Cédula/ID: ${p.docId}</div>
            <div style="color:#fff; margin-top:2px;">Refugio: ${p.shelter}</div>
            <div style="color:#a7f3d0; font-size:0.58rem; margin-top:1px;">Estado: ${p.status}</div>
            <div style="color:var(--text-dim); font-size:0.55rem;">Contacto: ${p.contact}</div>
          `;
          resultsContainer.appendChild(card);
        });
      } else {
        resultsContainer.innerHTML = '<div style="color:var(--danger);"><i class="fa-solid fa-triangle-exclamation"></i> Persona no localizada en los registros de albergues cargados.</div>';
      }
    })
    .catch(() => {
      resultsContainer.innerHTML = '<div style="color:var(--danger);">Error al conectar con la base de datos de albergues.</div>';
    });
}

// ── Actualizar Datos Sísmicos del Tablero y Barra Lateral ─────────────────────
function updateDashboardData() {
  document.getElementById('m-total').textContent = state.events.length;

  if (state.events.length > 0) {
    const maxEvt = state.events.reduce((a, b) => b.mag > a.mag ? b : a, state.events[0]);
    document.getElementById('m-maxmag').textContent = maxEvt.mag.toFixed(1);
    
    // Simplificar el texto del epicentro
    const cleanPlace = maxEvt.place
      .replace(/^\d+\s?km\s+\w+\s+of\s+/i, '')
      .replace('region', 'región')
      .replace('Venezuela', 'Venezuela');
    document.getElementById('m-maxloc').textContent = cleanPlace;

    const sumMag = state.events.reduce((acc, current) => acc + current.mag, 0);
    
    const avgEl = document.getElementById('m-avg');
    if (avgEl) {
      avgEl.textContent = (sumMag / state.events.length).toFixed(1);
    }

    const latest = state.events[0];
    document.getElementById('m-latest-mag').textContent = `M ${latest.mag.toFixed(1)}`;
    document.getElementById('m-latest-time').textContent = formatTimeElapsed(latest.time);
  } else {
    document.getElementById('m-maxmag').textContent = '--';
    document.getElementById('m-maxloc').textContent = 'Ninguno';
    
    const avgEl = document.getElementById('m-avg');
    if (avgEl) avgEl.textContent = '--';

    document.getElementById('m-latest-mag').textContent = '--';
    document.getElementById('m-latest-time').textContent = '--';
  }

  renderAftershockFeed();
  updateSeismicLayers();
}

// ── Renderizar Feed Lateral de Terremotos ─────────────────────────────────────
function renderAftershockFeed() {
  const container = document.getElementById('feed-list');
  const filtered = state.events.filter(e => e.mag >= state.filteredMin);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="feed-loading">
        <i class="fa-solid fa-circle-check" style="color:var(--text-dim)"></i>
        <span>No hay sismos registrados de M${state.filteredMin}+ en la región.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(evt => {
    const color = magToColor(evt.mag);
    const isSelected = evt.id === state.selectedId;
    const isHigh = evt.mag >= 5.5;

    // Resaltar sismos superficiales (< 30km) con color rojo intenso
    const isSuperficial = evt.depth < 30;

    const item = document.createElement('div');
    item.className = `feed-item ${isHigh ? 'mag-high' : ''} ${isSelected ? 'selected' : ''}`;
    item.dataset.id = evt.id;

    // Traducir "region" a "región"
    const displayPlace = evt.place.replace('region', 'región');

    item.innerHTML = `
      <div class="feed-row-top">
        <span class="feed-mag" style="color: ${isSuperficial ? '#ff003c' : color}">M ${evt.mag.toFixed(1)}</span>
        <span class="feed-time">${formatTimeElapsed(evt.time)}</span>
      </div>
      <div class="feed-place">${displayPlace}</div>
      <div class="feed-depth">
        Profundidad: ${evt.depth.toFixed(0)} km &middot; [${evt.lat.toFixed(3)}, ${evt.lon.toFixed(3)}]
        ${isSuperficial ? `<br><span style="color:#ff003c; font-weight:bold; font-size:0.55rem; border:1px solid #ff003c; padding:1px 3px; border-radius:2px; display:inline-block; margin-top:2px;">[ALERTA: SUPERFICIAL]</span>` : ''}
      </div>
    `;

    item.addEventListener('click', () => selectEvent(evt.id));
    container.appendChild(item);
  });
}

// ── Registrar Eventos de Interfaz de Usuario ─────────────────────────────────
function bindUIEvents() {
  // Sincronizar manual
  document.getElementById('btn-refresh').addEventListener('click', () => {
    log('info', 'Forzando sincronización de datos sísmicos.');
    fetchUSGSData();
    fetchCitizenReports();
    fetchExternalFeedData();
    fetchLiveNews();
    fetchOSMRoadsData();
  });

  // Alternar mapas
  document.getElementById('btn-sat-esri').addEventListener('click', () => {
    map.removeLayer(tileLayerStreet);
    map.removeLayer(tileLayerSatGoogle);
    tileLayerSatEsri.addTo(map);
    document.getElementById('btn-sat-esri').classList.add('active');
    document.getElementById('btn-sat-google').classList.remove('active');
    document.getElementById('btn-streets').classList.remove('active');
  });

  document.getElementById('btn-sat-google').addEventListener('click', () => {
    map.removeLayer(tileLayerStreet);
    map.removeLayer(tileLayerSatEsri);
    tileLayerSatGoogle.addTo(map);
    document.getElementById('btn-sat-google').classList.add('active');
    document.getElementById('btn-sat-esri').classList.remove('active');
    document.getElementById('btn-streets').classList.remove('active');
  });

  document.getElementById('btn-streets').addEventListener('click', () => {
    map.removeLayer(tileLayerSatEsri);
    map.removeLayer(tileLayerSatGoogle);
    tileLayerStreet.addTo(map);
    document.getElementById('btn-streets').classList.add('active');
    document.getElementById('btn-sat-esri').classList.remove('active');
    document.getElementById('btn-sat-google').classList.remove('active');
  });

  // Ámbito de Cobertura (Venezuela / Caribe)
  document.getElementById('btn-scope-ven').addEventListener('click', function() {
    state.activeScope = 'ven';
    this.classList.add('active');
    document.getElementById('btn-scope-caribe').classList.remove('active');
    log('info', 'Filtro geográfico cambiado a Radar Venezuela (Foco Réplicas).');
    fetchUSGSData();
  });

  document.getElementById('btn-scope-caribe').addEventListener('click', function() {
    state.activeScope = 'caribe';
    this.classList.add('active');
    document.getElementById('btn-scope-ven').classList.remove('active');
    log('info', 'Filtro geográfico cambiado a Caribe General.');
    fetchUSGSData();
  });

  // Saltos regionales
  Object.entries({
    'btn-ven': 'ven',
    'btn-ccs': 'ccs',
    'btn-suc': 'suc',
    'btn-mer': 'mer'
  }).forEach(([btnId, regionKey]) => {
    document.getElementById(btnId).addEventListener('click', () => {
      const target = REGIONS[regionKey];
      map.setView(target.center, target.zoom);
    });
  });

  // Alternadores de capas de datos
  document.getElementById('btn-toggle-seismic').addEventListener('click', function () {
    state.layers.seismic = !state.layers.seismic;
    this.classList.toggle('active', state.layers.seismic);
    updateSeismicLayers();
    if (!state.layers.seismic) {
      dyfiLayerGroup.clearLayers(); // Limpiar malla DYFI si desactivamos epicentros
    }
  });

  document.getElementById('btn-toggle-citizen').addEventListener('click', function () {
    state.layers.citizen = !state.layers.citizen;
    this.classList.toggle('active', state.layers.citizen);
    updateCitizenLayers();
  });

  document.getElementById('btn-toggle-osm').addEventListener('click', function () {
    state.layers.osm = !state.layers.osm;
    this.classList.toggle('active', state.layers.osm);
    if (state.layers.osm) {
      fetchOSMDamagedStructures();
      map.on('moveend', fetchOSMDamagedStructures);
    } else {
      osmLayerGroup.clearLayers();
      map.off('moveend', fetchOSMDamagedStructures);
    }
  });

  // Selección de filtros de magnitud
  document.querySelectorAll('.mag-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.mag-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      state.filteredMin = parseFloat(this.dataset.min);
      renderAftershockFeed();
    });
  });

  // Envío del reporte de daño
  document.getElementById('citizen-damage-form').addEventListener('submit', e => {
    e.preventDefault();
    submitCitizenDamageReport();
  });

  // Buscador de albergues
  document.getElementById('btn-search-person').addEventListener('click', searchPersonInShelters);
  document.getElementById('s-person-query').addEventListener('keyup', e => {
    if (e.key === 'Enter') {
      searchPersonInShelters();
    }
  });
}

// ── Actualizadores de Estado de Conexión ──────────────────────────────────────
function setStatus(mode) {
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  const feed = document.getElementById('feed-status');

  if (!dot || !label || !feed) return;

  dot.className = 'status-dot';
  label.textContent = { loading: 'CONECTANDO', live: 'EN VIVO', cached: 'HISTÓRICO', error: 'DESCONECTADO' }[mode];
  feed.textContent = { loading: 'CARGANDO', live: 'SINCRONIZADO', cached: 'MUESTRA CACHÉ', error: 'DESCONECTADO' }[mode];
  feed.style.color = { loading: 'var(--warn)', live: 'var(--green)', cached: 'var(--warn)', error: 'var(--danger)' }[mode];

  if (mode === 'loading' || mode === 'cached') dot.classList.add('warn');
  if (mode === 'error') dot.classList.add('danger');

  if (state.lastFetch) {
    const lastSyncEl = document.getElementById('last-sync-label');
    if (lastSyncEl) {
      lastSyncEl.textContent = `Sincronizado ${formatTimeElapsed(state.lastFetch)}`;
    }
  }
}

function setRefreshSpinner(on) {
  const btn = document.getElementById('btn-refresh');
  if (btn) {
    btn.classList.toggle('spinning', on);
  }
}

// ── HTML popup para epicentros sísmicos ──────────────────────────────────────
function buildPopupHtml(evt) {
  const color = magToColor(evt.mag);
  const displayPlace = evt.place.replace('region', 'región');
  return `
    <div style="font-family: var(--font-mono); font-size: 0.72rem; line-height: 1.45; color: #fff;">
      <h4 style="margin: 0 0 4px 0; font-size: 0.85rem; color: ${evt.depth < 30 ? '#ff003c' : color}; font-weight: bold;">
        M ${evt.mag.toFixed(1)} ${evt.depth < 30 ? '<span style="font-size:0.55rem; color:#ff003c; border:1px solid #ff003c; padding:0 2px; margin-left:4px; border-radius:2px;">SUPERFICIAL</span>' : ''}
      </h4>
      <div>${displayPlace}</div>
      <div style="font-size:0.65rem; color: var(--text-sec); margin-top:2px;">Profundidad: ${evt.depth.toFixed(1)} km</div>
      <div style="font-size:0.65rem; color: var(--text-sec);">${new Date(evt.time).toUTCString()}</div>
    </div>
  `;
}

function magToColor(mag) {
  if (mag >= 6.0) return '#ff453a';
  if (mag >= 5.0) return '#ff9f0a';
  if (mag >= 3.5) return '#30d5c8';
  return '#39ff14';
}

function formatTimeElapsed(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins}m`;
  if (hours < 24) return `Hace ${hours}h`;
  return `Hace ${days}d`;
}

function log(type, text) {
  const logEl = document.getElementById('sys-log');
  if (!logEl) return;
  const now = new Date();
  const timeStr = now.toISOString().split('T')[1].substring(0, 8);
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="ts">[${timeStr}]</span> ${text}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;

  while (logEl.children.length > 20) {
    logEl.removeChild(logEl.firstChild);
  }
}
