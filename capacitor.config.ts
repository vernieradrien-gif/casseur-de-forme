import type { CapacitorConfig } from '@capacitor/cli';

// Application Android (Capacitor) : le jeu web construit dans dist/ est embarqué dans l'APK.
const config: CapacitorConfig = {
  appId: 'io.github.vernieradrien.prismablast',
  appName: 'Prisma Blast',
  webDir: 'dist',
  backgroundColor: '#07070f',
  android: {
    backgroundColor: '#07070f',
  },
  plugins: {
    // Plein écran : barres système masquées, zones sûres transmises au CSS (env(safe-area-inset-*)).
    SystemBars: {
      hidden: true,
      style: 'DARK',
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
