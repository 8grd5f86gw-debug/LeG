<div class="day-night-panel">
    <div class="day-night-title">🌗 Jour / Nuit</div>

    <label class="toggle-row">
        <input type="checkbox" bind:checked={enabled} on:change={redraw} />
        <span>Zone de nuit</span>
    </label>

    <label class="toggle-row">
        <input type="checkbox" bind:checked={showTerminator} on:change={redraw} />
        <span>Ligne jour / nuit</span>
    </label>

    <div class="slider-row">
        <span>Opacité</span>
        <strong>{Math.round(Number(opacity) * 100)} %</strong>
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
    import store from '@windy/store';
    import { formatUtc, getNightHemisphereRing } from './solar';

    let enabled = true;
    let showTerminator = true;
    let opacity = 0.42;
    let displayTime = '';
    let layers: L.GeoJSON[] = [];

    const clearLayers = () => {
        for (const layer of layers) {
            layer.remove();
        }
        layers = [];
    };

    const getTimestamp = (): number => {
        const value = store.get('timestamp');
        return typeof value === 'number' ? value : Date.now();
    };

    const makePolygon = (ring: [number, number][], lonShift: number) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
            type: 'Polygon' as const,
            coordinates: [ring.map(([lon, lat]) => [lon + lonShift, lat])],
        },
    });

    const makeLine = (ring: [number, number][], lonShift: number) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
            type: 'LineString' as const,
            coordinates: ring.map(([lon, lat]) => [lon + lonShift, lat]),
        },
    });

    function redraw() {
        clearLayers();

        const timestamp = getTimestamp();
        displayTime = formatUtc(timestamp);

        if (!enabled && !showTerminator) return;

        const ring = getNightHemisphereRing(timestamp);

        for (const shift of [-360, 0, 360]) {
            if (enabled) {
                const nightLayer = new L.GeoJSON(makePolygon(ring, shift), {
                    style: {
                        color: '#05070b',
                        weight: 0,
                        opacity: 0,
                        fillColor: '#05070b',
                        fillOpacity: Number(opacity),
                    },
                    interactive: false,
                });
                nightLayer.addTo(map);
                layers.push(nightLayer);
            }

            if (showTerminator) {
                const terminatorLayer = new L.GeoJSON(makeLine(ring, shift), {
                    style: {
                        color: '#ffffff',
                        weight: 1.4,
                        opacity: 0.78,
                    },
                    interactive: false,
                });
                terminatorLayer.addTo(map);
                layers.push(terminatorLayer);
            }
        }
    }

    const handleTimestamp = () => redraw();

    onMount(() => {
        redraw();
        store.on('timestamp', handleTimestamp);
    });

    onDestroy(() => {
        clearLayers();
        store.off('timestamp', handleTimestamp);
    });
</script>

<style lang="less">
    .day-night-panel {
        box-sizing: border-box;
        width: 240px;
        padding: 12px 14px;
        border-radius: 12px;
        color: #fff;
        background: rgba(28, 31, 36, 0.9);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(8px);
        font-size: 13px;
    }

    .day-night-title {
        margin-bottom: 10px;
        font-size: 15px;
        font-weight: 700;
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
</style>
