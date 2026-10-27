export type Aircraft = {
    hex: string;
    callsign: string;
    registration?: string;
    type?: string;
    lat: number;
    lon: number;
    altitudeFt?: number;
    groundSpeedKt?: number;
    trackDeg?: number;
    verticalRateFpm?: number;
    squawk?: string;
    seenPos?: number;
};

export type Airport = {
    name: string;
    municipality?: string;
    iata?: string;
    icao?: string;
    lat: number;
    lon: number;
};

export type FlightRoute = {
    callsign: string;
    airline?: string;
    origin?: Airport;
    destination?: Airport;
};

const ADSB_PROXY_BASE = 'https://windy-adsb-proxy.4smmhrd2kk.workers.dev';

const finiteNumber = (value: unknown): number | undefined => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
};

export function normalizeAircraft(raw: any): Aircraft | null {
    const lat = finiteNumber(raw?.lat);
    const lon = finiteNumber(raw?.lon);
    if (lat === undefined || lon === undefined) return null;

    const altitudeRaw = raw?.alt_baro ?? raw?.alt_geom;
    const altitudeFt = altitudeRaw === 'ground' ? 0 : finiteNumber(altitudeRaw);
    const callsign = String(raw?.flight ?? raw?.callsign ?? '').trim();
    const hex = String(raw?.hex ?? raw?.icao ?? '').trim();

    return {
        hex,
        callsign: callsign || hex.toUpperCase() || 'Avion',
        registration: raw?.r ? String(raw.r).trim() : undefined,
        type: raw?.t ? String(raw.t).trim() : undefined,
        lat,
        lon,
        altitudeFt,
        groundSpeedKt: finiteNumber(raw?.gs),
        trackDeg: finiteNumber(raw?.track ?? raw?.true_heading ?? raw?.mag_heading),
        verticalRateFpm: finiteNumber(raw?.baro_rate ?? raw?.geom_rate),
        squawk: raw?.squawk ? String(raw.squawk) : undefined,
        seenPos: finiteNumber(raw?.seen_pos),
    };
}

export async function fetchAircraft(
    lat: number,
    lon: number,
    radiusNm: number,
    signal?: AbortSignal,
): Promise<Aircraft[]> {
    const radius = Math.max(5, Math.min(250, Math.round(radiusNm)));
    const url = `${ADSB_PROXY_BASE}/aircraft?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}&dist=${radius}`;

    const response = await fetch(url, {
        method: 'GET', signal, headers: { Accept: 'application/json' }, cache: 'no-store',
    });
    if (!response.ok) throw new Error(`ADS-B HTTP ${response.status}`);

    const data = await response.json();
    const rawList = Array.isArray(data?.ac) ? data.ac : Array.isArray(data?.aircraft) ? data.aircraft : [];

    return rawList
        .map(normalizeAircraft)
        .filter((a: Aircraft | null): a is Aircraft => Boolean(a))
        .filter((a) => a.seenPos === undefined || a.seenPos <= 45)
        .slice(0, 500);
}

function normalizeAirport(raw: any): Airport | undefined {
    if (!raw) return undefined;
    const lat = finiteNumber(raw.latitude ?? raw.lat);
    const lon = finiteNumber(raw.longitude ?? raw.lon ?? raw.lng);
    if (lat === undefined || lon === undefined) return undefined;
    return {
        name: String(raw.name ?? raw.airport_name ?? raw.icao_code ?? raw.iata_code ?? 'Aéroport'),
        municipality: raw.municipality ? String(raw.municipality) : undefined,
        iata: raw.iata_code ? String(raw.iata_code) : raw.iata ? String(raw.iata) : undefined,
        icao: raw.icao_code ? String(raw.icao_code) : raw.icao ? String(raw.icao) : undefined,
        lat, lon,
    };
}

export async function fetchFlightRoute(
    callsign: string,
    signal?: AbortSignal,
): Promise<FlightRoute | null> {
    const clean = callsign.trim();
    if (!clean || clean === 'Avion') return null;

    const response = await fetch(`${ADSB_PROXY_BASE}/route?callsign=${encodeURIComponent(clean)}`, {
        method: 'GET', signal, headers: { Accept: 'application/json' }, cache: 'no-store',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Route HTTP ${response.status}`);

    const data = await response.json();
    const route = data?.response?.flightroute ?? data?.flightroute ?? data?.route ?? data;
    if (!route || typeof route !== 'object') return null;

    const origin = normalizeAirport(route.origin);
    const destination = normalizeAirport(route.destination);
    if (!origin && !destination) return null;

    return {
        callsign: String(route.callsign ?? clean),
        airline: route.airline?.name ? String(route.airline.name) : undefined,
        origin,
        destination,
    };
}

export function altitudeColor(altitudeFt?: number): string {
    if (altitudeFt === undefined) return '#f2f4f7';
    if (altitudeFt < 2500) return '#6ee7b7';
    if (altitudeFt < 5000) return '#22c55e';
    if (altitudeFt < 10000) return '#38bdf8';
    if (altitudeFt < 20000) return '#2563eb';
    if (altitudeFt < 30000) return '#a78bfa';
    if (altitudeFt < 40000) return '#f59e0b';
    if (altitudeFt < 50000) return '#ef4444';
    return '#ec4899';
}

export const ktToKmh = (kt?: number) => (kt === undefined ? undefined : kt * 1.852);
