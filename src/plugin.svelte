<div class="day-night-panel">
    <div class="day-night-title">🌗 Jour / Nuit</div>

    <label class="toggle-row">
        <input type="checkbox" bind:checked={enabled} on:change={redraw} />
        <span>Zone nuit</span>
    </label>

    <label class="toggle-row">
        <input type="checkbox" bind:checked={showTerminator} on:change={redraw} />
        <span>Ligne J / N</span>
    </label>

    <label class="toggle-row">
        <input type="checkbox" bind:checked={showTwilight} on:change={redraw} />
        <span>Crépuscules</span>
    </label>

    <div class="slider-row">
        <span>Opacité nuit</span>
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

    {#if enabled && showTwilight}
        <div class="legend">
            <div class="legend-item"><span class="swatch civil"></span> Civil</div>
            <div class="legend-item"><span class="swatch nautical"></span> Nautique</div>
            <div class="legend-item"><span class="swatch astro"></span> Astronomique</div>
            <div class="legend-item"><span class="swatch night"></span> Nuit</div>
        </div>
    {/if}

    <div class="time">{displayTime}</div>
</div>

<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { map } from '@windy/map';
    import store from '@windy/store';
    import { formatUtc, getTwilightRings } from './solar';

    let enabled = true;
    let showTerminator = true;
    let showTwilight = true;
    let opacity = 0.40;
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

    const makeBandPolygon = (
        outerRing: [number, number][],
        innerRing: [number, number][],
        lonShift: number,
    ) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
            type: 'Polygon' as const,
            coordinates: [
                outerRing.map(([lon, lat]) => [lon + lonShift, lat]),
                [...innerRing].reverse().map(([lon, lat]) => [lon + lonShift, lat]),
            ],
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

    const addLayer = (feature: GeoJSON.Feature, style: any) => {
        const layer = new L.GeoJSON(feature, {
            style,
            interactive: false,
        });
        layer.addTo(map);
        layers.push(layer);
    };

    function redraw() {
        clearLayers();

        const timestamp = getTimestamp();
        displayTime = formatUtc(timestamp);

        if (!enabled && !showTerminator) return;

        const rings = getTwilightRings(timestamp);
        const mainOpacity = Number(opacity);

        for (const shift of [-360, 0, 360]) {
            if (enabled) {
                if (showTwilight) {
                    addLayer(makeBandPolygon(rings.terminator, rings.civil, shift), {
                        color: '#000000',
                        weight: 0,
                        opacity: 0,
                        fillColor: '#496d91',
                        fillOpacity: Math.min(0.14, mainOpacity * 0.32),
                    });

                    addLayer(makeBandPolygon(rings.civil, rings.nautical, shift), {
                        color: '#000000',
                        weight: 0,
                        opacity: 0,
                        fillColor: '#2d4c69',
                        fillOpacity: Math.min(0.22, mainOpacity * 0.55),
                    });

                    addLayer(makeBandPolygon(rings.nautical, rings.astronomical, shift), {
                        color: '#000000',
                        weight: 0,
                        opacity: 0,
                        fillColor: '#183149',
                        fillOpacity: Math.min(0.32, mainOpacity * 0.78),
                    });

                    addLayer(makePolygon(rings.astronomical, shift), {
                        color: '#05070b',
                        weight: 0,
                        opacity: 0,
                        fillColor: '#05070b',
                        fillOpacity: mainOpacity,
                    });
                } else {
                    addLayer(makePolygon(rings.terminator, shift), {
                        color: '#05070b',
                        weight: 0,
                        opacity: 0,
                        fillColor: '#05070b',
                        fillOpacity: mainOpacity,
                    });
                }
            }

            if (showTerminator) {
                addLayer(makeLine(rings.terminator, shift), {
                    color: '#ffffff',
                    weight: 1.2,
                    opacity: 0.78,
                });
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
        width: 205px;
        padding: 10px 11px;
        border-radius: 11px;
        color: #fff;
        background: rgba(28, 31, 36, 0.90);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(8px);
        font-size: 12px;
        line-height: 1.25;
    }

    .day-night-title {
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 700;
    }

    .toggle-row,
    .slider-row {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 6px 0;
    }

    .slider-row {
        justify-content: space-between;
        margin-bottom: 4px;
    }

    .opacity-slider {
        width: 100%;
    }

    .legend {
        margin-top: 7px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px 8px;
        font-size: 10.5px;
        opacity: 0.92;
    }

    .legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .swatch {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        display: inline-block;
        flex: 0 0 auto;
    }

    .civil {
        background: #496d91;
    }

    .nautical {
        background: #2d4c69;
    }

    .astro {
        background: #183149;
    }

    .night {
        background: #05070b;
    }

    .time {
        margin-top: 7px;
        padding-top: 7px;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        opacity: 0.8;
        font-size: 10px;
    }
</style>
