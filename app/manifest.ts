import type { MetadataRoute } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const withBasePath = (path: string) =>
  `${basePath}${path.startsWith('/') ? path : `/${path}`}`;

const windowsIcons = [
  { src: withBasePath('/icons/windows11/SmallTile.scale-100.png'), sizes: '71x71' },
  { src: withBasePath('/icons/windows11/SmallTile.scale-125.png'), sizes: '89x89' },
  { src: withBasePath('/icons/windows11/SmallTile.scale-150.png'), sizes: '107x107' },
  { src: withBasePath('/icons/windows11/SmallTile.scale-200.png'), sizes: '142x142' },
  { src: withBasePath('/icons/windows11/SmallTile.scale-400.png'), sizes: '284x284' },
  { src: withBasePath('/icons/windows11/Square150x150Logo.scale-100.png'), sizes: '150x150' },
  { src: withBasePath('/icons/windows11/Square150x150Logo.scale-125.png'), sizes: '188x188' },
  { src: withBasePath('/icons/windows11/Square150x150Logo.scale-150.png'), sizes: '225x225' },
  { src: withBasePath('/icons/windows11/Square150x150Logo.scale-200.png'), sizes: '300x300' },
  { src: withBasePath('/icons/windows11/Square150x150Logo.scale-400.png'), sizes: '600x600' },
  { src: withBasePath('/icons/windows11/Wide310x150Logo.scale-100.png'), sizes: '310x150' },
  { src: withBasePath('/icons/windows11/Wide310x150Logo.scale-125.png'), sizes: '388x188' },
  { src: withBasePath('/icons/windows11/Wide310x150Logo.scale-150.png'), sizes: '465x225' },
  { src: withBasePath('/icons/windows11/Wide310x150Logo.scale-200.png'), sizes: '620x300' },
  { src: withBasePath('/icons/windows11/Wide310x150Logo.scale-400.png'), sizes: '1240x600' },
  { src: withBasePath('/icons/windows11/LargeTile.scale-100.png'), sizes: '310x310' },
  { src: withBasePath('/icons/windows11/LargeTile.scale-125.png'), sizes: '388x388' },
  { src: withBasePath('/icons/windows11/LargeTile.scale-150.png'), sizes: '465x465' },
  { src: withBasePath('/icons/windows11/LargeTile.scale-200.png'), sizes: '620x620' },
  { src: withBasePath('/icons/windows11/LargeTile.scale-400.png'), sizes: '1240x1240' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.scale-100.png'), sizes: '44x44' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.scale-125.png'), sizes: '55x55' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.scale-150.png'), sizes: '66x66' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.scale-200.png'), sizes: '88x88' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.scale-400.png'), sizes: '176x176' },
  { src: withBasePath('/icons/windows11/StoreLogo.scale-100.png'), sizes: '50x50' },
  { src: withBasePath('/icons/windows11/StoreLogo.scale-125.png'), sizes: '63x63' },
  { src: withBasePath('/icons/windows11/StoreLogo.scale-150.png'), sizes: '75x75' },
  { src: withBasePath('/icons/windows11/StoreLogo.scale-200.png'), sizes: '100x100' },
  { src: withBasePath('/icons/windows11/StoreLogo.scale-400.png'), sizes: '200x200' },
  { src: withBasePath('/icons/windows11/SplashScreen.scale-100.png'), sizes: '620x300' },
  { src: withBasePath('/icons/windows11/SplashScreen.scale-125.png'), sizes: '775x375' },
  { src: withBasePath('/icons/windows11/SplashScreen.scale-150.png'), sizes: '930x450' },
  { src: withBasePath('/icons/windows11/SplashScreen.scale-200.png'), sizes: '1240x600' },
  { src: withBasePath('/icons/windows11/SplashScreen.scale-400.png'), sizes: '2480x1200' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-16.png'), sizes: '16x16' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-20.png'), sizes: '20x20' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-24.png'), sizes: '24x24' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-30.png'), sizes: '30x30' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-32.png'), sizes: '32x32' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-36.png'), sizes: '36x36' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-40.png'), sizes: '40x40' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-44.png'), sizes: '44x44' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-48.png'), sizes: '48x48' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-60.png'), sizes: '60x60' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-64.png'), sizes: '64x64' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-72.png'), sizes: '72x72' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-80.png'), sizes: '80x80' },
  { src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-96.png'), sizes: '96x96' },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.targetsize-256.png'),
    sizes: '256x256',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-16.png'),
    sizes: '16x16',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-20.png'),
    sizes: '20x20',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-24.png'),
    sizes: '24x24',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-30.png'),
    sizes: '30x30',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-32.png'),
    sizes: '32x32',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-36.png'),
    sizes: '36x36',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-40.png'),
    sizes: '40x40',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-44.png'),
    sizes: '44x44',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-48.png'),
    sizes: '48x48',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-60.png'),
    sizes: '60x60',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-64.png'),
    sizes: '64x64',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-72.png'),
    sizes: '72x72',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-80.png'),
    sizes: '80x80',
  },
  {
    src: withBasePath('/icons/windows11/Square44x44Logo.altform-unplated_targetsize-96.png'),
    sizes: '96x96',
  },
];

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'News Report Tracker',
    short_name: 'NewsTracker',
    description: 'A utility tool to collect, track, and analyse news media.',
    start_url: withBasePath('/'),
    display: 'standalone',
    background_color: '#111827',
    theme_color: '#111827',
    orientation: 'any',
    scope: withBasePath('/'),
    lang: 'en',
    prefer_related_applications: false,
    categories: ['news', 'productivity', 'utilities', 'research'],
    icons: windowsIcons.map((icon) => ({
      ...icon,
      type: 'image/png',
      purpose: 'any',
    })),
  };
}
