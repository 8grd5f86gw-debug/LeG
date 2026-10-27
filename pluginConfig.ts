import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-day-night-custom',
    version: '0.1.0',
    icon: '🌗',
    title: 'Jour / Nuit',
    description: 'Affiche la zone de nuit et le terminateur solaire selon la date et l’heure sélectionnées dans Windy.',
    author: 'Gauthier Descolas',
    desktopUI: 'embedded',
    mobileUI: 'small',
    routerPath: '/day-night-custom',
    private: true,
};

export default config;
