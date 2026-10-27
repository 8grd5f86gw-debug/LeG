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

// Cloudflare Worker proxy currently used by this plugin.
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
        .slice(0, 500);
}

// Altitude palette requested by the user.
// 0 / 2500 / 5000 / 10000 / 20000 / 30000 / 40000 / 50000+ ft
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

export function altitudeBandLabel(altitudeFt?: number): string {
    if (altitudeFt === undefined) return 'Altitude inconnue';
    if (altitudeFt < 2500) return '0–2 500 ft';
    if (altitudeFt < 5000) return '2 500–5 000 ft';
    if (altitudeFt < 10000) return '5 000–10 000 ft';
    if (altitudeFt < 20000) return '10 000–20 000 ft';
    if (altitudeFt < 30000) return '20 000–30 000 ft';
    if (altitudeFt < 40000) return '30 000–40 000 ft';
    if (altitudeFt < 50000) return '40 000–50 000 ft';
    return '50 000+ ft';
}

export const ktToKmh = (kt?: number) => (kt === undefined ? undefined : kt * 1.852);
