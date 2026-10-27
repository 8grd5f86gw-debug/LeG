import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-day-night-leg',
    version: '0.3.0',
    icon: '🌗',
    title: 'Jour / Nuit',
    description: 'Affiche le jour, la nuit et les crépuscules civil, nautique et astronomique selon la timeline Windy.',
    author: 'Gauthier Descolas',
    repository: 'https://github.com/8grd5f86gw-debug/LeG',
    homepage: 'https://8grd5f86gw-debug.github.io/LeG/',
    desktopUI: 'embedded',
    mobileUI: 'small',
    routerPath: '/day-night',
    private: true,
};

export default config;
