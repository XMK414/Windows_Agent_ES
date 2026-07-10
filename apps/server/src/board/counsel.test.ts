import { describe, it, expect } from "vitest";
import type { ChatProvider, ChatRequest, StreamChunk } from "../adapters/provider-adapter.interface.js";
import {
  ADVISOR_ROLES,
  anonymiseAndShuffle,
  buildAdvisorMessage,
  parseClarifyingQuestions,
  parseVerdict,
  runAdvisory,
  runVerdict,
  REVIEWER_SYSTEM_PROMPT,
} from "./counsel.js";

interface Call {
  system: string;
  user: string;
}

/** Fake provider that records each call and echoes back a marker so tests can
 * see which system prompt / user message each agent received. */
function makeProvider(calls: Call[]): ChatProvider {
  return {
    id: "test",
    requiresApiKey: false,
    async listModels() {
      return [];
    },
    async *send(req: ChatRequest): AsyncIterable<StreamChunk> {
      const system = req.injectedContext.join("\n");
      const user = req.messages.map((m) => m.content).join("\n");
      calls.push({ system, user });
      yield { type: "delta", text: `RESP<${system.slice(0, 40)}>` };
      yield { type: "done", usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
}

describe("anonymiseAndShuffle", () => {
  it("strips attribution and assigns Answer A..E tokens", () => {
    const answers = [{ content: "one" }, { content: "two" }, { content: "three" }, { content: "four" }, { content: "five" }];
    const anon = anonymiseAndShuffle(answers, () => 0);
    expect(anon).toHaveLength(5);
    expect(anon.map((a) => a.token)).toEqual(["Answer A", "Answer B", "Answer C", "Answer D", "Answer E"]);
    // Same multiset of contents, order possibly changed, no author fields.
    expect(new Set(anon.map((a) => a.content))).toEqual(new Set(["one", "two", "three", "four", "five"]));
    expect(Object.keys(anon[0])).toEqual(["token", "content"]);
  });
});

describe("buildAdvisorMessage", () => {
  it("gives the Outsider only the raw question, others the full brief", () => {
    const outsider = ADVISOR_ROLES.find((r) => r.key === "outsider")!;
    const contrarian = ADVISOR_ROLES.find((r) => r.key === "contrarian")!;
    expect(buildAdvisorMessage(outsider, "should we launch?")).toBe("should we launch?");
    expect(buildAdvisorMessage(contrarian, "should we launch?")).toContain("Brief:");
  });
});

describe("parseClarifyingQuestions", () => {
  it("extracts Q: lines", () => {
    const text = "Some intro\nQ: How big is your team?\nQ: What is your budget?\nnoise";
    expect(parseClarifyingQuestions(text)).toEqual(["How big is your team?", "What is your budget?"]);
  });

  it("falls back to lines ending in a question mark", () => {
    const text = "What tools do you use?\nRandom statement.\nHow much time per day?";
    expect(parseClarifyingQuestions(text)).toEqual(["What tools do you use?", "How much time per day?"]);
  });
});

describe("parseVerdict", () => {
  it("splits report, verdict, and 3 micro-action steps", () => {
    const text = [
      "REPORT:",
      "The situation is X and Y.",
      "VERDICT:",
      "Do the focused thing.",
      "NEXT 3 STEPS:",
      "STEP 1: Validate demand",
      "- Call 5 prospects",
      "- Post a landing page",
      "STEP 2: Build the core",
      "- Ship the smallest slice",
      "STEP 3: Sell it",
      "- Send 10 outreach messages",
    ].join("\n");
    const parsed = parseVerdict(text);
    expect(parsed.report).toBe("The situation is X and Y.");
    expect(parsed.verdict).toBe("Do the focused thing.");
    expect(parsed.steps).toHaveLength(3);
    expect(parsed.steps[0]).toEqual({ title: "Validate demand", microActions: ["Call 5 prospects", "Post a landing page"] });
    expect(parsed.steps[2].microActions).toEqual(["Send 10 outreach messages"]);
  });

  it("keeps unstructured output as the report so nothing is lost", () => {
    const parsed = parseVerdict("just some freeform text");
    expect(parsed.report).toBe("just some freeform text");
    expect(parsed.steps).toEqual([]);
  });
});

describe("runAdvisory", () => {
  it("runs 5 advisors, 5 reviewers, and 1 counsel; reviewers never see attribution", async () => {
    const calls: Call[] = [];
    const providers = new Map<string, ChatProvider>([["test", makeProvider(calls)]]);
    const agent = { adapterId: "test", model: "m" };

    const out = await runAdvisory(providers, {
      brief: "should we launch the widget?",
      advisors: Array(5).fill(agent),
      reviewers: Array(5).fill(agent),
      counsel: agent,
    });

    expect(out.advisors).toHaveLength(5);
    expect(out.advisors.map((a) => a.label)).toEqual(ADVISOR_ROLES.map((r) => r.label));
    expect(out.reviews).toHaveLength(5);
    expect(out.anonymised).toHaveLength(5);
    // 5 + 5 + 1 clarifying-questions call.
    expect(calls).toHaveLength(11);

    // Reviewer calls carry the peer-review system prompt and the anonymised
    // answers, but never a role label.
    const reviewerCalls = calls.filter((c) => c.system.includes(REVIEWER_SYSTEM_PROMPT.slice(0, 30)));
    expect(reviewerCalls).toHaveLength(5);
    for (const c of reviewerCalls) {
      expect(c.user).toContain("Answer A");
      for (const role of ADVISOR_ROLES) expect(c.user).not.toContain(role.label);
    }

    expect(out.advisors[0].usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
});

describe("runVerdict", () => {
  it("produces a parsed verdict from the counsel's structured output", async () => {
    const verdictText = ["REPORT:", "r", "VERDICT:", "v", "NEXT 3 STEPS:", "STEP 1: A", "- do a", "STEP 2: B", "- do b", "STEP 3: C", "- do c"].join("\n");
    const provider: ChatProvider = {
      id: "test",
      requiresApiKey: false,
      async listModels() {
        return [];
      },
      async *send(): AsyncIterable<StreamChunk> {
        yield { type: "delta", text: verdictText };
        yield { type: "done", usage: { inputTokens: 3, outputTokens: 4 } };
      },
    };
    const providers = new Map<string, ChatProvider>([["test", provider]]);
    const res = await runVerdict(providers, {
      counselContext: "ctx",
      questions: ["How big is your team?"],
      answers: "Just me.",
      counsel: { adapterId: "test", model: "m" },
    });
    expect(res.report).toBe("r");
    expect(res.verdict).toBe("v");
    expect(res.steps).toHaveLength(3);
    expect(res.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
  });
});
