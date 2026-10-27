<div class="day-night-panel">
    <div class="day-night-title">🌗 Jour / Nuit</div>

    <label class="toggle-row">
        <input type="checkbox" bind:checked={enabled} on:change={redraw} />
        <span>Afficher la zone de nuit</span>
    </label>

    <label class="toggle-row">
        <input type="checkbox" bind:checked={showTerminator} on:change={redraw} />
        <span>Afficher le terminateur</span>
    </label>

    <div class="slider-row">
        <span>Opacité nuit</span>
        <strong>{Math.round(opacity * 100)} %</strong>
    </div>
    <input
        class="opacity-slider"
        type="range"
        min="0.10"
        max="0.75"
        step="0.05"
        bind:value={opacity}
        on:input={redraw}
    />

    <div class="time">{displayTime}</div>
</div>

<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { map } from '@windy/map';
    import { store } from '@windy/store';
    import { formatUtc, getNightHemisphereRing } from './solar';

    let enabled = true;
    let showTerminator = true;
    let opacity = 0.42;
    let displayTime = '';

    let layers: any[] = [];

    function clearLayers() {
        for (const layer of layers) {
            try {
                layer.remove();
            } catch (_) {
                try { map.removeLayer(layer); } catch (_) { /* noop */ }
            }
        }
        layers = [];
    }

    function getTimestamp(): number {
        const value = store.get('timestamp') as number | undefined;
        return typeof value === 'number' ? value : Date.now();
    }

    function makeGeoJson(ring: [number, number][], lonShift: number) {
        const coordinates = ring.map(([lon, lat]) => [lon + lonShift, lat]);
        return {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'Polygon',
                coordinates: [coordinates],
            },
        } as any;
    }

    function makeLineGeoJson(ring: [number, number][], lonShift: number) {
        const coordinates = ring.map(([lon, lat]) => [lon + lonShift, lat]);
        return {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates,
            },
        } as any;
    }

    function redraw() {
        clearLayers();

        const ts = getTimestamp();
        displayTime = formatUtc(ts);

        if (!enabled && !showTerminator) return;

        const ring = getNightHemisphereRing(ts);

        // Three copies keep the overlay visible when Windy's map is wrapped
        // around the international date line.
        for (const shift of [-360, 0, 360]) {
            if (enabled) {
                const layer = L.geoJSON(makeGeoJson(ring, shift), {
                    style: {
                        color: '#05070b',
                        weight: 0,
                        opacity: 0,
                        fillColor: '#05070b',
                        fillOpacity: Number(opacity),
                    },
                    interactive: false,
                }).addTo(map);
                layers.push(layer);
            }

            if (showTerminator) {
                const line = L.geoJSON(makeLineGeoJson(ring, shift), {
                    style: {
                        color: '#ffffff',
                        weight: 1.4,
                        opacity: 0.78,
                    },
                    interactive: false,
                }).addTo(map);
                layers.push(line);
            }
        }
    }

    const handleTimestamp = () => redraw();
    const handleMove = () => redraw();

    onMount(() => {
        redraw();
        store.on('timestamp', handleTimestamp);
        map.on('moveend', handleMove);
    });

    onDestroy(() => {
        clearLayers();
        store.off('timestamp', handleTimestamp);
        map.off('moveend', handleMove);
    });
</script>

<style lang="less">
    .day-night-panel {
        position: absolute;
        z-index: 500;
        left: 12px;
        bottom: 95px;
        width: 230px;
        padding: 12px 14px;
        border-radius: 12px;
        color: white;
        background: rgba(28, 31, 36, 0.88);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(8px);
        font-size: 13px;
    }

    .day-night-title {
        font-size: 15px;
        font-weight: 700;
        margin-bottom: 10px;
    }

    .toggle-row,
    .slider-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 8px 0;
    }

    .slider-row {
        justify-content: space-between;
        margin-bottom: 3px;
    }

    .opacity-slider {
        width: 100%;
    }

    .time {
        margin-top: 9px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.14);
        opacity: 0.8;
        font-size: 11px;
    }

    @media (max-width: 700px) {
        .day-night-panel {
            left: 8px;
            right: 8px;
            bottom: 70px;
            width: auto;
        }
    }
</style>
