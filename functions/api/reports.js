export async function onRequestGet(context) {
  return new Response(JSON.stringify({ success: true, reports: [] }), {
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'access-control-allow-origin': '*'
    }
  });
}

export async function onRequestPost(context) {
  const { request } = context;
  try {
    const body = await request.json();
    const report = {
      id: `cit-${Date.now()}`,
      time: Date.now(),
      zone: body.zone || 'otro',
      zoneName: body.zoneName || 'GPS',
      category: body.category || 'other',
      desc: body.desc,
      coords: [parseFloat(body.coords[0]), parseFloat(body.coords[1])]
    };

    return new Response(JSON.stringify({ success: true, report }), {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'access-control-allow-origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      status: 400,
      headers: { 
        'content-type': 'application/json;charset=UTF-8',
        'access-control-allow-origin': '*'
      }
    });
  }
}
