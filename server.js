/**
 * VEN-SISMO // Servidor de Base de Datos y Distribución Estática
 * Guarda reportes ciudadanos de daños estructurales de manera persistente en database.json
 * Utiliza usgs-earthquake-api (doojin) como wrapper oficial del USGS.
 * Almacena de manera persistente la última respuesta exitosa en earthquakes_cache.json
 * Proxy local integrado para la API de USGS sísmico, detalles PAGER, Overpass OSM, malla DYFI,
 * y APIs de zonasafectadasvenezuela.app (reportes en vivo, localizados y noticias).
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const usgs = require('usgs-earthquake-api');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('./')); // Servir archivos estáticos del panel

// ── Rutas de Archivos de Base de Datos y Caché ─────────────────────────────────
const DB_PATH = path.join(__dirname, 'database.json');
const CACHE_PATH = path.join(__dirname, 'earthquakes_cache.json');

function loadDatabase() {
  const defaultDb = { reports: [] };
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2), 'utf-8');
    return defaultDb;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return defaultDb;
  }
}

function saveDatabase(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

// Inicializar archivo de caché vacío si no existe
if (!fs.existsSync(CACHE_PATH)) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ type: "FeatureCollection", features: [], _cacheTime: null }, null, 2), 'utf-8');
}

// Lista de servidores públicos alternativos de Overpass API (OSM)
const OVERPASS_INSTANCES = [
  'https://overpass.osm.ch',
  'https://overpass-api.de',
  'https://lz4.overpass-api.de',
  'https://overpass.kumi.systems'
];

// Helper para consulta HTTPS con límite de tiempo (Timeout)
function fetchWithTimeout(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP status ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Límite de tiempo agotado (Timeout)'));
    });
  });
}

// ── Proxy Sísmico con usgs-earthquake-api y Caché Fuera de Línea ───────────────
app.get('/api/seismic', (req, res) => {
  const { starttime, minlatitude, maxlatitude, minlongitude, maxlongitude, minmagnitude, orderby } = req.query;

  const queryOptions = {};
  if (starttime) queryOptions.starttime = starttime;
  if (minlatitude) queryOptions.minlatitude = parseFloat(minlatitude);
  if (maxlatitude) queryOptions.maxlatitude = parseFloat(maxlatitude);
  if (minlongitude) queryOptions.minlongitude = parseFloat(minlongitude);
  if (maxlongitude) queryOptions.maxlongitude = parseFloat(maxlongitude);
  if (minmagnitude) queryOptions.minmagnitude = parseFloat(minmagnitude);
  if (orderby) queryOptions.orderby = orderby;

  console.log('[USGS Wrapper] Iniciando consulta de sismos...');

  usgs.query.earthquakes(queryOptions)
    .then(data => {
      const cachePayload = {
        ...data,
        _cached: true,
        _cacheTime: Date.now()
      };
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cachePayload, null, 2), 'utf-8');
      res.json({ ...data, _cached: false });
    })
    .catch(err => {
      console.warn(`[USGS Wrapper Falló] ${err.message}. Cargando caché...`);
      try {
        const cacheData = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
        res.json(cacheData);
      } catch (cacheErr) {
        res.status(500).json({ success: false, message: 'USGS inalcanzable y caché ilegible.' });
      }
    });
});

// Proxy de Detalles de USGS (Carga datos PAGER de forma segura) ─────────────────
app.get('/api/seismic/detail', (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL faltante.' });
  }

  if (!url.startsWith('https://earthquake.usgs.gov/')) {
    return res.status(400).json({ success: false, message: 'URL no autorizada.' });
  }

  https.get(url, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        res.json(json);
      } catch (err) {
        res.status(500).json({ success: false, message: 'Error de análisis.' });
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ success: false, message: err.message });
  });
});

// Proxy de Malla de Intensidad Comunitario DYFI ──────────────────────────────────
app.get('/api/seismic/dyfi', (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL faltante.' });
  }

  if (!url.startsWith('https://earthquake.usgs.gov/')) {
    return res.status(400).json({ success: false, message: 'URL no autorizada.' });
  }

  https.get(url, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        res.json(json);
      } catch (err) {
        res.status(500).json({ success: false, message: 'Error al procesar malla GeoJSON DYFI.' });
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ success: false, message: err.message });
  });
});

// Proxy de OSM Overpass (Estructuras Dañadas en General) ───────────────────────
app.get('/api/osm/damage', async (req, res) => {
  const { south, west, north, east } = req.query;

  if (!south || !west || !north || !east) {
    return res.status(400).json({ success: false, message: 'Límites geográficos faltantes.' });
  }

  const query = `
    [out:json][timeout:15];
    (
      node["building:condition"="damaged"](${south},${west},${north},${east});
      way["building:condition"="damaged"](${south},${west},${north},${east});
      relation["building:condition"="damaged"](${south},${west},${north},${east});
      node["building:condition"="destroyed"](${south},${west},${north},${east});
      way["building:condition"="destroyed"](${south},${west},${north},${east});
      relation["building:condition"="destroyed"](${south},${west},${north},${east});
      node["ruins"="yes"](${south},${west},${north},${east});
      way["ruins"="yes"](${south},${west},${north},${east});
      relation["ruins"="yes"](${south},${west},${north},${east});
    );
    out center;
  `.trim();

  let elements = [];
  let success = false;
  let errorMsg = '';

  for (const baseUrl of OVERPASS_INSTANCES) {
    const url = `${baseUrl}/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
      const data = await fetchWithTimeout(url, 4000);
      const json = JSON.parse(data);
      elements = json.elements || [];
      success = true;
      console.log(`[OSM Damage Proxy] Éxito con: ${baseUrl}`);
      break;
    } catch (err) {
      console.warn(`[OSM Damage Proxy Falló] ${baseUrl}: ${err.message}`);
      errorMsg = err.message;
    }
  }

  if (success) {
    res.json({ success: true, elements });
  } else {
    res.json({ success: true, elements: [], _unreachable: true, message: errorMsg });
  }
});

// Proxy de OSM Overpass (Vías obstruidas y zonas restringidas en La Guaira) ────
app.get('/api/osm/roads', async (req, res) => {
  const south = 10.58;
  const west = -67.00;
  const north = 10.63;
  const east = -66.80;

  const query = `
    [out:json][timeout:15];
    (
      way["impassable"="yes"](${south},${west},${north},${east});
      way["barrier"="debris"](${south},${west},${north},${east});
      way["highway"]["status"="closed"](${south},${west},${north},${east});
      way["highway"]["access"="no"](${south},${west},${north},${east});
      node["barrier"="debris"](${south},${west},${north},${east});
    );
    out body geom;
  `.trim();

  let elements = [];
  let success = false;
  let errorMsg = '';

  for (const baseUrl of OVERPASS_INSTANCES) {
    const url = `${baseUrl}/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
      const data = await fetchWithTimeout(url, 4000);
      const json = JSON.parse(data);
      elements = json.elements || [];
      success = true;
      console.log(`[OSM Roads Proxy] Éxito con: ${baseUrl}`);
      break;
    } catch (err) {
      console.warn(`[OSM Roads Proxy Falló] ${baseUrl}: ${err.message}`);
      errorMsg = err.message;
    }
  }

  if (success) {
    res.json({ success: true, elements });
  } else {
    res.json({ success: true, elements: [], _unreachable: true, message: errorMsg });
  }
});

// ── Integración con la API Externa zonasafectadasvenezuela.app ───────────────────

// 1. Proxy de Reportes Humanitarios / SOS Venezuela
app.get('/api/external/feed', (req, res) => {
  const url = 'https://www.zonasafectadasvenezuela.app/api/feed';
  https.get(url, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        res.json(json);
      } catch (err) {
        res.status(500).json({ success: false, message: 'Error de análisis en el feed humanitario.' });
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ success: false, message: err.message });
  });
});

// 2. Buscador Unificado de Localizados (Vía Localizados Venezuela)
app.get('/api/people/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.json({ success: true, results: [] });
  }

  const url = `https://www.zonasafectadasvenezuela.app/api/localizados?q=${encodeURIComponent(q)}`;
  https.get(url, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        const results = (json.data || []).map(p => ({
          name: p.nombreCompleto || 'Desconocido',
          docId: p.cedula || 'Sin ID',
          shelter: p.lugarNombre || 'Hospital / Albergue Desconocido',
          status: (p.condicion || 'Desconocido').toUpperCase(),
          contact: p.fuente?.nombre || 'Localizados Venezuela'
        }));
        res.json({ success: true, results });
      } catch (err) {
        res.status(500).json({ success: false, message: 'Error al analizar búsqueda de localizados.' });
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ success: false, message: err.message });
  });
});

// 3. Proxy de Noticias en Vivo (Vía SOS Venezuela)
app.get('/api/external/news', (req, res) => {
  const url = 'https://www.zonasafectadasvenezuela.app/api/news';
  https.get(url, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        res.json(json);
      } catch (err) {
        res.status(500).json({ success: false, message: 'Error al procesar noticias de crisis.' });
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ success: false, message: err.message });
  });
});

// ── Endpoints: Reportes Ciudadanos Locales ─────────────────────────────────────
app.get('/api/reports', (req, res) => {
  const db = loadDatabase();
  res.json({ success: true, reports: db.reports });
});

app.post('/api/reports', (req, res) => {
  const { zone, zoneName, category, desc, coords } = req.body;
  if (!desc || !coords) {
    return res.status(400).json({ success: false, message: 'Datos incompletos.' });
  }

  const db = loadDatabase();
  const report = {
    id: `cit-${Date.now()}`,
    zone: zone || 'otro',
    zoneName: zoneName || 'Coordenadas Personalizadas',
    category: category || 'other',
    desc,
    time: Date.now(),
    coords: [parseFloat(coords[0]), parseFloat(coords[1])]
  };

  db.reports.unshift(report);
  
  if (db.reports.length > 500) {
    db.reports = db.reports.slice(0, 500);
  }

  saveDatabase(db);
  console.log(`[Daño Registrado] Categoría: ${category.toUpperCase()} en [${coords[0]}, ${coords[1]}]`);
  res.json({ success: true, report });
});

// ── Endpoint: Estado del Servidor ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const db = loadDatabase();
  let cacheExists = fs.existsSync(CACHE_PATH);
  let cacheTime = null;
  if (cacheExists) {
    try {
      const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
      cacheTime = cache._cacheTime;
    } catch {}
  }

  res.json({
    status: 'online',
    reports: db.reports.length,
    cacheTime,
    timestamp: new Date().toISOString()
  });
});

// ── Iniciar Servidor ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log(' VEN-SISMO // SERVIDOR ACTIVO');
  console.log(`  Local:     http://localhost:${PORT}`);
  console.log(`  Historial: ${DB_PATH}`);
  console.log(`  Caché:     ${CACHE_PATH}`);
  console.log('══════════════════════════════════════════════════════');
  console.log('');
});
