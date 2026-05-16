import { dbg } from '@/lib/debug';
import {
  findBufferComposers,
  isBufferComposerProcessed,
  markBufferComposerProcessed,
} from '@/lib/buffer-detector';
import {
  findReplyComposer,
  isReplyComposerProcessed,
  markReplyComposerProcessed,
} from '@/lib/compose-detector';
import { type TranslatorHandle, mountTranslatorUI, setThemeTokens } from '@/lib/inject-ui';
import { mountReplyTranslatorUI, type ReplyTranslatorHandle } from '@/lib/inject-reply-ui';
import { extractPostText, findUnprocessedPosts, markProcessed } from '@/lib/post-detector';
import { type ComposeTargetLang, type TargetLang, loadSettings, onSettingsChange } from '@/lib/storage';
import { extractBskyTokens } from '@/lib/theme';

// Bluesky's compose box is a ProseMirror (tiptap) contenteditable. Setting
// textContent directly doesn't sync with the editor's internal state, so the
// posted reply ignores the change. We simulate a paste event with translated
// text after selecting all existing content; ProseMirror handles paste and
// updates its state, which feeds into the reply submission.
function applyTranslationToCompose(composeEl: HTMLElement, text: string): void {
  composeEl.focus();
  const sel = composeEl.ownerDocument.defaultView?.getSelection?.();
  if (sel) {
    const range = composeEl.ownerDocument.createRange();
    range.selectNodeContents(composeEl);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  // Some environments lack DataTransfer constructor (test). Guard.
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const evt = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    composeEl.dispatchEvent(evt);
  } catch {
    // Fallback: legacy execCommand. Deprecated but widely supported and ProseMirror handles it.
    try {
      composeEl.ownerDocument.execCommand('insertText', false, text);
    } catch {
      // last resort — direct text content (will not sync to ProseMirror state)
      composeEl.textContent = text;
    }
  }
}


dbg('module-load', { href: typeof location !== 'undefined' ? location.href : null });

function translateViaBackground(
  payload:
    | {
        type: 'translate';
        mode: 'post';
        text: string;
        targetLang: TargetLang | ComposeTargetLang;
      }
    | { type: 'translate'; mode: 'reply'; originalPost: string; reply: string },
  onChunk: (t: string) => void,
  onDone: () => void,
  onError: (e: { code?: string; message: string }) => void,
  signal: AbortSignal,
): void {
  const port = chrome.runtime.connect({ name: 'translate' });
  let settled = false;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
    try {
      port.disconnect();
    } catch {
      // ignore
    }
  };
  port.onMessage.addListener(
    (m: { type: 'chunk' | 'done' | 'error'; text?: string; code?: string; message?: string }) => {
      if (m.type === 'chunk' && typeof m.text === 'string') onChunk(m.text);
      else if (m.type === 'done') settle(onDone);
      else if (m.type === 'error') settle(() => onError({ code: m.code, message: m.message ?? 'error' }));
    },
  );
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message ?? 'disconnected';
    settle(() => onError({ message: reason }));
  });
  signal.addEventListener(
    'abort',
    () => {
      settle(() => {});
    },
    { once: true },
  );
  port.postMessage({ kind: 'translate', payload });
}

