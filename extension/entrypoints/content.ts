import { LruCache, cacheKey } from '@/lib/cache';
import { Semaphore } from '@/lib/concurrency';
import { type TranslatorHandle, mountTranslatorUI, setThemeTokens } from '@/lib/inject-ui';
import { EnsureServerError, ensureServerReady } from '@/lib/nmh-client-content';
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
        let localAcc = '';
        const hangTimer = setTimeout(() => {
          if (localAcc.length === 0) handle.appendChunk('응답 지연 중...');
        }, 10_000);

        try {
          await ensureServerReady();
          for await (const chunk of translateStream(
            text,
            langValue,
            settings.apfelEndpoint,
            signal,
          )) {
            if (signal.aborted) break;
            if (localAcc.length === 0) handle.reset();
            localAcc += chunk;
            handle.appendChunk(chunk);
          }
          if (localAcc.length > 0) cache.set(key, localAcc);
          handle.trigger.textContent = '번역 숨기기';
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          let msg: string;
          if (e instanceof EnsureServerError && e.code === 'apfel_not_installed') {
            msg =
              'apfel이 설치되지 않았습니다. 터미널에서 brew install apfel 실행 후 다시 시도하세요.';
          } else if (e instanceof TranslateError) {
            msg = `번역 실패 — HTTP ${e.status}.`;
          } else if (e instanceof Error) {
            msg = `번역 실패 — ${e.message}.`;
          } else {
            msg = '번역 실패.';
          }
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
        // bsky가 가상화 피드에서 post를 제거하면 mounted 항목이 누수됨.
        // 매 옵저버 틱마다 DOM에서 떨어진 post의 핸들을 정리한다.
        for (const [post, h] of mounted) {
          if (!post.isConnected) {
            h.destroy();
            mounted.delete(post);
          }
        }
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
