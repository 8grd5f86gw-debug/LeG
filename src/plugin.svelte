<div class:collapsed class="day-night-panel">
    <div class="header-row">
        <div class="day-night-title">🌗 Jour / Nuit</div>
        <button class="collapse-btn" on:click={() => (collapsed = !collapsed)} aria-label="Réduire le panneau">
            {collapsed ? '▾' : '▴'}
        </button>
    </div>

    {#if !collapsed}
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

        <input
            class="opacity-slider"
            type="range"
            min="0.15"
            max="0.70"
            step="0.05"
            bind:value={opacity}
            on:input={redraw}
        />

        {#if enabled && showTwilight}
            <div class="legend">
                <div><span class="dot civil"></span>Civil</div>
                <div><span class="dot nautical"></span>Nautique</div>
                <div><span class="dot astro"></span>Astro.</div>
                <div><span class="dot night"></span>Nuit</div>
            </div>
        {/if}

        <div class="time">{displayTime}</div>
    {/if}
</div>

<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { map } from '@windy/map';
    import store from '@windy/store';
    import { formatUtc, getTwilightRings } from './solar';

    let enabled = true;
    let showTerminator = true;
    let showTwilight = true;
    let opacity = 0.42;
    let collapsed = false;
    let displayTime = '';
    let layers: L.GeoJSON[] = [];

    const clearLayers = () => {
        for (const layer of layers) layer.remove();
        layers = [];
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
        geometry: {
            type: 'Polygon' as const,
            coordinates: [shiftRing(ring, lonShift)],
        },
    });

    const makeBand = (
        outerRing: [number, number][],
        innerRing: [number, number][],
        lonShift: number,
    ) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
            type: 'Polygon' as const,
            coordinates: [
                shiftRing(outerRing, lonShift),
                shiftRing([...innerRing].reverse(), lonShift),
            ],
        },
    });

    const makeLine = (ring: [number, number][], lonShift: number) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
            type: 'LineString' as const,
            coordinates: shiftRing(ring, lonShift),
        },
    });

    const addLayer = (feature: any, style: any) => {
        const layer = new L.GeoJSON(feature, { style, interactive: false });
        layer.addTo(map);
        layers.push(layer);
    };

    function redraw() {
        clearLayers();

        const timestamp = getTimestamp();
        displayTime = formatUtc(timestamp);

        if (!enabled && !showTerminator) return;

        const rings = getTwilightRings(timestamp);
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
                        addLayer(makeBand(outer, inner, shift), {
                            color,
                            weight: 0,
                            opacity: 0,
                            fillColor: color,
                            fillOpacity,
                        });
                    }

                    addLayer(makePolygon(rings.astronomical, shift), {
                        color: '#06090f',
                        weight: 0,
                        opacity: 0,
                        fillColor: '#06090f',
                        fillOpacity: o,
                    });
                } else {
                    addLayer(makePolygon(rings.horizon, shift), {
                        color: '#06090f',
                        weight: 0,
                        opacity: 0,
                        fillColor: '#06090f',
                        fillOpacity: o,
                    });
                }
            }

            if (showTerminator) {
                addLayer(makeLine(rings.horizon, shift), {
                    color: '#ffffff',
                    weight: 1.05,
                    opacity: 0.70,
                    dashArray: '4 4',
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
        width: 188px;
        padding: 9px 10px;
        border-radius: 10px;
        color: #fff;
        background: rgba(26, 29, 34, 0.90);
        box-shadow: 0 3px 14px rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(8px);
        font-size: 11.5px;
        line-height: 1.2;
        transition: width 0.15s ease, padding 0.15s ease;
    }

    .day-night-panel.collapsed {
        width: 145px;
        padding: 8px 10px;
    }

    .header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .day-night-title {
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
    }

    .collapse-btn {
        border: 0;
        background: transparent;
        color: rgba(255, 255, 255, 0.72);
        padding: 0 2px;
        cursor: pointer;
        font-size: 12px;
    }

    .controls-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px 8px;
        margin-top: 8px;
    }

    .toggle-row {
        display: flex;
        align-items: center;
        gap: 5px;
        margin: 0;
        white-space: nowrap;
    }

    .toggle-row.wide {
        grid-column: 1 / -1;
    }

    .toggle-row input {
        margin: 0;
        transform: scale(0.90);
    }

    .slider-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
        margin-bottom: 2px;
        font-size: 10.5px;
    }

    .opacity-slider {
        width: 100%;
        height: 13px;
        margin: 0;
    }

    .legend {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 3px 7px;
        margin-top: 6px;
        font-size: 9.5px;
        color: rgba(255, 255, 255, 0.80);
    }

    .legend > div {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        display: inline-block;
        flex: 0 0 auto;
    }

    .civil { background: #416786; }
    .nautical { background: #263f58; }
    .astro { background: #11243a; }
    .night { background: #06090f; }

    .time {
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.11);
        color: rgba(255, 255, 255, 0.58);
        font-size: 9.5px;
        white-space: nowrap;
    }
</style>