export default defineContentScript({
  matches: ['https://bsky.app/*', 'https://publish.buffer.com/*'],
  runAt: 'document_idle',
  async main() {
    dbg('main-start', { href: location.href, readyState: document.readyState });
    let settings = await loadSettings();
    dbg('settings-loaded', { lang: settings.targetLang });
    const mounted = new Map<HTMLElement, TranslatorHandle>();
    const mountedReplies = new Map<HTMLElement, { handle: ReplyTranslatorHandle; originalPostEl: HTMLElement }>();
    onSettingsChange((s) => {
      settings = s;
    });

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

        abortCtl?.abort();
        abortCtl = new AbortController();
        const signal = abortCtl.signal;

        let acc = '';
        const hangTimer = setTimeout(() => {
          if (acc.length === 0) handle.appendChunk('응답 지연 중...');
        }, 15_000);

        translateViaBackground(
          { type: 'translate', mode: 'post', text, targetLang: langValue },
          (chunk) => {
            if (acc.length === 0) handle.reset();
            acc += chunk;
            handle.appendChunk(chunk);
          },
          () => {
            clearTimeout(hangTimer);
            handle.trigger.textContent = '번역 숨기기';
          },
          (e) => {
            clearTimeout(hangTimer);
            const code = e.code;
            let msg: string;
            if (code === 'claude_not_found') {
              msg = 'claude CLI가 설치되어 있지 않습니다. `npm i -g @anthropic-ai/claude-code` 후 다시 시도하세요.';
            } else if (code === 'claude_auth') {
              msg = 'claude 로그인이 필요합니다. 터미널에서 `claude login` 후 다시 시도하세요.';
            } else {
              msg = `번역 실패 — ${e.message}.`;
            }
            handle.showError(msg, () => void runTranslate());
          },
          signal,
        );
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

    function attachReply(composeEl: HTMLElement, originalPostEl: HTMLElement): void {
      if (isReplyComposerProcessed(composeEl)) return;
      markReplyComposerProcessed(composeEl);
      const handle = mountReplyTranslatorUI(composeEl);
      setThemeTokens(handle.host, extractBskyTokens());
      mountedReplies.set(composeEl, { handle, originalPostEl });

      let abortCtl: AbortController | null = null;

      function runReplyTranslate(): void {
        const reply = composeEl.textContent?.trim() ?? '';
        if (!reply) {
          handle.showError('내용을 먼저 작성하세요.', () => runReplyTranslate());
          return;
        }
        const originalPost = extractPostText(originalPostEl);
        if (!originalPost) {
          handle.showError('원 포스트 텍스트를 찾을 수 없습니다.', () => runReplyTranslate());
          return;
        }
        handle.reset();
        handle.show();
        abortCtl?.abort();
        abortCtl = new AbortController();
        let acc = '';
        const hangTimer = setTimeout(() => {
          if (acc.length === 0) handle.appendChunk('응답 지연 중...');
        }, 15_000);
        translateViaBackground(
          { type: 'translate', mode: 'reply', originalPost, reply },
          (chunk) => {
            if (acc.length === 0) handle.reset();
            acc += chunk;
            handle.appendChunk(chunk);
          },
          () => {
            clearTimeout(hangTimer);
            if (acc.length > 0) {
              const translated = acc;
              handle.showApply(() => applyTranslationToCompose(composeEl, translated));
            }
          },
          (e) => {
            clearTimeout(hangTimer);
            let msg: string;
            if (e.code === 'claude_not_found')
              msg = 'claude CLI 미설치. `npm i -g @anthropic-ai/claude-code`.';
            else if (e.code === 'claude_auth') msg = 'claude 로그인 필요. 터미널에서 `claude login`.';
            else msg = `번역 실패 — ${e.message}.`;
            handle.showError(msg, () => runReplyTranslate());
          },
          abortCtl.signal,
        );
      }

      handle.trigger.addEventListener('click', () => runReplyTranslate());
    }

    // Buffer composer (publish.buffer.com). Reuses the reply UI widget — same
    // pattern (compose-aware "번역" → preview → "반영하기"), but the target
    // language is the user's bufferTargetLang setting (defaults to 'en')
    // instead of being inferred from a quoted post.
    const mountedBuffer = new Map<HTMLElement, ReplyTranslatorHandle>();

    function attachBufferCompose(composeEl: HTMLElement): void {
      if (isBufferComposerProcessed(composeEl)) return;
      markBufferComposerProcessed(composeEl);
      // Mount inside Buffer's bottom integrations toolbar (media/gif/emoji
      // icons sit there). Scoped to the closest dialog so thread-mode
      // multi-composer setups each target their own toolbar.
      const dialog = composeEl.closest<HTMLElement>('[role="dialog"]') ?? document;
      const integrationsBar = dialog.querySelector<HTMLElement>('[data-testid="integrations-bar"]');
      const targetEl = integrationsBar ?? composeEl;
      const position: 'append' | 'after' = integrationsBar ? 'append' : 'after';
      const handle = mountReplyTranslatorUI(composeEl, { el: targetEl, position });
      setThemeTokens(handle.host, extractBskyTokens());
      mountedBuffer.set(composeEl, handle);

      let abortCtl: AbortController | null = null;

      function runBufferTranslate(): void {
        const text = composeEl.textContent?.trim() ?? '';
        if (!text) {
          handle.showError('내용을 먼저 작성하세요.', () => runBufferTranslate());
          return;
        }
        const targetLang = settings.bufferTargetLang;
        handle.reset();
        handle.show();
        abortCtl?.abort();
        abortCtl = new AbortController();
        let acc = '';
        const hangTimer = setTimeout(() => {
          if (acc.length === 0) handle.appendChunk('응답 지연 중...');
        }, 15_000);
        translateViaBackground(
          { type: 'translate', mode: 'post', text, targetLang },
          (chunk) => {
            if (acc.length === 0) handle.reset();
            acc += chunk;
            handle.appendChunk(chunk);
          },
          () => {
            clearTimeout(hangTimer);
            if (acc.length > 0) {
              const translated = acc;
              handle.showApply(() => applyTranslationToCompose(composeEl, translated));
            }
          },
          (e) => {
            clearTimeout(hangTimer);
            let msg: string;
            if (e.code === 'claude_not_found')
              msg = 'claude CLI 미설치. `npm i -g @anthropic-ai/claude-code`.';
            else if (e.code === 'claude_auth') msg = 'claude 로그인 필요. 터미널에서 `claude login`.';
            else msg = `번역 실패 — ${e.message}.`;
            handle.showError(msg, () => runBufferTranslate());
          },
          abortCtl.signal,
        );
      }

      handle.trigger.addEventListener('click', () => runBufferTranslate());
    }

    function scanBufferComposers(): void {
      for (const c of findBufferComposers(document)) attachBufferCompose(c);
      for (const [el, h] of mountedBuffer) {
        if (!el.isConnected) {
          h.destroy();
          mountedBuffer.delete(el);
        }
      }
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

    const IS_BSKY = location.host === 'bsky.app';
    const IS_BUFFER = location.host === 'publish.buffer.com';

    dbg('initial-scan-start');
    if (IS_BSKY) {
      scan(document.body);
      const initialReply = findReplyComposer(document);
      if (initialReply) attachReply(initialReply.composeEl, initialReply.originalPostEl);
    }
    if (IS_BUFFER) scanBufferComposers();
    dbg('initial-scan-done', { mounted: mounted.size, bufferMounts: mountedBuffer.size });

    const idleSchedule =
      (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 0));

    const observer = new MutationObserver((records) => {
      dbg('observer-fire', { records: records.length });
      idleSchedule(() => {
        dbg('idle-run', { records: records.length, mountedBefore: mounted.size });
        if (IS_BSKY) {
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

          // reply composer scan (document-wide; bsky composes a single modal at a time)
          const reply = findReplyComposer(document);
          if (reply) attachReply(reply.composeEl, reply.originalPostEl);

          // clean up reply mounts whose compose element fell out of DOM
          for (const [el, entry] of mountedReplies) {
            if (!el.isConnected) {
              entry.handle.destroy();
              mountedReplies.delete(el);
            }
          }

          dbg('idle-done', { addedElements, mountedAfter: mounted.size });
        }
        if (IS_BUFFER) {
          scanBufferComposers();
          dbg('buffer-idle-done', { bufferMounts: mountedBuffer.size });
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    dbg('observer-installed');

    setTimeout(() => {
      dbg('30s-mark', { mounted: mounted.size, bufferMounts: mountedBuffer.size });
      if (IS_BSKY && mounted.size === 0) {
        console.warn('[bsky-translator] no posts detected after 30s; selectors may need update');
      }
      if (IS_BUFFER && mountedBuffer.size === 0) {
        console.warn('[bsky-translator] no Buffer composers after 30s; open Create Post to activate');
      }
    }, 30_000);
  },
});
