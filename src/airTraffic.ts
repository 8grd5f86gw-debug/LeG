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

// IMPORTANT : remplace cette URL par l'URL de ton Cloudflare Worker.
// Exemple : https://windy-adsb-proxy.ton-compte.workers.dev
const ADSB_PROXY_BASE = 'https://REMPLACE-MOI.workers.dev';

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
        trackDeg: finiteNumber(raw?.track ?? raw?.true_heading),
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
        method: 'GET',
        signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
    });

    if (!response.ok) throw new Error(`ADS-B HTTP ${response.status}`);

    const data = await response.json();
    const rawList = Array.isArray(data?.ac)
        ? data.ac
        : Array.isArray(data?.aircraft)
          ? data.aircraft
          : [];

    return rawList
        .map(normalizeAircraft)
        .filter((a: Aircraft | null): a is Aircraft => Boolean(a))
        .filter((a) => a.seenPos === undefined || a.seenPos <= 45)
        .slice(0, 450);
}

export function altitudeColor(altitudeFt?: number): string {
    if (altitudeFt === undefined) return '#e8eef5';
    if (altitudeFt < 3000) return '#69d37d';
    if (altitudeFt < 10000) return '#82c7ff';
    if (altitudeFt < 25000) return '#ffd166';
    if (altitudeFt < 35000) return '#ff9f43';
    return '#f06a8a';
}

export const ktToKmh = (kt?: number) => (kt === undefined ? undefined : kt * 1.852);
