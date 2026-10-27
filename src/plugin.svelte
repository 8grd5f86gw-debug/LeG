<div class:collapsed class="weather-flights-panel">
    <div class="header-row">
        <div class="panel-title">🌗 Météo & Vols</div>
        <button class="icon-btn collapse-btn" on:click={() => (collapsed = !collapsed)} aria-label="Réduire le panneau">
            {collapsed ? '▾' : '▴'}
        </button>
    </div>

    {#if !collapsed}
        <div class="tabs" role="tablist" aria-label="Sections du plugin">
            <button class:active={activeTab === 'sky'} on:click={() => (activeTab = 'sky')}>☾ Ciel</button>
            <button class:active={activeTab === 'traffic'} on:click={() => (activeTab = 'traffic')}>✈ Vols</button>
        </div>

        <div class="panel-body">
            {#if activeTab === 'sky'}
                <section class="section sky-section">
                    <div class="control-grid">
                        <label class="check-control">
                            <input type="checkbox" bind:checked={enabled} on:change={redraw} />
                            <span>Nuit</span>
                        </label>
                        <label class="check-control">
                            <input type="checkbox" bind:checked={showTwilight} on:change={redraw} />
                            <span>Crépuscules</span>
                        </label>
                        <label class="check-control full">
                            <input type="checkbox" bind:checked={showTerminator} on:change={redraw} />
                            <span>Terminateur jour / nuit</span>
                        </label>
                    </div>

                    <div class="setting-row opacity-row">
                        <span>Opacité de la nuit</span>
                        <strong>{Math.round(Number(opacity) * 100)}%</strong>
                    </div>
                    <input class="opacity-slider" type="range" min="0.15" max="0.70" step="0.05" bind:value={opacity} on:input={redraw} />

                    <div class="twilight-legend">
                        <span><i class="tw civil"></i>Civil</span>
                        <span><i class="tw nautical"></i>Nautique</span>
                        <span><i class="tw astro"></i>Astro.</span>
                        <span><i class="tw night"></i>Nuit</span>
                    </div>

                    <div class="footer-info">{displayTime}</div>
                </section>
            {:else}
                <section class="section traffic-section">
                    <div class="traffic-head">
                        <div>
                            <div class="section-title">Trafic aérien</div>
                            <div class="subtle">ADS-B autour du centre de la carte</div>
                        </div>
                        <label class="switch-mini" title="Afficher le trafic aérien">
                            <input type="checkbox" bind:checked={showAircraft} on:change={toggleAircraft} />
                            <span></span>
                        </label>
                    </div>

                    {#if showAircraft}
                        <div class="status-card" class:status-error={aircraftStatus === 'error'} class:status-ok={aircraftStatus === 'ok'}>
                            <span class="status-dot"></span>
                            <span class="status-text">{aircraftStatusText}</span>
                            <button class="icon-btn refresh-btn" on:click={refreshAircraft} title="Actualiser maintenant">↻</button>
                        </div>

                        <div class="settings-box">
                            <div class="setting-row">
                                <span>Zone</span>
                                <strong>{aircraftRadiusNm} NM</strong>
                            </div>
                            <div class="setting-row">
                                <label for="refresh-rate">Rafraîchissement</label>
                                <select id="refresh-rate" bind:value={refreshSeconds} on:change={changeRefreshRate}>
                                    <option value={2}>2 s</option>
                                    <option value={5}>5 s</option>
                                    <option value={10}>10 s</option>
                                    <option value={15}>15 s</option>
                                </select>
                            </div>
                        </div>

                        <div class="hint">Le mode 2 s est plus réactif mais sollicite davantage la source ADS-B.</div>
                        <a class="attribution" href="https://adsb.lol/" target="_blank" rel="noreferrer">Données ADS-B : adsb.lol</a>
                    {:else}
                        <div class="disabled-note">Active le trafic pour afficher les avions sur la carte.</div>
                    {/if}
                </section>
            {/if}
        </div>
    {/if}
</div>

<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { map } from '@windy/map';
    import store from '@windy/store';
    import { formatUtc, getTwilightRings } from './solar';
    import { altitudeColor, fetchAircraft, fetchFlightRoute, ktToKmh, type Aircraft, type FlightRoute } from './airTraffic';

    let enabled = true;
    let showTerminator = true;
    let showTwilight = true;
    let opacity = 0.42;
    let collapsed = false;
    let activeTab: 'sky' | 'traffic' = 'sky';
    let displayTime = '';

    let showAircraft = true;
    let aircraftStatus: 'idle' | 'loading' | 'ok' | 'error' = 'idle';
    let aircraftStatusText = 'Prêt';
    let aircraftRadiusNm = 100;
    let refreshSeconds = 5;
    let aircraftTimer: ReturnType<typeof setInterval> | null = null;
    let aircraftAbort: AbortController | null = null;

    let layers: L.GeoJSON[] = [];
    type AircraftMarkerState = {
        marker: L.Marker;
        data: Aircraft;
        fromLat: number;
        fromLon: number;
        toLat: number;
        toLon: number;
        fromTrack: number;
        toTrack: number;
        startedAt: number;
        durationMs: number;
        lastSeenAt: number;
        trail: [number, number][];
    };

    const aircraftMarkers = new Map<string, AircraftMarkerState>();
    const routeCache = new Map<string, FlightRoute | null>();
    const routeLoading = new Set<string>();
    let selectedAircraftKey: string | null = null;
    let selectedTrailLayer: L.Polyline | null = null;
    let destinationLine: L.Polyline | null = null;
    let destinationMarker: L.Marker | null = null;
    let animationFrame: number | null = null;

    const clearLayers = () => {
        for (const layer of layers) layer.remove();
        layers = [];
    };

    const clearSelectionLayers = () => {
        selectedTrailLayer?.remove();
        destinationLine?.remove();
        destinationMarker?.remove();
        selectedTrailLayer = null;
        destinationLine = null;
        destinationMarker = null;
        selectedAircraftKey = null;
    };

    const clearAircraft = () => {
        clearSelectionLayers();
        for (const state of aircraftMarkers.values()) state.marker.remove();
        aircraftMarkers.clear();
    };

    const aircraftKey = (a: Aircraft) => a.hex || a.callsign;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const lerpLon = (a: number, b: number, t: number) => {
        let delta = b - a;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        let lon = a + delta * t;
        if (lon > 180) lon -= 360;
        if (lon < -180) lon += 360;
        return lon;
    };

    const lerpAngle = (a: number, b: number, t: number) => {
        let delta = ((b - a + 540) % 360) - 180;
        return (a + delta * t + 360) % 360;
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

    // SVG plane is drawn pointing north. Therefore ADS-B track can be applied directly:
    // 0° north, 90° east, 180° south, 270° west.
    function aircraftIcon(a: Aircraft) {
        const track = Math.round(a.trackDeg ?? 0);
        const color = altitudeColor(a.altitudeFt);
        const svg = `
            <div class="aircraft-rotator" style="transform:rotate(${track}deg)">
                <svg class="aircraft-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="${color}" d="M12 1.2c1 0 1.55.9 1.55 2v4.7l8.05 4.1v2.25l-8.05-2v6.35l3.35 2.25v1.8L12 21.3l-4.9 1.35v-1.8l3.35-2.25v-6.35l-8.05 2V12l8.05-4.1V3.2c0-1.1.55-2 1.55-2z"/>
                </svg>
            </div>`;

        return L.divIcon({
            className: 'windy-aircraft-icon-wrap',
            html: svg,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
        });
    }

    function airportLabel(route: FlightRoute | null | undefined, which: 'origin' | 'destination'): string {
        const airport = route?.[which];
        if (!airport) return '—';
        const code = airport.iata || airport.icao || '';
        const place = airport.municipality || airport.name;
        return code ? `${code} · ${place}` : place;
    }

    function popupHtml(a: Aircraft): string {
        const alt = a.altitudeFt === undefined ? '—' : `${Math.round(a.altitudeFt).toLocaleString('fr-FR')} ft`;
        const speedKmh = ktToKmh(a.groundSpeedKt);
        const speed = speedKmh === undefined ? '—' : `${Math.round(speedKmh)} km/h`;
        const track = a.trackDeg === undefined ? '—' : `${Math.round(a.trackDeg)}°`;
        const vr = a.verticalRateFpm === undefined ? '' : `<div>Vertical : ${Math.round(a.verticalRateFpm)} ft/min</div>`;
        const reg = a.registration ? `<div>Immat. : ${a.registration}</div>` : '';
        const type = a.type ? `<div>Type : ${a.type}</div>` : '';
        const cached = routeCache.get(a.callsign.trim());
        const loading = routeLoading.has(a.callsign.trim());
        let routeHtml = '';
        if (cached) {
            routeHtml = `<div class="route-block"><div class="route-title">${cached.airline || 'Route du vol'}</div><div>Départ : ${airportLabel(cached, 'origin')}</div><div>Arrivée : ${airportLabel(cached, 'destination')}</div><div class="route-note">Trait plein : trajet observé · pointillés : destination</div></div>`;
        } else if (loading) {
            routeHtml = `<div class="route-block route-muted">Recherche de la destination…</div>`;
        } else {
            routeHtml = `<div class="route-block route-muted">Destination non disponible</div>`;
        }
        return `<div class="windy-aircraft-popup"><strong>${a.callsign}</strong>${reg}${type}<div>Altitude : ${alt}</div><div>Vitesse : ${speed}</div><div>Cap : ${track}</div>${vr}${routeHtml}</div>`;
    }

    function updateSelectedOverlay() {
        if (!selectedAircraftKey) return;
        const state = aircraftMarkers.get(selectedAircraftKey);
        if (!state) return;

        if (!selectedTrailLayer) {
            selectedTrailLayer = L.polyline(state.trail, {
                color: '#ffffff', weight: 2.2, opacity: 0.82, interactive: false,
            }).addTo(map);
        } else {
            selectedTrailLayer.setLatLngs(state.trail);
        }

        const route = routeCache.get(state.data.callsign.trim());
        const destination = route?.destination;
        if (!destination) {
            destinationLine?.remove(); destinationLine = null;
            destinationMarker?.remove(); destinationMarker = null;
            return;
        }

        const current = state.marker.getLatLng();
        const target: [number, number] = [destination.lat, destination.lon];
        if (!destinationLine) {
            destinationLine = L.polyline([[current.lat, current.lng], target], {
                color: '#ffffff', weight: 1.6, opacity: 0.65, dashArray: '6 7', interactive: false,
            }).addTo(map);
        } else {
            destinationLine.setLatLngs([[current.lat, current.lng], target]);
        }

        const label = destination.iata || destination.icao || 'ARR';
        const icon = L.divIcon({
            className: 'destination-airport-icon',
            html: `<div class="destination-badge">🛬 ${label}</div>`,
            iconSize: [74, 24], iconAnchor: [37, 12],
        });
        if (!destinationMarker) {
            destinationMarker = L.marker(target, { icon, interactive: false, zIndexOffset: 850 }).addTo(map);
        } else {
            destinationMarker.setLatLng(target);
            destinationMarker.setIcon(icon);
        }
    }

    async function selectAircraft(key: string) {
        const state = aircraftMarkers.get(key);
        if (!state) return;
        selectedAircraftKey = key;
        updateSelectedOverlay();

        const callsign = state.data.callsign.trim();
        if (!callsign || callsign === 'Avion' || routeCache.has(callsign) || routeLoading.has(callsign)) {
            state.marker.setPopupContent(popupHtml(state.data));
            return;
        }

        routeLoading.add(callsign);
        state.marker.setPopupContent(popupHtml(state.data));
        try {
            const route = await fetchFlightRoute(callsign);
            routeCache.set(callsign, route);
        } catch {
            routeCache.set(callsign, null);
        } finally {
            routeLoading.delete(callsign);
            const latest = aircraftMarkers.get(key);
            if (latest) {
                latest.marker.setPopupContent(popupHtml(latest.data));
                updateSelectedOverlay();
            }
        }
    }

    function updateMarkerVisual(state: AircraftMarkerState, track: number) {
        const el = state.marker.getElement();
        if (!el) return;
        const rotator = el.querySelector('.aircraft-rotator') as HTMLElement | null;
        if (rotator) rotator.style.transform = `rotate(${track}deg)`;
        const path = el.querySelector('.aircraft-svg path') as SVGPathElement | null;
        if (path) path.setAttribute('fill', altitudeColor(state.data.altitudeFt));
    }

    function ensureAnimationLoop() {
        if (animationFrame !== null) return;

        const tick = (now: number) => {
            animationFrame = null;
            if (!showAircraft || aircraftMarkers.size === 0) return;

            for (const state of aircraftMarkers.values()) {
                const t = Math.max(0, Math.min(1, (now - state.startedAt) / state.durationMs));
                const lat = lerp(state.fromLat, state.toLat, t);
                const lon = lerpLon(state.fromLon, state.toLon, t);
                const track = lerpAngle(state.fromTrack, state.toTrack, t);
                state.marker.setLatLng([lat, lon]);
                updateMarkerVisual(state, track);
                if (selectedAircraftKey && aircraftMarkers.get(selectedAircraftKey) === state && destinationLine) {
                    const route = routeCache.get(state.data.callsign.trim());
                    const dest = route?.destination;
                    if (dest) destinationLine.setLatLngs([[lat, lon], [dest.lat, dest.lon]]);
                }
            }

            animationFrame = requestAnimationFrame(tick);
        };

        animationFrame = requestAnimationFrame(tick);
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
            const now = performance.now();
            const wallNow = Date.now();
            const seenKeys = new Set<string>();
            const durationMs = Math.max(900, Number(refreshSeconds) * 1000 * 0.92);

            for (const a of aircraft) {
                const key = aircraftKey(a);
                if (!key) continue;
                seenKeys.add(key);

                const existing = aircraftMarkers.get(key);
                if (existing) {
                    const current = existing.marker.getLatLng();
                    existing.fromLat = current.lat;
                    existing.fromLon = current.lng;
                    existing.toLat = a.lat;
                    existing.toLon = a.lon;
                    existing.fromTrack = existing.toTrack;
                    existing.toTrack = a.trackDeg ?? existing.toTrack;
                    existing.startedAt = now;
                    existing.durationMs = durationMs;
                    existing.lastSeenAt = wallNow;
                    const lastTrail = existing.trail[existing.trail.length - 1];
                    if (!lastTrail || map.distance(L.latLng(lastTrail[0], lastTrail[1]), L.latLng(a.lat, a.lon)) > 150) {
                        existing.trail.push([a.lat, a.lon]);
                        if (existing.trail.length > 720) existing.trail.shift();
                    }
                    existing.data = a;
                    existing.marker.setPopupContent(popupHtml(a));
                    if (selectedAircraftKey === key) updateSelectedOverlay();
                    updateMarkerVisual(existing, existing.fromTrack);
                } else {
                    const marker = L.marker([a.lat, a.lon], {
                        icon: aircraftIcon(a),
                        keyboard: false,
                        riseOnHover: true,
                        zIndexOffset: 900,
                    });
                    marker.bindPopup(popupHtml(a), { maxWidth: 260, autoPan: true });
                    marker.on('click', () => selectAircraft(key));
                    marker.addTo(map);
                    aircraftMarkers.set(key, {
                        marker,
                        data: a,
                        fromLat: a.lat,
                        fromLon: a.lon,
                        toLat: a.lat,
                        toLon: a.lon,
                        fromTrack: a.trackDeg ?? 0,
                        toTrack: a.trackDeg ?? 0,
                        startedAt: now,
                        durationMs,
                        lastSeenAt: wallNow,
                        trail: [[a.lat, a.lon]],
                    });
                }
            }

            // Keep temporarily missing aircraft so an open popup is not destroyed by one missed ADS-B refresh.
            const staleAfterMs = Math.max(20000, Number(refreshSeconds) * 1000 * 4);
            for (const [key, state] of aircraftMarkers.entries()) {
                if (!seenKeys.has(key) && wallNow - state.lastSeenAt > staleAfterMs) {
                    if (selectedAircraftKey === key) clearSelectionLayers();
                    state.marker.remove();
                    aircraftMarkers.delete(key);
                }
            }

            ensureAnimationLoop();
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
        aircraftTimer = null;
        if (showAircraft) {
            aircraftTimer = setInterval(refreshAircraft, Number(refreshSeconds) * 1000);
        }
    }

    function changeRefreshRate() {
        startAircraftTimer();
        refreshAircraft();
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
            if (animationFrame !== null) cancelAnimationFrame(animationFrame);
            animationFrame = null;
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
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        animationFrame = null;
        aircraftAbort?.abort();
        if (aircraftTimer) clearInterval(aircraftTimer);
        store.off('timestamp', handleTimestamp);
        map.off('moveend', handleMapMove);
    });
</script>

<style lang="less">
    .weather-flights-panel {
        box-sizing: border-box;
        width: 228px;
        color: #fff;
        background: rgba(27, 30, 35, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 13px;
        box-shadow: 0 5px 22px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(10px);
        overflow: hidden;
        font-size: 11.5px;
        line-height: 1.25;
    }

    .weather-flights-panel.collapsed { width: 164px; }

    .header-row {
        height: 39px;
        padding: 0 10px 0 11px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .panel-title {
        font-size: 14px;
        font-weight: 750;
        letter-spacing: -0.1px;
        white-space: nowrap;
    }

    .icon-btn {
        border: 0;
        background: transparent;
        color: rgba(255,255,255,.8);
        cursor: pointer;
        padding: 2px 4px;
    }

    .collapse-btn { font-size: 11px; }

    .tabs {
        margin: 0 8px;
        padding: 3px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 3px;
        background: rgba(255,255,255,.06);
        border-radius: 9px;
    }

    .tabs button {
        border: 0;
        border-radius: 7px;
        padding: 6px 5px;
        background: transparent;
        color: rgba(255,255,255,.68);
        font-size: 11px;
        font-weight: 650;
        cursor: pointer;
    }

    .tabs button.active {
        background: rgba(255,255,255,.12);
        color: #fff;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.05);
    }

    .panel-body {
        max-height: 285px;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
    }

    .section { padding: 10px 11px 11px; }

    .control-grid {
        display: grid;
        grid-template-columns: 0.8fr 1.2fr;
        gap: 7px 8px;
    }

    .check-control {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
    }

    .check-control.full { grid-column: 1 / -1; }
    .check-control input { margin: 0; transform: scale(.9); }

    .setting-row,
    .traffic-head,
    .status-card,

    .hint,
    .disabled-note {
        margin-top: 8px;
        color: rgba(255,255,255,.48);
        font-size: 9px;
        line-height: 1.3;
    }

    .attribution {
        display: inline-block;
        margin-top: 6px;
        color: rgba(255,255,255,.52);
        font-size: 9px;
        text-decoration: none;
    }

    .attribution:hover { color: #fff; text-decoration: underline; }

    .switch-mini input { display: none; }
    .switch-mini span {
        display: inline-block;
        width: 31px;
        height: 17px;
        border-radius: 99px;
        background: rgba(255,255,255,.22);
        position: relative;
        cursor: pointer;
    }
    .switch-mini span::after {
        content: '';
        position: absolute;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #fff;
        top: 2px;
        left: 2px;
        transition: .15s;
    }
    .switch-mini input:checked + span { background: #2da85a; }
    .switch-mini input:checked + span::after { left: 16px; }

    :global(.windy-aircraft-icon-wrap) {
        background: transparent !important;
        border: 0 !important;
    }

    :global(.aircraft-rotator) {
        width: 26px;
        height: 26px;
        transform-origin: 50% 50%;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,.95));
    }

    :global(.aircraft-svg) {
        display: block;
        width: 26px;
        height: 26px;
        overflow: visible;
    }

    :global(.aircraft-svg path) {
        stroke: rgba(255,255,255,.92);
        stroke-width: .75px;
        vector-effect: non-scaling-stroke;
    }

    :global(.windy-aircraft-popup) {
        font-size: 12px;
        line-height: 1.35;
        min-width: 155px;
    }

    :global(.windy-aircraft-popup strong) {
        display: block;
        margin-bottom: 4px;
        font-size: 13px;
    }

    :global(.route-block) {
        margin-top: 7px;
        padding-top: 6px;
        border-top: 1px solid rgba(0,0,0,.12);
    }
    :global(.route-title) { font-weight: 700; margin-bottom: 2px; }
    :global(.route-muted) { opacity: .62; }
    :global(.route-note) { margin-top: 4px; font-size: 10px; opacity: .65; }
    :global(.destination-airport-icon) { background: transparent !important; border: 0 !important; }
    :global(.destination-badge) {
        display: inline-block;
        padding: 3px 7px;
        border-radius: 999px;
        background: rgba(20,24,31,.92);
        border: 1px solid rgba(255,255,255,.55);
        color: #fff;
        font-size: 10px;
        font-weight: 750;
        white-space: nowrap;
        box-shadow: 0 2px 7px rgba(0,0,0,.35);
    }

</style>
