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

  if (url.pathname === '/search') {
    const input = (url.searchParams.get('flight') || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9]{2,12}$/.test(input)) return jsonResponse({ error: 'Invalid flight' }, 400);

    // Les numéros commerciaux IATA peuvent être différents du callsign ADS-B ICAO.
    // Exemple : AF898 -> AFR898 (Air France).
    const airlineMap = {
      AF: 'AFR', BA: 'BAW', LH: 'DLH', KL: 'KLM', U2: 'EZY',
      FR: 'RYR', IB: 'IBE', VY: 'VLG', TO: 'TVF',
      DL: 'DAL', AA: 'AAL', UA: 'UAL', EK: 'UAE', QR: 'QTR',
      AC: 'ACA', LX: 'SWR', TK: 'THY', W6: 'WZZ',
    };
    const candidates = [input];
    const match = input.match(/^([A-Z0-9]{2})([0-9].*)$/);
    if (match && airlineMap[match[1]]) candidates.unshift(airlineMap[match[1]] + match[2]);

    try {
      for (const callsign of [...new Set(candidates)]) {
        const upstream = `https://api.adsb.lol/v2/callsign/${encodeURIComponent(callsign)}`;
        const response = await fetch(upstream, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
          if (response.status === 404) continue;
          return jsonResponse({ error: `ADS-B upstream HTTP ${response.status}` }, 502);
        }
        const data = await response.json();
        const ac = Array.isArray(data?.ac) ? data.ac.filter(a =>
          a && Number.isFinite(a.lat) && Number.isFinite(a.lon) &&
          String(a.flight || '').trim().toUpperCase() === callsign
        ) : [];
        if (ac.length) return jsonResponse({ ac, query: input, callsign }, 200);
      }
      return jsonResponse({ ac: [], query: input }, 200);
    } catch (_) {
      return jsonResponse({ error: 'ADS-B search upstream unavailable' }, 502);
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
