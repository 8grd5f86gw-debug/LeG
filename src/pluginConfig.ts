import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-day-night-leg',
    version: '0.5.0',
    icon: '🌗',
    title: 'Météo, Jour/Nuit & Trafic aérien',
    description: 'Affiche le jour, la nuit, les crépuscules et le trafic aérien ADS-B large zone 1000 NM sur la carte Windy.',
    author: 'Gauthier Descolas',
    repository: 'https://github.com/8grd5f86gw-debug/LeG',
    homepage: 'https://8grd5f86gw-debug.github.io/LeG/',
    desktopUI: 'embedded',
    mobileUI: 'small',
    routerPath: '/day-night',
    private: true,
};

export default config;
