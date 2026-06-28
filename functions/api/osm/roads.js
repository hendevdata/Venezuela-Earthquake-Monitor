const OVERPASS_INSTANCES = [
  'https://overpass.osm.ch',
  'https://overpass-api.de',
  'https://lz4.overpass-api.de',
  'https://overpass.kumi.systems'
];

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (res.status === 200) {
      return await res.json();
    } else {
      throw new Error(`HTTP status ${res.status}`);
    }
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function onRequest(context) {
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
    const fetchUrl = `${baseUrl}/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
      const json = await fetchWithTimeout(fetchUrl, 4000);
      elements = json.elements || [];
      success = true;
      break;
    } catch (err) {
      errorMsg = err.message;
    }
  }

  const payload = success 
    ? { success: true, elements }
    : { success: true, elements: [], _unreachable: true, message: errorMsg };

  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'access-control-allow-origin': '*'
    }
  });
}
