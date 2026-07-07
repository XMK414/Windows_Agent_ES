import type { ChatProvider, ChatRequest, ModelInfo, StreamChunk } from "../provider-adapter.interface.js";
import { BrowserSessionManager, type ChatSelectors } from "./browser-manager.js";

/**
 * Best-effort selectors for gemini.google.com's chat UI — same caveat as
 * claude-web.adapter.ts: Google can change this DOM without notice, and
 * these selectors are not verifiable from an automated/headless CI
 * environment.
 */
const SELECTORS: ChatSelectors = {
  input: "div.ql-editor",
  sendButton: 'button[aria-label="Send message"]',
  lastResponse: "message-content",
  stopGenerating: 'button[aria-label="Stop response"]',
};

/**
 * EXPERIMENTAL / PERSONAL USE ONLY. Drives gemini.google.com directly
 * through a browser session you log into yourself — see
 * browser-manager.ts and docs/SECURITY.md. Disabled unless
 * WAES_ENABLE_WEB_SESSION_ADAPTERS=true.
 */
export class GeminiWebSessionAdapter implements ChatProvider {
  readonly id = "gemini-web";
  readonly requiresApiKey = false;
  private readonly manager: BrowserSessionManager;

  constructor(profileDir: string) {
    this.manager = new BrowserSessionManager({
      provider: "gemini",
      profileDir,
      loginUrl: "https://gemini.google.com/",
      chatUrl: "https://gemini.google.com/app",
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "web-session", label: "Whatever model is selected in the Gemini tab", contextWindow: 1_000_000 }];
  }

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
        error: `gemini-web session failed (the Gemini UI may have changed, or you may not be logged in — try /api/web-session/gemini/login): ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }
}
