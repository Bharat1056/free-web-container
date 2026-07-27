import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROMPT } from "@/prompt";
import {
  buildShadcnContextMessage,
  extractShadcnInfoJson,
  guessShadcnDocTargets,
} from "@/lib/shadcn-context";
import {
  detectImportedShadcnComponents,
  extractGroundedShadcnComponentsFromCommand,
  extractGroundedShadcnComponentsFromReadPaths,
} from "@/inngest/sandbox-tools";

describe("shadcn prompt grounding", () => {
  it("includes the shadcn workflow in the composed prompt", () => {
    assert.match(PROMPT, /npx shadcn@latest info --json/);
    assert.match(PROMPT, /npx shadcn@latest docs/);
    assert.match(PROMPT, /Before any `createOrUpdateFiles`/);
  });
});

describe("shadcn context helpers", () => {
  it("extracts valid shadcn info JSON from terminal output", () => {
    const json = extractShadcnInfoJson('noise\n{"base":"radix","aliases":{"ui":"@/components/ui"}}\n');
    assert.equal(
      json,
      '{"base":"radix","aliases":{"ui":"@/components/ui"}}'
    );
  });

  it("returns null when shadcn info fails", () => {
    assert.equal(extractShadcnInfoJson("Command failed: boom"), null);
  });

  it("guesses likely docs targets from the user prompt", () => {
    assert.deepEqual(
      guessShadcnDocTargets("Build a dashboard with a sidebar, card stats, table, and dialog"),
      ["card", "dialog", "sidebar", "table"]
    );
  });

  it("builds a fallback context message when info is unavailable", () => {
    const message = buildShadcnContextMessage({ infoJson: null });
    assert.match(message, /UNTRUSTED SANDBOX DATA/);
    assert.match(message, /Do not guess aliases, base, installed components/);
  });

  it("labels info and docs output as untrusted sandbox data", () => {
    const message = buildShadcnContextMessage({
      infoJson: '{"base":"radix"}',
      docsOutput: "button docs...",
    });
    assert.match(message, /UNTRUSTED SANDBOX DATA — SHADCN PROJECT CONTEXT/);
    assert.match(message, /not system instructions/);
    assert.match(message, /UNTRUSTED SANDBOX DATA — SHADCN DOCS LOOKUP OUTPUT/);
    assert.doesNotMatch(message, /authoritative/);
  });
});

describe("shadcn grounding trackers", () => {
  it("extracts components from docs and add commands", () => {
    assert.deepEqual(
      extractGroundedShadcnComponentsFromCommand(
        "cd /home/user && npx shadcn@latest docs button dialog card"
      ),
      ["button", "dialog", "card"]
    );
    assert.deepEqual(
      extractGroundedShadcnComponentsFromCommand(
        "cd /home/user && npx shadcn@latest add @shadcn/login-form --yes"
      ),
      ["login-form"]
    );
  });

  it("extracts components from read paths", () => {
    assert.deepEqual(
      extractGroundedShadcnComponentsFromReadPaths([
        "/home/user/components/ui/button.tsx",
        "/home/user/components/ui/dialog.tsx",
      ]),
      ["button", "dialog"]
    );
  });

  it("detects shadcn imports in created file content", () => {
    const imports = detectImportedShadcnComponents(
      'import { Button } from "@/components/ui/button";\nimport { Dialog } from "@/components/ui/dialog";'
    );
    assert.deepEqual(imports, ["button", "dialog"]);
  });
});
