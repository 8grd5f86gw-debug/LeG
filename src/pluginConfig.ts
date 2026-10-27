import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-day-night-leg',
    version: '0.1.0',
    icon: '🌗',
    title: 'Jour / Nuit',
    description: 'Affiche la zone de nuit et le terminateur solaire selon la date et l’heure sélectionnées dans Windy.',
    author: 'Gauthier Descolas',
    repository: 'https://github.com/8grd5f86gw-debug/LeG',
    homepage: 'https://8grd5f86gw-debug.github.io/LeG/',
    desktopUI: 'embedded',
    mobileUI: 'small',
    routerPath: '/day-night',
    private: true,
};

export default config;
