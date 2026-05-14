import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

export default defineConfig({
  vite: () => ({ plugins: [react()] }),
  manifest: {
    name: 'Bluesky Translator',
    description: 'Translate Bluesky posts via Apple on-device LLM (apfel)',
    version: '0.0.1',
    permissions: ['storage', 'nativeMessaging'],
    host_permissions: [
      'https://bsky.app/*',
      'http://127.0.0.1:11434/*',
    ],
    options_ui: { page: 'options.html', open_in_tab: true },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
