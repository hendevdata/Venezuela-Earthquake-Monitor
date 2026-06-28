export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';

  if (!q) {
    return new Response(JSON.stringify({ success: true, results: [] }), {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'access-control-allow-origin': '*'
      }
    });
  }

  const externalUrl = `https://www.zonasafectadasvenezuela.app/api/localizados?q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(externalUrl);
    const json = await res.json();
    const results = (json.data || []).map(p => ({
      name: p.nombreCompleto || 'Desconocido',
      docId: p.cedula || 'Sin ID',
      shelter: p.lugarNombre || 'Hospital / Albergue Desconocido',
      status: (p.condicion || 'Desconocido').toUpperCase(),
      contact: p.fuente?.nombre || 'Localizados Venezuela'
    }));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'access-control-allow-origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      status: 500,
      headers: { 
        'content-type': 'application/json;charset=UTF-8',
        'access-control-allow-origin': '*'
      }
    });
  }
}
