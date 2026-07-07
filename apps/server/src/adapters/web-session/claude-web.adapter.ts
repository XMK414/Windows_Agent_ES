import type { ChatProvider, ChatRequest, ModelInfo, StreamChunk } from "../provider-adapter.interface.js";
import { BrowserSessionManager, type ChatSelectors } from "./browser-manager.js";

/**
 * Best-effort selectors for claude.ai's chat UI. Anthropic can and does
 * change this DOM without notice — if sending stops working, this is the
 * first place to look. Not verifiable from an automated/headless CI
 * environment; these were written from the current UI structure and may
 * need adjusting against the live site.
 */
const SELECTORS: ChatSelectors = {
  input: 'div[contenteditable="true"]',
  sendButton: 'button[aria-label="Send Message"]',
  lastResponse: '[data-testid="message-content"]',
  stopGenerating: 'button[aria-label="Stop Response"]',
};

/**
 * EXPERIMENTAL / PERSONAL USE ONLY. Drives claude.ai directly through a
 * browser session you log into yourself — see browser-manager.ts and
 * docs/SECURITY.md. Disabled unless WAES_ENABLE_WEB_SESSION_ADAPTERS=true.
 */
export class ClaudeWebSessionAdapter implements ChatProvider {
  readonly id = "claude-web";
  readonly requiresApiKey = false;
  private readonly manager: BrowserSessionManager;

  constructor(profileDir: string) {
    this.manager = new BrowserSessionManager({
      provider: "claude",
      profileDir,
      loginUrl: "https://claude.ai/login",
      chatUrl: "https://claude.ai/new",
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "web-session", label: "Whatever model is selected in the claude.ai tab", contextWindow: 200_000 }];
  }

  /** Opens a real, visible browser window to claude.ai's own login page. Never touches credentials — the human logs in themselves. */
  async login(): Promise<void> {
    await this.manager.openForLogin();
  }

  async *send(req: ChatRequest): AsyncIterable<StreamChunk> {
    try {
      const last = req.messages[req.messages.length - 1];
      const text = await this.manager.sendMessage(last.content, SELECTORS);
      yield { type: "delta", text };
      yield { type: "done" };
    } catch (err) {
      yield {
        type: "error",
        error: `claude-web session failed (the claude.ai UI may have changed, or you may not be logged in — try /api/web-session/claude/login): ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }
}
