import type { ChatProvider } from "./provider-adapter.interface.js";

export const BUILD_RESTRICTED_MESSAGE =
  "This provider is restricted to running/advisory work and cannot be used to build or design a product (no-compete policy).";

/** Returns true if the provider may not be used on product-building surfaces. */
export function isBuildRestricted(provider: ChatProvider | undefined): boolean {
  return Boolean(provider?.buildRestricted);
}
