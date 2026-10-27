<div class:collapsed class="day-night-panel">
    <div class="header-row">
        <div class="day-night-title">🌗 Météo & Vols</div>
        <button class="collapse-btn" on:click={() => (collapsed = !collapsed)} aria-label="Réduire le panneau">
            {collapsed ? '▾' : '▴'}
        </button>
    </div>

    {#if !collapsed}
        <section class="section">
            <div class="section-title">Jour / nuit</div>
            <div class="controls-grid">
                <label class="toggle-row">
                    <input type="checkbox" bind:checked={enabled} on:change={redraw} />
                    <span>Nuit</span>
                </label>
                <label class="toggle-row">
                    <input type="checkbox" bind:checked={showTwilight} on:change={redraw} />
                    <span>Crépuscules</span>
                </label>
                <label class="toggle-row wide">
                    <input type="checkbox" bind:checked={showTerminator} on:change={redraw} />
                    <span>Terminateur</span>
                </label>
            </div>

            <div class="slider-row">
                <span>Opacité</span>
                <strong>{Math.round(Number(opacity) * 100)}%</strong>
            </div>
            <input class="opacity-slider" type="range" min="0.15" max="0.70" step="0.05" bind:value={opacity} on:input={redraw} />
        </section>

        <section class="section aircraft-section">
            <div class="section-title section-title-row">
                <span>✈ Trafic aérien</span>
                <label class="switch-mini">
                    <input type="checkbox" bind:checked={showAircraft} on:change={toggleAircraft} />
                    <span></span>
                </label>
            </div>

            {#if showAircraft}
                <div class="traffic-status">
                    <span class:ok={aircraftStatus === 'ok'} class:error={aircraftStatus === 'error'}>
                        {aircraftStatusText}
                    </span>
                    <button class="refresh-btn" on:click={refreshAircraft} title="Actualiser">↻</button>
                </div>

                <div class="range-row">
                    <span>Zone</span>
                    <strong>{aircraftRadiusNm} NM</strong>
                </div>
                <div class="hint">Actualisation : 15 s · selon la zone affichée</div>
            {/if}
        </section>

        <div class="time">{displayTime}</div>
        <a class="attribution" href="https://adsb.fi/" target="_blank" rel="noreferrer">Données ADS-B : adsb.fi</a>
    {/if}
</div>

<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { map } from '@windy/map';
    import store from '@windy/store';
    import { formatUtc, getTwilightRings } from './solar';
    import { altitudeColor, fetchAircraft, ktToKmh, type Aircraft } from './airTraffic';

    let enabled = true;
    let showTerminator = true;
    let showTwilight = true;
    let opacity = 0.42;
    let collapsed = false;
    let displayTime = '';

    let showAircraft = true;
    let aircraftStatus: 'idle' | 'loading' | 'ok' | 'error' = 'idle';
    let aircraftStatusText = 'Prêt';
    let aircraftRadiusNm = 100;
    let aircraftTimer: ReturnType<typeof setInterval> | null = null;
    let aircraftAbort: AbortController | null = null;

    let layers: L.GeoJSON[] = [];
    let aircraftLayers: L.Marker[] = [];

    const clearLayers = () => {
        for (const layer of layers) layer.remove();
        layers = [];
    };

    const clearAircraft = () => {
        for (const marker of aircraftLayers) marker.remove();
        aircraftLayers = [];
    };

    const getTimestamp = (): number => {
        const value = store.get('timestamp');
        return typeof value === 'number' ? value : Date.now();
    };

    const shiftRing = (ring: [number, number][], lonShift: number) =>
        ring.map(([lon, lat]) => [lon + lonShift, lat]);

    const makePolygon = (ring: [number, number][], lonShift: number) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [shiftRing(ring, lonShift)] },
    });

    const makeBand = (outerRing: [number, number][], innerRing: [number, number][], lonShift: number) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
            type: 'Polygon' as const,
            coordinates: [shiftRing(outerRing, lonShift), shiftRing([...innerRing].reverse(), lonShift)],
        },
    });

    const makeLine = (ring: [number, number][], lonShift: number) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: shiftRing(ring, lonShift) },
    });

    const addLayer = (feature: any, style: any) => {
        const layer = new L.GeoJSON(feature, { style, interactive: false });
        layer.addTo(map);
        layers.push(layer);
    };

    function redraw() {
        clearLayers();
        displayTime = formatUtc(getTimestamp());
        if (!enabled && !showTerminator) return;

        const rings = getTwilightRings(getTimestamp());
        const o = Number(opacity);

        for (const shift of [-360, 0, 360]) {
            if (enabled) {
                if (showTwilight) {
                    const bands = [
                        [rings.horizon, rings.minus3, '#507aa1', Math.min(0.09, o * 0.20)],
                        [rings.minus3, rings.civil, '#416786', Math.min(0.14, o * 0.32)],
                        [rings.civil, rings.minus9, '#32536e', Math.min(0.20, o * 0.46)],
                        [rings.minus9, rings.nautical, '#263f58', Math.min(0.27, o * 0.60)],
                        [rings.nautical, rings.minus15, '#1a3048', Math.min(0.34, o * 0.78)],
                        [rings.minus15, rings.astronomical, '#11243a', Math.min(0.40, o * 0.90)],
                    ] as const;
                    for (const [outer, inner, color, fillOpacity] of bands) {
                        addLayer(makeBand(outer, inner, shift), { color, weight: 0, opacity: 0, fillColor: color, fillOpacity });
                    }
                    addLayer(makePolygon(rings.astronomical, shift), {
                        color: '#06090f', weight: 0, opacity: 0, fillColor: '#06090f', fillOpacity: o,
                    });
                } else {
                    addLayer(makePolygon(rings.horizon, shift), {
                        color: '#06090f', weight: 0, opacity: 0, fillColor: '#06090f', fillOpacity: o,
                    });
                }
            }

            if (showTerminator) {
                addLayer(makeLine(rings.horizon, shift), {
                    color: '#ffffff', weight: 1.05, opacity: 0.70, dashArray: '4 4',
                });
            }
        }
    }

    function viewportRadiusNm(): number {
        try {
            const center = map.getCenter();
            const bounds = map.getBounds();
            const distanceMeters = map.distance(center, bounds.getNorthEast());
            return Math.max(25, Math.min(250, Math.ceil(distanceMeters / 1852)));
        } catch {
            return 100;
        }
    }

    function aircraftIcon(a: Aircraft) {
        const track = Math.round(a.trackDeg ?? 0);
        const color = altitudeColor(a.altitudeFt);
        return L.divIcon({
            className: 'windy-aircraft-icon-wrap',
            html: `<div class="windy-aircraft-icon" style="color:${color};transform:rotate(${track}deg)">✈</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
        });
    }

    function popupHtml(a: Aircraft): string {
        const alt = a.altitudeFt === undefined ? '—' : `${Math.round(a.altitudeFt).toLocaleString('fr-FR')} ft`;
        const speedKmh = ktToKmh(a.groundSpeedKt);
        const speed = speedKmh === undefined ? '—' : `${Math.round(speedKmh)} km/h`;
        const track = a.trackDeg === undefined ? '—' : `${Math.round(a.trackDeg)}°`;
        const vr = a.verticalRateFpm === undefined ? '' : `<div>Vertical : ${Math.round(a.verticalRateFpm)} ft/min</div>`;
        const reg = a.registration ? `<div>Immat. : ${a.registration}</div>` : '';
        const type = a.type ? `<div>Type : ${a.type}</div>` : '';
        return `<div class="windy-aircraft-popup"><strong>${a.callsign}</strong>${reg}${type}<div>Altitude : ${alt}</div><div>Vitesse : ${speed}</div><div>Cap : ${track}</div>${vr}</div>`;
    }

    async function refreshAircraft() {
        if (!showAircraft) return;
        aircraftAbort?.abort();
        aircraftAbort = new AbortController();
        aircraftStatus = 'loading';
        aircraftStatusText = 'Actualisation…';

        const center = map.getCenter();
        aircraftRadiusNm = viewportRadiusNm();

        try {
            const aircraft = await fetchAircraft(center.lat, center.lng, aircraftRadiusNm, aircraftAbort.signal);
            clearAircraft();
            for (const a of aircraft) {
                const marker = L.marker([a.lat, a.lon], {
                    icon: aircraftIcon(a),
                    keyboard: false,
                    riseOnHover: true,
                    zIndexOffset: 900,
                });
                marker.bindPopup(popupHtml(a), { maxWidth: 220 });
                marker.addTo(map);
                aircraftLayers.push(marker);
            }
            aircraftStatus = 'ok';
            aircraftStatusText = `${aircraft.length} avion${aircraft.length > 1 ? 's' : ''}`;
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            aircraftStatus = 'error';
            aircraftStatusText = 'Source ADS-B indisponible';
        }
    }

    function startAircraftTimer() {
        if (aircraftTimer) clearInterval(aircraftTimer);
        if (showAircraft) aircraftTimer = setInterval(refreshAircraft, 15000);
    }

    function toggleAircraft() {
        if (showAircraft) {
            refreshAircraft();
            startAircraftTimer();
        } else {
            aircraftAbort?.abort();
            if (aircraftTimer) clearInterval(aircraftTimer);
            aircraftTimer = null;
            clearAircraft();
            aircraftStatus = 'idle';
            aircraftStatusText = 'Prêt';
        }
    }

    const handleTimestamp = () => redraw();
    const handleMapMove = () => {
        if (showAircraft) refreshAircraft();
    };

    onMount(() => {
        redraw();
        store.on('timestamp', handleTimestamp);
        map.on('moveend', handleMapMove);
        refreshAircraft();
        startAircraftTimer();
    });

    onDestroy(() => {
        clearLayers();
        clearAircraft();
        aircraftAbort?.abort();
        if (aircraftTimer) clearInterval(aircraftTimer);
        store.off('timestamp', handleTimestamp);
        map.off('moveend', handleMapMove);
    });
</script>

<style lang="less">
    .day-night-panel {
        box-sizing: border-box;
        width: 198px;
        padding: 9px 10px;
        border-radius: 10px;
        color: #fff;
        background: rgba(26, 29, 34, 0.90);
        box-shadow: 0 3px 14px rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(8px);
        font-size: 11.5px;
        line-height: 1.2;
    }
    .day-night-panel.collapsed { width: 154px; padding: 8px 10px; }
    .header-row, .section-title-row, .traffic-status, .range-row, .slider-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .day-night-title { font-size: 13px; font-weight: 700; white-space: nowrap; }
    .collapse-btn, .refresh-btn { border: 0; background: transparent; color: rgba(255,255,255,.78); cursor: pointer; padding: 0 2px; }
    .refresh-btn { font-size: 15px; }
    .section { margin-top: 8px; padding-top: 7px; border-top: 1px solid rgba(255,255,255,.11); }
    .section-title { font-weight: 700; font-size: 11px; opacity: .95; margin-bottom: 5px; }
    .controls-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 8px; }
    .toggle-row { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
    .toggle-row.wide { grid-column: 1 / -1; }
    .toggle-row input { margin: 0; transform: scale(.90); }
    .slider-row { margin-top: 7px; margin-bottom: 2px; }
    .opacity-slider { width: 100%; height: 12px; }
    .traffic-status { min-height: 18px; font-size: 10.5px; }
    .traffic-status .ok { color: #9be49e; }
    .traffic-status .error { color: #ff9b9b; }
    .range-row { margin-top: 3px; font-size: 10.5px; }
    .hint { margin-top: 3px; font-size: 9.5px; opacity: .60; }
    .time { margin-top: 8px; padding-top: 7px; border-top: 1px solid rgba(255,255,255,.11); opacity: .75; font-size: 9.5px; }
    .attribution { display: inline-block; margin-top: 4px; color: rgba(255,255,255,.65); font-size: 9.5px; text-decoration: none; }
    .attribution:hover { color: #fff; text-decoration: underline; }

    .switch-mini input { display: none; }
    .switch-mini span { display: inline-block; width: 25px; height: 14px; border-radius: 99px; background: rgba(255,255,255,.22); position: relative; cursor: pointer; }
    .switch-mini span::after { content: ''; position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #fff; top: 2px; left: 2px; transition: .15s; }
    .switch-mini input:checked + span { background: #2d9e56; }
    .switch-mini input:checked + span::after { left: 13px; }

    :global(.windy-aircraft-icon-wrap) { background: transparent !important; border: 0 !important; }
    :global(.windy-aircraft-icon) { width: 22px; height: 22px; line-height: 22px; text-align: center; font-size: 17px; font-weight: 700; filter: drop-shadow(0 1px 2px rgba(0,0,0,.9)); transform-origin: 50% 50%; }
    :global(.windy-aircraft-popup) { font-size: 12px; line-height: 1.35; min-width: 145px; }
    :global(.windy-aircraft-popup strong) { display: block; margin-bottom: 4px; font-size: 13px; }
</style>
