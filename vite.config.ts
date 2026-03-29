import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/Kontrakan/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
          manifest: {
            name: 'Manajer Kontrakan AMG',
            short_name: 'AMG Kontrakan',
            description: 'Aplikasi Manajemen Kontrakan Pintar AMG',
            theme_color: '#4f46e5',
            background_color: '#f8fafc',
            display: 'standalone',
            icons: [
              {
                src: 'icon.svg',
                sizes: '192x192',
                type: 'image/svg+xml'
              },
              {
                src: 'icon.svg',
                sizes: '512x512',
                type: 'image/svg+xml'
              },
              {
                src: 'icon.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
