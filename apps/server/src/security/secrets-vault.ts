import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export interface SecretsVault {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export class FileSecretsVault implements SecretsVault {
  private filePath: string;
  private passphraseProvider: () => Promise<string>;
  private cache: Map<string, string> | null = null;

  constructor(filePath: string, passphraseProvider: () => Promise<string>) {
    this.filePath = filePath;
    this.passphraseProvider = passphraseProvider;
  }

  async get(key: string): Promise<string | undefined> {
    const secrets = await this.loadSecrets();
    return secrets[key];
  }

  async set(key: string, value: string): Promise<void> {
    const secrets = await this.loadSecrets();
    secrets[key] = value;
    await this.saveSecrets(secrets);
  }

  private async loadSecrets(): Promise<Record<string, string>> {
    if (!existsSync(this.filePath)) {
      return {};
    }

    try {
      const fileContent = readFileSync(this.filePath, "utf8");
      const passphrase = await this.passphraseProvider();
      const decrypted = this.decrypt(fileContent, passphrase);
      return JSON.parse(decrypted);
    } catch {
      return {};
    }
  }

  private async saveSecrets(secrets: Record<string, string>): Promise<void> {
    const passphrase = await this.passphraseProvider();
    const jsonData = JSON.stringify(secrets);
    const encrypted = this.encrypt(jsonData, passphrase);
    writeFileSync(this.filePath, encrypted, { mode: 0o600 });
  }

  private encrypt(data: string, passphrase: string): string {
    const salt = randomBytes(16);
    const key = scryptSync(passphrase, salt, 32);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
    return Buffer.concat([salt, iv, encrypted]).toString("hex");
  }

  private decrypt(data: string, passphrase: string): string {
    const buffer = Buffer.from(data, "hex");
    const salt = buffer.subarray(0, 16);
    const iv = buffer.subarray(16, 32);
    const encrypted = buffer.subarray(32);
    const key = scryptSync(passphrase, salt, 32);
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  }
}
