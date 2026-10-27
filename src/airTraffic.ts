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
    fetchedAt?: number;
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
        fetchedAt: Date.now(),
    };
}

async function fetchAircraftCell(
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
        .filter((a) => a.seenPos === undefined || a.seenPos <= 45);
}

function destinationPoint(latDeg: number, lonDeg: number, eastNm: number, northNm: number) {
    const distanceNm = Math.hypot(eastNm, northNm);
    if (distanceNm === 0) return { lat: latDeg, lon: lonDeg };

    const bearing = Math.atan2(eastNm, northNm);
    const earthRadiusNm = 3440.065;
    const angularDistance = distanceNm / earthRadiusNm;
    const lat1 = latDeg * Math.PI / 180;
    const lon1 = lonDeg * Math.PI / 180;

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
    );

    const lon2 = lon1 + Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

    return {
        lat: lat2 * 180 / Math.PI,
        lon: ((lon2 * 180 / Math.PI + 540) % 360) - 180,
    };
}

function makeSearchCenters(centerLat: number, centerLon: number) {
    // Maillage hexagonal. Chaque cellule interroge 250 NM.
    // 31 cellules couvrent approximativement un disque de 1000 NM autour du centre.
    const spacingNm = 430;
    const rowSpacingNm = spacingNm * Math.sqrt(3) / 2;
    const centers: { lat: number; lon: number }[] = [];

    for (let row = -4; row <= 4; row += 1) {
        const northNm = row * rowSpacingNm;
        const offset = Math.abs(row) % 2 === 1 ? spacingNm / 2 : 0;

        for (let col = -4; col <= 4; col += 1) {
            const eastNm = col * spacingNm + offset;
            const distanceFromCenter = Math.hypot(eastNm, northNm);
            if (distanceFromCenter > 1250) continue;
            centers.push(destinationPoint(centerLat, centerLon, eastNm, northNm));
        }
    }

    return centers;
}

function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 3440.065;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function fetchAircraftWide(
    centerLat: number,
    centerLon: number,
    signal?: AbortSignal,
): Promise<Aircraft[]> {
    const centers = makeSearchCenters(centerLat, centerLon);

    // Par petits lots pour éviter une rafale de 31 appels simultanés.
    const all: Aircraft[] = [];
    const batchSize = 6;

    for (let i = 0; i < centers.length; i += batchSize) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const batch = centers.slice(i, i + batchSize);
        const results = await Promise.allSettled(
            batch.map((c) => fetchAircraftCell(c.lat, c.lon, 250, signal)),
        );
        for (const result of results) {
            if (result.status === 'fulfilled') all.push(...result.value);
        }
    }

    const unique = new Map<string, Aircraft>();
    for (const aircraft of all) {
        const key = aircraft.hex || `${aircraft.callsign}-${aircraft.lat.toFixed(3)}-${aircraft.lon.toFixed(3)}`;
        const previous = unique.get(key);
        if (!previous || (aircraft.seenPos ?? 999) < (previous.seenPos ?? 999)) {
            unique.set(key, aircraft);
        }
    }

    return [...unique.values()]
        .filter((a) => distanceNm(centerLat, centerLon, a.lat, a.lon) <= 1000)
        .slice(0, 2500);
}

export function extrapolateAircraft(a: Aircraft, nowMs: number): [number, number] {
    if (a.groundSpeedKt === undefined || a.trackDeg === undefined || a.fetchedAt === undefined) {
        return [a.lat, a.lon];
    }

    const elapsedSeconds = Math.max(0, Math.min(12, (nowMs - a.fetchedAt) / 1000));
    const distanceNmTravelled = a.groundSpeedKt * elapsedSeconds / 3600;
    const track = a.trackDeg * Math.PI / 180;
    const eastNm = Math.sin(track) * distanceNmTravelled;
    const northNm = Math.cos(track) * distanceNmTravelled;
    const p = destinationPoint(a.lat, a.lon, eastNm, northNm);
    return [p.lat, p.lon];
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
