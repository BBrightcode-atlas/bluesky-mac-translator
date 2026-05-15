import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  vite: () => ({
    plugins: [react()],
    build: { minify: false, sourcemap: 'inline' },
  }),
  manifest: {
    name: 'Bluesky Translator',
    description: 'Translate Bluesky posts and replies via Claude CLI',
    version: '0.0.2',
    permissions: ['storage', 'nativeMessaging'],
    host_permissions: ['https://bsky.app/*'],
    options_ui: { page: 'options.html', open_in_tab: true },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
