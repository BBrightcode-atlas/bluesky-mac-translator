import { LruCache, cacheKey } from '@/lib/cache';
import { Semaphore } from '@/lib/concurrency';
import { type TranslatorHandle, mountTranslatorUI, setThemeTokens } from '@/lib/inject-ui';
import { ensureServerReady } from '@/lib/nmh-client-content';
import { extractPostText, findUnprocessedPosts, markProcessed } from '@/lib/post-detector';
import { type TargetLang, loadSettings, onSettingsChange } from '@/lib/storage';
import { extractBskyTokens } from '@/lib/theme';
import { TranslateError, translateStream } from '@/lib/translate';

export default defineContentScript({
  matches: ['https://bsky.app/*'],
  runAt: 'document_idle',
  async main() {
    let settings = await loadSettings();
    const mounted = new Map<HTMLElement, TranslatorHandle>();
    onSettingsChange((s) => {
      settings = s;
      for (const h of mounted.values()) {
        h.lang.value = s.targetLang;
        h.lang.style.display = s.showLanguagePicker ? '' : 'none';
      }
    });

    const cache = new LruCache<string>(200);
    const sem = new Semaphore(4);

    function attach(post: HTMLElement): void {
      const textOrNull = extractPostText(post);
      if (!textOrNull) return;
      const text: string = textOrNull;
      markProcessed(post);

      const handle = mountTranslatorUI(post);
      setThemeTokens(handle.host, extractBskyTokens());
      handle.lang.value = settings.targetLang;
      handle.lang.style.display = settings.showLanguagePicker ? '' : 'none';
      mounted.set(post, handle);

      let abortCtl: AbortController | null = null;
      let acc = '';
      let visible = false;
      let activeLang: TargetLang = settings.targetLang;

      async function runTranslate(): Promise<void> {
        const langValue = handle.lang.value as TargetLang;
        activeLang = langValue;
        handle.reset();
        handle.show();
        visible = true;

        const key = await cacheKey(text, langValue);
        const cached = cache.get(key);
        if (cached) {
          handle.appendChunk(cached);
          handle.trigger.textContent = '번역 숨기기';
          return;
        }

        abortCtl?.abort();
        abortCtl = new AbortController();
        const signal = abortCtl.signal;

        const release = await sem.acquire();
        const hangTimer = setTimeout(() => {
          if (acc.length === 0) handle.appendChunk('응답 지연 중...');
        }, 10_000);

        try {
          await ensureServerReady();
          acc = '';
          for await (const chunk of translateStream(
            text,
            langValue,
            settings.apfelEndpoint,
            signal,
          )) {
            if (acc.length === 0) handle.reset();
            acc += chunk;
            handle.appendChunk(chunk);
          }
          if (acc.length > 0) cache.set(key, acc);
          handle.trigger.textContent = '번역 숨기기';
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          const msg =
            e instanceof TranslateError
              ? `번역 실패 — HTTP ${e.status}.`
              : e instanceof Error
                ? `번역 실패 — ${e.message}.`
                : '번역 실패.';
          handle.showError(msg, () => void runTranslate());
        } finally {
          clearTimeout(hangTimer);
          release();
        }
      }

      handle.trigger.addEventListener('click', () => {
        if (visible) {
          handle.hide();
          handle.trigger.textContent = '번역';
          visible = false;
          abortCtl?.abort();
          return;
        }
        void runTranslate();
      });

      handle.lang.addEventListener('change', () => {
        const next = handle.lang.value as TargetLang;
        if (next === activeLang) return;
        void runTranslate();
      });
    }

    function scan(root: ParentNode): void {
      for (const post of findUnprocessedPosts(root)) {
        try {
          attach(post);
        } catch (e) {
          console.warn('[bsky-translator] attach failed', e);
        }
      }
    }

    scan(document.body);

    const idleSchedule =
      (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 0));

    const observer = new MutationObserver((records) => {
      idleSchedule(() => {
        for (const r of records) {
          for (const node of r.addedNodes) {
            if (node instanceof HTMLElement) scan(node);
          }
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      if (mounted.size === 0) {
        console.warn('[bsky-translator] no posts detected after 30s; selectors may need update');
      }
    }, 30_000);
  },
});
