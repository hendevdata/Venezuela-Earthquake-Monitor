export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const starttime = url.searchParams.get('starttime');
  const minlatitude = url.searchParams.get('minlatitude');
  const maxlatitude = url.searchParams.get('maxlatitude');
  const minlongitude = url.searchParams.get('minlongitude');
  const maxlongitude = url.searchParams.get('maxlongitude');
  const minmagnitude = url.searchParams.get('minmagnitude');
  const orderby = url.searchParams.get('orderby');

  const usgsUrl = new URL('https://earthquake.usgs.gov/fdsnws/event/1/query');
  usgsUrl.searchParams.set('format', 'geojson');
  if (starttime) usgsUrl.searchParams.set('starttime', starttime);
  if (minlatitude) usgsUrl.searchParams.set('minlatitude', minlatitude);
  if (maxlatitude) usgsUrl.searchParams.set('maxlatitude', maxlatitude);
  if (minlongitude) usgsUrl.searchParams.set('minlongitude', minlongitude);
  if (maxlongitude) usgsUrl.searchParams.set('maxlongitude', maxlongitude);
  if (minmagnitude) usgsUrl.searchParams.set('minmagnitude', minmagnitude);
  if (orderby) usgsUrl.searchParams.set('orderby', orderby);

  try {
    const res = await fetch(usgsUrl.toString());
    const data = await res.json();
    return new Response(JSON.stringify({ ...data, _cached: false }), {
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
