import type { ChatProvider } from "./provider-adapter.interface.js";
import { AnthropicApiAdapter } from "./anthropic-api.adapter.js";
import { GoogleApiAdapter } from "./google-api.adapter.js";
import type { SecretsVault } from "../security/secrets-vault.js";

export function buildProviderRegistry(vault: SecretsVault): Map<string, ChatProvider> {
  const registry = new Map<string, ChatProvider>();
  registry.set("anthropic-api", new AnthropicApiAdapter(vault));
  registry.set("google-api", new GoogleApiAdapter(vault));
  return registry;
}
