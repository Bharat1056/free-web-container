import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { decryptSecret, encryptSecret, secretLast4 } from "@/lib/user-secrets";

describe("user-secrets", () => {
  const previous = process.env.ENCRYPTION_KEY;

  before(() => {
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  after(() => {
    if (previous === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = previous;
    }
  });

  it("round-trips encryption", () => {
    const plaintext = "AIzaSyDummyGeminiKeyForTests123456";
    const encrypted = encryptSecret(plaintext);
    assert.equal(encrypted.startsWith("v1:"), true);
    assert.equal(decryptSecret(encrypted), plaintext);
  });

  it("returns last4", () => {
    assert.equal(secretLast4("abcdefghij"), "ghij");
  });
});
