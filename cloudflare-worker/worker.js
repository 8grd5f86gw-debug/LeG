addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Cache-Control': 'no-store',
};

function jsonResponse(data, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': cache },
  });
}

async function handleRequest(request) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  if (url.pathname === '/aircraft') {
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    const dist = Math.round(Number(url.searchParams.get('dist')));

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lon) || lon < -180 || lon > 180 ||
        !Number.isFinite(dist) || dist < 1 || dist > 250) {
      return jsonResponse({ error: 'Invalid parameters' }, 400);
    }

    const upstream = `https://api.adsb.lol/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${dist}`;
    try {
      const response = await fetch(upstream, { headers: { Accept: 'application/json' } });
      const body = await response.arrayBuffer();
      const headers = new Headers(corsHeaders);
      headers.set('Content-Type', response.headers.get('Content-Type') || 'application/json');
      return new Response(body, { status: response.status, headers });
    } catch (_) {
      return jsonResponse({ error: 'ADS-B upstream unavailable' }, 502);
    }
  }

  if (url.pathname === '/route') {
    const callsign = (url.searchParams.get('callsign') || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,12}$/.test(callsign)) return jsonResponse({ error: 'Invalid callsign' }, 400);

    // Route enrichment is requested only when the user clicks an aircraft.
    // ADSBDB returns structured origin/destination airport coordinates.
    const upstream = `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`;
    try {
      const response = await fetch(upstream, { headers: { Accept: 'application/json' } });
      if (response.status === 404) return jsonResponse({ error: 'Route not found' }, 404, 'public, max-age=300');
      const body = await response.arrayBuffer();
      const headers = new Headers(corsHeaders);
      headers.set('Content-Type', response.headers.get('Content-Type') || 'application/json');
      headers.set('Cache-Control', 'public, max-age=3600');
      return new Response(body, { status: response.status, headers });
    } catch (_) {
      return jsonResponse({ error: 'Route upstream unavailable' }, 502);
    }
  }

  return new Response('Not found', { status: 404, headers: corsHeaders });
}
