import type { ChatProvider } from "./provider-adapter.interface.js";
import { AnthropicApiAdapter } from "./anthropic-api.adapter.js";
import { GoogleApiAdapter } from "./google-api.adapter.js";
import { OpenRouterAdapter } from "./openrouter.adapter.js";
import { ChatGptOAuthAdapter } from "./chatgpt-oauth.adapter.js";
import { ClaudeWebSessionAdapter } from "./web-session/claude-web.adapter.js";
import { GeminiWebSessionAdapter } from "./web-session/gemini-web.adapter.js";
import type { SecretsVault } from "../security/secrets-vault.js";

export function buildProviderRegistry(vault: SecretsVault, browserProfilesDir: string): Map<string, ChatProvider> {
  const registry = new Map<string, ChatProvider>();
  registry.set("anthropic-api", new AnthropicApiAdapter(vault));
  registry.set("google-api", new GoogleApiAdapter(vault));
  registry.set("openrouter", new OpenRouterAdapter(vault));
  registry.set("chatgpt-oauth", new ChatGptOAuthAdapter(vault));

  // Off by default. Browser-session adapters drive claude.ai/gemini.google.com
  // directly through a session you log into yourself — see
  // docs/SECURITY.md and web-session/browser-manager.ts. This is a
  // personal-use convenience, not something to enable for anyone but the
  // person running this exact instance.
  if (process.env.WAES_ENABLE_WEB_SESSION_ADAPTERS === "true") {
    registry.set("claude-web", new ClaudeWebSessionAdapter(`${browserProfilesDir}/claude`));
    registry.set("gemini-web", new GeminiWebSessionAdapter(`${browserProfilesDir}/gemini`));
  }

  return registry;
}
