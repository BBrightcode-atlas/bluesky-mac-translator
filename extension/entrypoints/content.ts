export default defineContentScript({
  matches: ['https://bsky.app/*'],
  runAt: 'document_idle',
  main() {
    console.log('[bsky-translator] content script loaded');
  },
});
