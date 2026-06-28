export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const detailUrl = url.searchParams.get('url');

  if (!detailUrl) {
    return new Response(JSON.stringify({ success: false, message: 'URL faltante.' }), {
      status: 400,
      headers: { 
        'content-type': 'application/json;charset=UTF-8',
        'access-control-allow-origin': '*'
      }
    });
  }

  if (!detailUrl.startsWith('https://earthquake.usgs.gov/')) {
    return new Response(JSON.stringify({ success: false, message: 'URL no autorizada.' }), {
      status: 400,
      headers: { 
        'content-type': 'application/json;charset=UTF-8',
        'access-control-allow-origin': '*'
      }
    });
  }

  try {
    const res = await fetch(detailUrl);
    const data = await res.json();
    return new Response(JSON.stringify(data), {
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
