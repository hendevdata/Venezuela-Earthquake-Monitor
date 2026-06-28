export async function onRequest(context) {
  const externalUrl = 'https://www.zonasafectadasvenezuela.app/api/news';

  try {
    const res = await fetch(externalUrl);
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
