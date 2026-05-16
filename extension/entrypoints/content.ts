import { dbg } from '@/lib/debug';
import {
  extractBufferCommentText,
  findBufferComments,
  findBufferComposers,
  findBufferReplyForm,
  isBufferCommentProcessed,
  isBufferComposerProcessed,
  isBufferReplyFormProcessed,
  markBufferCommentProcessed,
  markBufferComposerProcessed,
  markBufferReplyFormProcessed,
} from '@/lib/buffer-detector';
import {
  findNewPostComposer,
  findReplyComposer,
  isNewPostComposerProcessed,
  isReplyComposerProcessed,
  markNewPostComposerProcessed,
  markReplyComposerProcessed,
} from '@/lib/compose-detector';
import { type TranslatorHandle, mountTranslatorUI, setThemeTokens } from '@/lib/inject-ui';
import { mountReplyTranslatorUI, type ReplyTranslatorHandle } from '@/lib/inject-reply-ui';
import { extractPostText, findUnprocessedPosts, markProcessed } from '@/lib/post-detector';
import { type ComposeTargetLang, type TargetLang, loadSettings, onSettingsChange } from '@/lib/storage';
import { extractBskyTokens } from '@/lib/theme';

// Bluesky's compose box is a ProseMirror (tiptap) contenteditable. Buffer's
// publish composer is a Slate.js contenteditable. Buffer community reply form
// is a native <textarea> (React-controlled). Each needs a different injection
// strategy so the host React/editor state stays in sync.
function applyTranslationToCompose(el: HTMLElement, text: string): void {
  // Path A — native <textarea> / <input> (React controlled component).
  // Setting .value directly bypasses React's setter; we must use the prototype's
  // setter via Object.getOwnPropertyDescriptor so React picks up the change.
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.focus();
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  // Path B — contenteditable (ProseMirror / Slate / vanilla). select-all +
  // paste event so the editor's own handler integrates it into its state.
  el.focus();
  const sel = el.ownerDocument.defaultView?.getSelection?.();
  if (sel) {
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const evt = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(evt);
  } catch {
    try {
      el.ownerDocument.execCommand('insertText', false, text);
    } catch {
      el.textContent = text;
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

    // Bluesky "new post" composer (no quoted post — root-level new post modal).
    // Same compose-aware "번역" + "반영하기" pattern as Buffer; target language
    // is settings.bufferTargetLang (shared compose-direction setting).
    const mountedNewPosts = new Map<HTMLElement, ReplyTranslatorHandle>();

    function attachNewPostCompose(composeEl: HTMLElement): void {
      if (isNewPostComposerProcessed(composeEl)) return;
      markNewPostComposerProcessed(composeEl);
      // Mount as direct nextSibling of the contenteditable — bluesky's new-post
      // modal doesn't have a separate toolbar testid like Buffer's, but the
      // sibling slot inside composePostView renders cleanly below the editor.
      const handle = mountReplyTranslatorUI(composeEl);
      setThemeTokens(handle.host, extractBskyTokens());
      mountedNewPosts.set(composeEl, handle);

      let abortCtl: AbortController | null = null;

      function runNewPostTranslate(): void {
        const text = composeEl.textContent?.trim() ?? '';
        if (!text) {
          handle.showError('내용을 먼저 작성하세요.', () => runNewPostTranslate());
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
            handle.showError(msg, () => runNewPostTranslate());
          },
          abortCtl.signal,
        );
      }

      handle.trigger.addEventListener('click', () => runNewPostTranslate());
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
      // Community comment thread: each comment gets a translate-on-read UI,
      // and the reply form (if present) gets a translate-on-compose UI that
      // targets the parent comment's language.
      for (const c of findBufferComments(document)) attachBufferComment(c);
      for (const [el, h] of mountedBufferComments) {
        if (!el.isConnected) {
          h.destroy();
          mountedBufferComments.delete(el);
        }
      }
      const replyForm = findBufferReplyForm(document);
      if (replyForm) attachBufferReplyForm(replyForm);
      for (const [el, h] of mountedBufferReplyForms) {
        if (!el.isConnected) {
          h.destroy();
          mountedBufferReplyForms.delete(el);
        }
      }
    }

    // --- Buffer community: comment reading (foreign → user's targetLang) ---
    const mountedBufferComments = new Map<HTMLElement, ReplyTranslatorHandle>();

    function attachBufferComment(commentEl: HTMLElement): void {
      if (isBufferCommentProcessed(commentEl)) return;
      const extracted = extractBufferCommentText(commentEl);
      if (!extracted) return;
      const text: string = extracted; // capture as non-null for closure
      markBufferCommentProcessed(commentEl);
      // Mount as the last child of the comment article — out of the flex row
      // that contains avatar+content, so it sits on its own line below.
      const handle = mountReplyTranslatorUI(commentEl, { el: commentEl, position: 'append' });
      setThemeTokens(handle.host, extractBskyTokens());
      mountedBufferComments.set(commentEl, handle);

      // Reading direction: don't show the "반영하기" button — it doesn't make
      // sense to write a translation back into someone else's comment.
      // We can't fully hide showApply from the widget, but we simply never
      // call it; trigger only fires translate → preview.
      let abortCtl: AbortController | null = null;

      function runCommentTranslate(): void {
        const targetLang = settings.targetLang; // reading direction (default ko)
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
            // intentionally no showApply for reading direction
          },
          (e) => {
            clearTimeout(hangTimer);
            let msg: string;
            if (e.code === 'claude_not_found')
              msg = 'claude CLI 미설치. `npm i -g @anthropic-ai/claude-code`.';
            else if (e.code === 'claude_auth') msg = 'claude 로그인 필요. 터미널에서 `claude login`.';
            else msg = `번역 실패 — ${e.message}.`;
            handle.showError(msg, () => runCommentTranslate());
          },
          abortCtl.signal,
        );
      }

      handle.trigger.addEventListener('click', () => runCommentTranslate());
    }

    // --- Buffer community: reply form (user's KO → parent comment's language) ---
    const mountedBufferReplyForms = new Map<HTMLElement, ReplyTranslatorHandle>();

    function attachBufferReplyForm(hit: ReturnType<typeof findBufferReplyForm>): void {
      if (!hit) return;
      const { formEl, textarea, footer, parentComment } = hit;
      if (isBufferReplyFormProcessed(formEl)) return;
      markBufferReplyFormProcessed(formEl);
      // Prefer to mount inside the replyFooter (next to the emoji/draft icons).
      // If footer isn't found, fall back to the form's last child.
      const targetEl = footer ?? formEl;
      const position: 'append' | 'after' = footer ? 'append' : 'after';
      const handle = mountReplyTranslatorUI(textarea, { el: targetEl, position });
      setThemeTokens(handle.host, extractBskyTokens());
      mountedBufferReplyForms.set(formEl, handle);

      let abortCtl: AbortController | null = null;

      function runReplyFormTranslate(): void {
        const reply = textarea.value.trim();
        if (!reply) {
          handle.showError('내용을 먼저 작성하세요.', () => runReplyFormTranslate());
          return;
        }
        const originalPost = parentComment ? extractBufferCommentText(parentComment) : null;
        if (!originalPost) {
          // No parent comment to derive language from — fall back to bufferTargetLang.
          const targetLang = settings.bufferTargetLang;
          translateAndApply({ type: 'translate', mode: 'post', text: reply, targetLang });
          return;
        }
        translateAndApply({ type: 'translate', mode: 'reply', originalPost, reply });
      }

      function translateAndApply(
        payload:
          | { type: 'translate'; mode: 'post'; text: string; targetLang: TargetLang | ComposeTargetLang }
          | { type: 'translate'; mode: 'reply'; originalPost: string; reply: string },
      ): void {
        handle.reset();
        handle.show();
        abortCtl?.abort();
        abortCtl = new AbortController();
        let acc = '';
        const hangTimer = setTimeout(() => {
          if (acc.length === 0) handle.appendChunk('응답 지연 중...');
        }, 15_000);
        translateViaBackground(
          payload,
          (chunk) => {
            if (acc.length === 0) handle.reset();
            acc += chunk;
            handle.appendChunk(chunk);
          },
          () => {
            clearTimeout(hangTimer);
            if (acc.length > 0) {
              const translated = acc;
              handle.showApply(() => applyTranslationToCompose(textarea, translated));
            }
          },
          (e) => {
            clearTimeout(hangTimer);
            let msg: string;
            if (e.code === 'claude_not_found')
              msg = 'claude CLI 미설치. `npm i -g @anthropic-ai/claude-code`.';
            else if (e.code === 'claude_auth') msg = 'claude 로그인 필요. 터미널에서 `claude login`.';
            else msg = `번역 실패 — ${e.message}.`;
            handle.showError(msg, () => runReplyFormTranslate());
          },
          abortCtl.signal,
        );
      }

      handle.trigger.addEventListener('click', () => runReplyFormTranslate());
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
      const initialNewPost = findNewPostComposer(document);
      if (initialNewPost) attachNewPostCompose(initialNewPost);
    }
    if (IS_BUFFER) scanBufferComposers();
    dbg('initial-scan-done', { mounted: mounted.size, bufferMounts: mountedBuffer.size, newPostMounts: mountedNewPosts.size });

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

          // new-post composer scan (modal opens/closes; quoted post absence
          // distinguishes it from reply — findNewPostComposer guards this)
          const newPost = findNewPostComposer(document);
          if (newPost) attachNewPostCompose(newPost);

          // clean up reply mounts whose compose element fell out of DOM
          for (const [el, entry] of mountedReplies) {
            if (!el.isConnected) {
              entry.handle.destroy();
              mountedReplies.delete(el);
            }
          }
          // clean up new-post mounts likewise
          for (const [el, h] of mountedNewPosts) {
            if (!el.isConnected) {
              h.destroy();
              mountedNewPosts.delete(el);
            }
          }

          dbg('idle-done', { addedElements, mountedAfter: mounted.size, newPostMounts: mountedNewPosts.size });
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
