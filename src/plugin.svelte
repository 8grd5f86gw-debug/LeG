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
                    <div class="toggle-pills">
                        <label class:active={enabled} class="toggle-pill">
                            <input type="checkbox" bind:checked={enabled} on:change={redraw} />
                            <span>🌙</span><em>Nuit</em>
                        </label>
                        <label class:active={showTwilight} class="toggle-pill">
                            <input type="checkbox" bind:checked={showTwilight} on:change={redraw} />
                            <span>🌆</span><em>Crép.</em>
                        </label>
                        <label class:active={showTerminator} class="toggle-pill wide">
                            <input type="checkbox" bind:checked={showTerminator} on:change={redraw} />
                            <span>／</span><em>J/N</em>
                        </label>
                    </div>

                    <div class="setting-row opacity-row">
                        <span>Opacité</span>
                        <strong>{Math.round(Number(opacity) * 100)}%</strong>
                    </div>
                    <input class="opacity-slider" type="range" min="0.15" max="0.70" step="0.05" bind:value={opacity} on:input={redraw} />

                    <div class="twilight-legend compact">
                        <span><i class="tw civil"></i></span>
                        <span><i class="tw nautical"></i></span>
                        <span><i class="tw astro"></i></span>
                        <span><i class="tw night"></i></span>
                    </div>

                    <div class="footer-info">{displayTime}</div>
                </section>
            {:else}
                <section class="section traffic-section">
                    <div class="traffic-toolbar">
                        <div class="traffic-toolbar-left">
                            <label class="switch-mini" title="Afficher le trafic aérien">
                                <input type="checkbox" bind:checked={showAircraft} on:change={toggleAircraft} />
                                <span></span>
                            </label>
                            <div class="mode-icon">✈</div>
                        </div>
                        <button class="mini-action" on:click={refreshAircraft} title="Actualiser maintenant">↻</button>
                    </div>

                    {#if showAircraft}
                        <div class="traffic-badges">
                            <div class:ok={aircraftStatus === 'ok'} class:error={aircraftStatus === 'error'} class="badge status-badge">
                                <i></i>
                                <span>{aircraftStatusText}</span>
                            </div>
                            <div class="badge">◎ {aircraftRadiusNm} NM</div>
                        </div>

                        <div class="rate-row">
                            <span class="rate-icon">⏱</span>
                            <div class="rate-pills">
                                <button class:active={refreshSeconds === 2} on:click={() => setRefreshRateOption(2)}>2s</button>
                                <button class:active={refreshSeconds === 5} on:click={() => setRefreshRateOption(5)}>5s</button>
                                <button class:active={refreshSeconds === 10} on:click={() => setRefreshRateOption(10)}>10s</button>
                                <button class:active={refreshSeconds === 15} on:click={() => setRefreshRateOption(15)}>15s</button>
                            </div>
                        </div>

                        <div class="traffic-footer">
                            <a class="attribution" href="https://adsb.lol/" target="_blank" rel="noreferrer">adsb.lol</a>
                        </div>
                    {:else}
                        <div class="disabled-note">✈ off</div>
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
                        [rings.minus15, rings.astronomical, '#102334', Math.min(0.40, o * 0.90)],
                    ] as const;

                    for (const [outer, inner, color, fillOpacity] of bands) {
                        addLayer(makeBand(outer, inner, shift), { color: '#000', weight: 0, opacity: 0, fillColor: color, fillOpacity });
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

    function airportCode(route: FlightRoute | null | undefined, which: 'origin' | 'destination'): string {
        const airport = route?.[which];
        if (!airport) return '—';
        return airport.iata || airport.icao || '—';
    }

    function airportCity(route: FlightRoute | null | undefined, which: 'origin' | 'destination'): string {
        const airport = route?.[which];
        if (!airport) return 'Indispo';
        return airport.municipality || airport.name || 'Indispo';
    }

    function popupItem(icon: string, value: string) {
        return `<div class="air-stat"><span class="air-stat-icon">${icon}</span><span class="air-stat-value">${value}</span></div>`;
    }

    function popupHtml(a: Aircraft): string {
        const alt = a.altitudeFt === undefined ? '—' : `${Math.round(a.altitudeFt).toLocaleString('fr-FR')} ft`;
        const speedKmh = ktToKmh(a.groundSpeedKt);
        const speed = speedKmh === undefined ? '—' : `${Math.round(speedKmh)} km/h`;
        const track = a.trackDeg === undefined ? '—' : `${Math.round(a.trackDeg)}°`;
        const vr = a.verticalRateFpm === undefined ? '—' : `${Math.round(a.verticalRateFpm)} ft/min`;
        const reg = a.registration || '—';
        const type = a.type || '—';
        const cached = routeCache.get(a.callsign.trim());
        const loading = routeLoading.has(a.callsign.trim());

        let routeHtml = '';
        if (cached) {
            routeHtml = `
                <div class="route-card">
                    <div class="route-strip">
                        <div class="route-end route-left">
                            <div class="route-code">${airportCode(cached, 'origin')}</div>
                            <div class="route-city">${airportCity(cached, 'origin')}</div>
                        </div>
                        <div class="route-center">
                            <div class="route-line"></div>
                            <div class="route-plane">✈</div>
                        </div>
                        <div class="route-end route-right">
                            <div class="route-code">${airportCode(cached, 'destination')}</div>
                            <div class="route-city">${airportCity(cached, 'destination')}</div>
                        </div>
                    </div>
                    <div class="route-meta">${cached.airline || 'Route'} · trait plein = observé · pointillés = arrivée</div>
                </div>`;
        } else if (loading) {
            routeHtml = `<div class="route-card route-muted">Recherche de la route…</div>`;
        } else {
            routeHtml = `<div class="route-card route-muted">Route indisponible</div>`;
        }

        return `
            <div class="windy-aircraft-popup wide-popup">
                <div class="air-popup-header">
                    <div class="air-popup-flight">${a.callsign}</div>
                    <div class="air-popup-sub">${type}${a.registration ? ` · ${a.registration}` : ''}</div>
                </div>
                <div class="air-stats-grid">
                    ${popupItem('🪪', reg)}
                    ${popupItem('🛩', type)}
                    ${popupItem('⛰', alt)}
                    ${popupItem('⚡', speed)}
                    ${popupItem('🧭', track)}
                    ${popupItem('↕', vr)}
                </div>
                ${routeHtml}
            </div>`;
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
        aircraftStatusText = '…';

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
                    marker.bindPopup(popupHtml(a), { maxWidth: 320, autoPan: true });
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
            aircraftStatusText = `${aircraft.length}`;
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            aircraftStatus = 'error';
            aircraftStatusText = 'ADS-B indispo';
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

    function setRefreshRateOption(seconds: number) {
        refreshSeconds = seconds;
        changeRefreshRate();
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
        width: 242px;
        color: #fff;
        background: linear-gradient(180deg, rgba(24, 27, 34, 0.96), rgba(17, 20, 28, 0.96));
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(12px);
        overflow: hidden;
        font-size: 11.5px;
        line-height: 1.25;
    }

    .weather-flights-panel.collapsed { width: 166px; }

    .header-row {
        height: 42px;
        padding: 0 11px 0 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .panel-title {
        font-size: 14px;
        font-weight: 760;
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
        margin: 0 9px;
        padding: 4px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        background: rgba(255,255,255,.06);
        border-radius: 12px;
    }

    .tabs button {
        border: 0;
        border-radius: 10px;
        padding: 8px 6px;
        background: transparent;
        color: rgba(255,255,255,.70);
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
    }

    .tabs button.active {
        background: rgba(255,255,255,.12);
        color: #fff;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.05);
    }

    .panel-body {
        max-height: 300px;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
    }

    .section { padding: 11px 12px 12px; }

    .toggle-pills {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 7px;
    }

    .toggle-pill {
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 8px 6px;
        background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.06);
        border-radius: 11px;
        cursor: pointer;
    }

    .toggle-pill input { display: none; }
    .toggle-pill span { font-size: 12px; }
    .toggle-pill em { font-style: normal; font-size: 10.5px; font-weight: 650; color: rgba(255,255,255,.78); }
    .toggle-pill.active {
        background: rgba(255,255,255,.11);
        border-color: rgba(255,255,255,.12);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }

    .setting-row {
        margin-top: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: rgba(255,255,255,.92);
    }

    .opacity-slider { width: 100%; margin-top: 7px; }

    .twilight-legend.compact {
        margin-top: 10px;
        display: flex;
        gap: 8px;
        justify-content: center;
    }

    .twilight-legend .tw {
        width: 14px;
        height: 14px;
        display: inline-block;
        border-radius: 50%;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
    }

    .tw.civil { background: #416786; }
    .tw.nautical { background: #263f58; }
    .tw.astro { background: #102334; }
    .tw.night { background: #06090f; }

    .footer-info {
        margin-top: 10px;
        text-align: center;
        color: rgba(255,255,255,.86);
        font-size: 10.5px;
        letter-spacing: .1px;
    }

    .traffic-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .traffic-toolbar-left {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .mode-icon {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: rgba(255,255,255,.08);
        font-size: 12px;
    }

    .mini-action {
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 50%;
        background: rgba(255,255,255,.08);
        color: #fff;
        cursor: pointer;
    }

    .traffic-badges {
        margin-top: 12px;
        display: grid;
        grid-template-columns: 1.4fr .9fr;
        gap: 7px;
    }

    .badge {
        min-width: 0;
        height: 30px;
        padding: 0 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-radius: 10px;
        background: rgba(255,255,255,.06);
        color: #fff;
        font-size: 11px;
        font-weight: 650;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .status-badge i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #7d8596;
        flex: 0 0 auto;
    }

    .status-badge.ok i { background: #3ed07f; }
    .status-badge.error i { background: #ff6f7a; }

    .rate-row {
        margin-top: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .rate-icon { font-size: 13px; opacity: .86; }

    .rate-pills {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 5px;
    }

    .rate-pills button {
        border: 0;
        border-radius: 9px;
        padding: 7px 0;
        background: rgba(255,255,255,.07);
        color: rgba(255,255,255,.82);
        font-size: 10.5px;
        font-weight: 700;
        cursor: pointer;
    }

    .rate-pills button.active {
        background: rgba(255,255,255,.15);
        color: #fff;
    }

    .traffic-footer {
        margin-top: 10px;
        display: flex;
        justify-content: flex-end;
    }

    .disabled-note {
        margin-top: 10px;
        text-align: center;
        color: rgba(255,255,255,.62);
    }

    .attribution {
        color: rgba(255,255,255,.5);
        font-size: 10px;
        text-decoration: none;
    }

    .attribution:hover { color: #fff; }

    .switch-mini input { display: none; }
    .switch-mini span {
        display: inline-block;
        width: 34px;
        height: 19px;
        border-radius: 99px;
        background: rgba(255,255,255,.22);
        position: relative;
        cursor: pointer;
    }
    .switch-mini span::after {
        content: '';
        position: absolute;
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background: #fff;
        top: 2px;
        left: 2px;
        transition: .15s;
    }
    .switch-mini input:checked + span { background: #2da85a; }
    .switch-mini input:checked + span::after { left: 17px; }

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

    :global(.windy-aircraft-popup.wide-popup) {
        width: 290px;
        max-width: 290px;
        font-size: 12px;
        line-height: 1.25;
        margin: -2px;
    }

    :global(.air-popup-header) {
        display: flex;
        flex-direction: column;
        gap: 3px;
        margin-bottom: 10px;
    }

    :global(.air-popup-flight) {
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -.3px;
    }

    :global(.air-popup-sub) {
        font-size: 12px;
        color: rgba(0,0,0,.62);
    }

    :global(.air-stats-grid) {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 12px;
    }

    :global(.air-stat) {
        min-height: 42px;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 8px 10px;
        border-radius: 12px;
        background: #f3f5f7;
    }

    :global(.air-stat-icon) {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: #ffffff;
        font-size: 12px;
        flex: 0 0 auto;
        box-shadow: 0 1px 3px rgba(0,0,0,.08);
    }

    :global(.air-stat-value) {
        font-size: 12px;
        font-weight: 700;
        color: #101319;
        line-height: 1.2;
        word-break: break-word;
    }

    :global(.route-card) {
        margin-top: 2px;
        padding-top: 11px;
        border-top: 1px solid rgba(0,0,0,.10);
    }

    :global(.route-strip) {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 8px;
    }

    :global(.route-end) { min-width: 0; }
    :global(.route-left) { text-align: left; }
    :global(.route-right) { text-align: right; }
    :global(.route-code) {
        font-size: 21px;
        font-weight: 800;
        letter-spacing: -.4px;
        line-height: 1;
    }
    :global(.route-city) {
        margin-top: 3px;
        font-size: 12px;
        color: rgba(0,0,0,.64);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    :global(.route-center) {
        width: 70px;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    :global(.route-line) {
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        height: 2px;
        background: linear-gradient(90deg, rgba(0,0,0,.18), rgba(0,0,0,.35), rgba(0,0,0,.18));
        transform: translateY(-50%);
    }

    :global(.route-plane) {
        position: relative;
        z-index: 1;
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 4px rgba(0,0,0,.12);
        font-size: 12px;
    }

    :global(.route-meta) {
        margin-top: 8px;
        font-size: 10px;
        color: rgba(0,0,0,.55);
    }

    :global(.route-muted) { color: rgba(0,0,0,.55); }
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
