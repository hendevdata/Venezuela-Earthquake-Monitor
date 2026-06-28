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
  const { request } = context;
  const url = new URL(request.url);
  const south = url.searchParams.get('south');
  const west = url.searchParams.get('west');
  const north = url.searchParams.get('north');
  const east = url.searchParams.get('east');

  if (!south || !west || !north || !east) {
    return new Response(JSON.stringify({ success: false, message: 'Límites geográficos faltantes.' }), {
      status: 400,
      headers: { 
        'content-type': 'application/json;charset=UTF-8',
        'access-control-allow-origin': '*'
      }
    });
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
