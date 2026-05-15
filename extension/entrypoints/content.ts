import { LruCache, cacheKey } from '@/lib/cache';
import { Semaphore } from '@/lib/concurrency';
import { dbg } from '@/lib/debug';
import { type TranslatorHandle, mountTranslatorUI, setThemeTokens } from '@/lib/inject-ui';
import { EnsureServerError, ensureServerReady } from '@/lib/nmh-client-content';
import { extractPostText, findUnprocessedPosts, markProcessed } from '@/lib/post-detector';
import { type TargetLang, loadSettings, onSettingsChange } from '@/lib/storage';
import { extractBskyTokens } from '@/lib/theme';
import { TranslateError, translateStream } from '@/lib/translate';

dbg('module-load', { href: typeof location !== 'undefined' ? location.href : null });

export default defineContentScript({
  matches: ['https://bsky.app/*'],
  runAt: 'document_idle',
  async main() {
    dbg('main-start', { href: location.href, readyState: document.readyState });
    let settings = await loadSettings();
    dbg('settings-loaded', { lang: settings.targetLang, endpoint: settings.apfelEndpoint });
    const mounted = new Map<HTMLElement, TranslatorHandle>();
    onSettingsChange((s) => {
      settings = s;
    });

    const cache = new LruCache<string>(200);
    const sem = new Semaphore(4);

    function attach(post: HTMLElement): void {
      const textOrNull = extractPostText(post);
      if (!textOrNull) { dbg('attach-skip-no-text'); return; }
      const text: string = textOrNull;
      markProcessed(post);
      dbg('attach-call', { textLen: text.length });

      const handle = mountTranslatorUI(post);
      setThemeTokens(handle.host, extractBskyTokens());
      mounted.set(post, handle);

      let abortCtl: AbortController | null = null;
      let visible = false;

      async function runTranslate(): Promise<void> {
        const langValue: TargetLang = settings.targetLang;
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
    }

    function scan(root: ParentNode): void {
      const found = findUnprocessedPosts(root);
      if (found.length > 0) {
        dbg('scan', {
          rootTag: (root as Element).tagName ?? 'doc',
          found: found.length,
        });
      }
      for (const post of found) {
        try {
          attach(post);
        } catch (e) {
          console.warn('[bsky-translator] attach failed', e);
          dbg('attach-error', { msg: (e as Error).message });
        }
      }
    }

    dbg('initial-scan-start');
    scan(document.body);
    dbg('initial-scan-done', { mounted: mounted.size });

    const idleSchedule =
      (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 0));

    const observer = new MutationObserver((records) => {
      dbg('observer-fire', { records: records.length });
      idleSchedule(() => {
        dbg('idle-run', { records: records.length, mountedBefore: mounted.size });
        // bsky가 가상화 피드에서 post를 제거하면 mounted 항목이 누수됨.
        // 매 옵저버 틱마다 DOM에서 떨어진 post의 핸들을 정리한다.
        for (const [post, h] of mounted) {
          if (!post.isConnected) {
            h.destroy();
            mounted.delete(post);
          }
        }
        let addedElements = 0;
        for (const r of records) {
          for (const node of r.addedNodes) {
            if (node instanceof HTMLElement) {
              addedElements++;
              scan(node);
            }
          }
        }
        dbg('idle-done', { addedElements, mountedAfter: mounted.size });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    dbg('observer-installed');

    setTimeout(() => {
      dbg('30s-mark', { mounted: mounted.size });
      if (mounted.size === 0) {
        console.warn('[bsky-translator] no posts detected after 30s; selectors may need update');
      }
    }, 30_000);
  },
});
