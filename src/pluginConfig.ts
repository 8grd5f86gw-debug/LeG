import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-day-night-leg',
    version: '0.6.0',
    icon: '🌗',
    title: 'Météo & Vols',
    description: 'Jour/nuit, crépuscules et trafic aérien ADS-B quasi temps réel sur Windy.',
    author: 'Gauthier Descolas',
    repository: 'https://github.com/8grd5f86gw-debug/LeG',
    homepage: 'https://8grd5f86gw-debug.github.io/LeG/',
    desktopUI: 'embedded',
    mobileUI: 'small',
    routerPath: '/day-night',
    private: true,
};

export default config;
