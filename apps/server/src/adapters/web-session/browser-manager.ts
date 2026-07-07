import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdirSync } from "node:fs";

export interface WebSessionConfig {
  provider: string;
  profileDir: string;
  loginUrl: string;
  chatUrl: string;
}

export interface ChatSelectors {
  input: string;
  sendButton: string;
  lastResponse: string;
  stopGenerating: string;
}

/**
 * EXPERIMENTAL / PERSONAL USE ONLY — see docs/SECURITY.md §"Web-session
 * adapters". This drives a real, persistent, cookie-preserving browser
 * profile against a provider's own web chat UI. It never automates
 * authentication itself: `openForLogin` just opens the provider's real
 * login page in a visible window and leaves it there for a human to sign
 * in normally, the same as opening a browser tab yourself. Only sending a
 * message and reading the response afterward is automated.
 *
 * This is inherently brittle: it depends on the provider's current DOM
 * structure, which can change without notice and will silently break this
 * adapter until the selectors are updated. Disabled by default — see
 * WAES_ENABLE_WEB_SESSION_ADAPTERS in adapters/registry.ts.
 */
export class BrowserSessionManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(private readonly config: WebSessionConfig) {
    mkdirSync(config.profileDir, { recursive: true });
  }

  /** Only set when testing against a local harness in an environment without a real display/Playwright browser install path resolvable by default. */
  private executablePath(): string | undefined {
    return process.env.WAES_CHROMIUM_EXECUTABLE_PATH || undefined;
  }

  async openForLogin(): Promise<void> {
    const context = await chromium.launchPersistentContext(this.config.profileDir, {
      headless: false,
      executablePath: this.executablePath(),
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(this.config.loginUrl);
    // Deliberately left open for the human to log in and close themselves.
  }

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    this.context = await chromium.launchPersistentContext(this.config.profileDir, {
      headless: true,
      executablePath: this.executablePath(),
    });
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    await this.page.goto(this.config.chatUrl);
    return this.page;
  }

  async sendMessage(text: string, selectors: ChatSelectors): Promise<string> {
    const page = await this.ensurePage();
    await page.fill(selectors.input, text);
    await page.click(selectors.sendButton);

    // Best-effort: wait for the "stop generating" control to disappear,
    // i.e. streaming has finished. If the selector doesn't match (UI
    // changed), this just times out and we scrape whatever's there.
    await page.waitForSelector(selectors.stopGenerating, { state: "detached", timeout: 120_000 }).catch(() => {});

    const responses = await page.$$(selectors.lastResponse);
    const last = responses[responses.length - 1];
    return last ? await last.innerText() : "";
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = null;
    this.page = null;
  }
}
