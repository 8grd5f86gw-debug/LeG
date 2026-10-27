const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const mod360 = (x: number) => ((x % 360) + 360) % 360;
const wrap180 = (x: number) => ((x + 180) % 360 + 360) % 360 - 180;

export type SunPoint = {
    subsolarLat: number;
    subsolarLon: number;
    antisolarLat: number;
    antisolarLon: number;
};

export function getSunPoint(timestampMs: number): SunPoint {
    const jd = timestampMs / 86400000 + 2440587.5;
    const n = jd - 2451545.0;

    const meanLongitude = mod360(280.460 + 0.9856474 * n);
    const meanAnomaly = mod360(357.528 + 0.9856003 * n) * DEG;
    const eclipticLongitude =
        (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.020 * Math.sin(2 * meanAnomaly)) * DEG;
    const obliquity = (23.439 - 0.0000004 * n) * DEG;

    const rightAscension = Math.atan2(
        Math.cos(obliquity) * Math.sin(eclipticLongitude),
        Math.cos(eclipticLongitude),
    );
    const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));

    const gmst = mod360(280.46061837 + 360.98564736629 * (jd - 2451545.0));
    const subsolarLon = wrap180(rightAscension * RAD - gmst);
    const subsolarLat = declination * RAD;

    return {
        subsolarLat,
        subsolarLon,
        antisolarLat: -subsolarLat,
        antisolarLon: wrap180(subsolarLon + 180),
    };
}

export function getNightHemisphereRing(timestampMs: number, steps = 240): [number, number][] {
    const sun = getSunPoint(timestampMs);
    const lat1 = sun.antisolarLat * DEG;
    const lon1 = sun.antisolarLon * DEG;
    const distance = Math.PI / 2;

    const points: [number, number][] = [];
    let previousLon: number | null = null;

    for (let i = 0; i <= steps; i += 1) {
        const bearing = (i / steps) * Math.PI * 2;
        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(distance) +
            Math.cos(lat1) * Math.sin(distance) * Math.cos(bearing),
        );

        const lon2 = lon1 + Math.atan2(
            Math.sin(bearing) * Math.sin(distance) * Math.cos(lat1),
            Math.cos(distance) - Math.sin(lat1) * Math.sin(lat2),
        );

        const lat = Math.max(-89.999, Math.min(89.999, lat2 * RAD));
        let lon = wrap180(lon2 * RAD);

        if (previousLon !== null) {
            while (lon - previousLon > 180) lon -= 360;
            while (lon - previousLon < -180) lon += 360;
        }

        previousLon = lon;
        points.push([lon, lat]);
    }

    return points;
}

export function formatUtc(timestampMs: number): string {
    return new Date(timestampMs).toLocaleString('fr-FR', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }) + ' UTC';
}
