import type { ChatProvider } from "../adapters/provider-adapter.interface.js";
import { collectFullWithUsage } from "../adapters/collect.js";

/**
 * The Board of Directors "Counsel" — a 10-agent advisory flow:
 *   1. Five advisor agents (fixed roles) pressure-test the brief, each in a
 *      different way.
 *   2. Their answers are anonymised + shuffled and handed to five separate
 *      peer-review agents that see ONLY the answers (no author/role) and
 *      validate the logic behind each.
 *   3. A Counsel agent receives everything — answers, reviews, and each agent's
 *      label + role — and asks the user clarifying questions.
 *   4. Once answered, the Counsel writes a report, one clear verdict, and the
 *      only next three actionable steps, each broken into micro-actions.
 *
 * All prompt building, anonymisation and parsing is pure and unit-tested; the
 * route layer owns persistence and cost metering.
 */

export interface AgentConfig {
  adapterId: string;
  model: string;
}

export interface AdvisorRole {
  key: string;
  label: string;
  /** Whether this advisor gets the full brief, or only the bare question with
   * zero surrounding context (the Outsider). */
  fullContext: boolean;
  systemPrompt: string;
}

export const ADVISOR_ROLES: AdvisorRole[] = [
  {
    key: "contrarian",
    label: "The Contrarian",
    fullContext: true,
    systemPrompt:
      "You are The Contrarian on a board of advisors. Your ONLY job is to find fatal flaws — nothing else. List everything that is wrong, everything that could go wrong, and what is most likely to kill this project. Be specific and unsparing.",
  },
  {
    key: "first_principles",
    label: "First Principles",
    fullContext: true,
    systemPrompt:
      "You are the First Principles advisor. Ignore the surface question. Ask the serious questions: what exactly are they trying to do or sell? Keep breaking it down until it cannot be reduced further. Answer extremely micro and clean — the smallest true units, no fluff.",
  },
  {
    key: "expansionist",
    label: "The Expansionist",
    fullContext: true,
    systemPrompt:
      "You are The Expansionist. Find the upside to this idea — not the obvious upside, but the real upside that everyone else misses. Be specific about the hidden opportunity and why it is overlooked.",
  },
  {
    key: "outsider",
    label: "The Outsider",
    fullContext: false,
    systemPrompt:
      "You are The Outsider. You have been given the least amount of detail — no history, no context, just the raw question as-is. React only to exactly what is in front of you: what you see, what questions immediately arise, and what it signals.",
  },
  {
    key: "executioner",
    label: "The Executioner",
    fullContext: true,
    systemPrompt:
      "You are The Executioner. You do not care about strategy, nuance, or analysis. The only thing that matters is the exact next actionable step. State what to do next — concrete and immediate.",
  },
];

export const REVIEWER_SYSTEM_PROMPT =
  "You are a peer-review agent. You are given a set of anonymous answers — you do not know who wrote them or why. Your one job is to validate the logic and thinking behind each answer. For each answer, write a short review: is the reasoning sound, what are its gaps, and does its conclusion follow? Judge the thinking, not the wording.";

export const COUNSEL_QUESTION_SYSTEM =
  "You are the Counsel — the final synthesising agent on a board of advisors. You have received every advisor's answer (with their label and role) and every peer review. Before you write a verdict, ask the user the clarifying questions you genuinely need for a high-quality, tailored answer — for example team size, budget, tools already in use, how much autonomy vs. involvement they want, and how much time per day they will spend. Output ONLY the questions, one per line, each prefixed with 'Q: '.";

export const COUNSEL_VERDICT_SYSTEM =
  "You are the Counsel — the final synthesising agent. Using every advisor answer, every peer review, and the user's answers to your questions, produce three sections, each on its own clearly-labelled block:\n" +
  "REPORT: a clear, concise report of the situation and the reasoning.\n" +
  "VERDICT: one single, extremely clear verdict — the one route worth taking, stated so plainly that any other route is obviously worse.\n" +
  "NEXT 3 STEPS: the only next three actionable steps. Number them 'STEP 1:', 'STEP 2:', 'STEP 3:', each with a short title, and under each list its micro-actions as '- ' bullets. Every step and micro-action must be engineered for a quick, concrete win.";

export interface AdvisorResult {
  roleKey: string;
  label: string;
  adapterId: string;
  model: string;
  ok: boolean;
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ReviewResult {
  reviewerIndex: number;
  adapterId: string;
  model: string;
  ok: boolean;
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface AnonymisedAnswer {
  token: string; // "Answer A", "Answer B", ...
  content: string;
}

/** Build the message shown to one advisor. The Outsider gets only the raw
 * question; everyone else gets the full brief. */
export function buildAdvisorMessage(role: AdvisorRole, brief: string): string {
  if (!role.fullContext) return brief.trim();
  return `Brief:\n${brief.trim()}`;
}

const TOKENS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

/** Strip author/role and shuffle so reviewers cannot infer who said what. */
export function anonymiseAndShuffle(
  answers: { content: string }[],
  rng: () => number = Math.random,
): AnonymisedAnswer[] {
  const shuffled = [...answers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.map((a, i) => ({ token: `Answer ${TOKENS[i] ?? i + 1}`, content: a.content }));
}

export function buildReviewerMessage(anon: AnonymisedAnswer[]): string {
  return [
    "Here are the anonymous answers. Review the logic of each.",
    "",
    ...anon.map((a) => `${a.token}:\n${a.content}`),
  ].join("\n\n");
}

export function buildCounselContext(advisors: AdvisorResult[], reviews: ReviewResult[]): string {
  return [
    "Advisor answers (with their roles):",
    ...advisors.map((a) => `${a.label} [${a.roleKey}]:\n${a.content}`),
    "",
    "Peer reviews:",
    ...reviews.map((r) => `Reviewer ${r.reviewerIndex + 1}:\n${r.content}`),
  ].join("\n\n");
}

/** Extract "Q: ..." lines the Counsel emits, with a sensible fallback. */
export function parseClarifyingQuestions(text: string): string[] {
  const qs = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^Q:\s*/i.test(l))
    .map((l) => l.replace(/^Q:\s*/i, "").trim())
    .filter(Boolean);
  if (qs.length) return qs;
  // Fallback: any line ending in a question mark.
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith("?"))
    .slice(0, 8);
}

export interface VerdictStep {
  title: string;
  microActions: string[];
}

export interface ParsedVerdict {
  report: string;
  verdict: string;
  steps: VerdictStep[];
}

/** Parse the Counsel's final output into report / verdict / 3 micro-action steps. */
export function parseVerdict(text: string): ParsedVerdict {
  const section = (name: string): string => {
    const re = new RegExp(`${name}\\s*:?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:REPORT|VERDICT|NEXT 3 STEPS)\\s*:|$)`, "i");
    return text.match(re)?.[1]?.trim() ?? "";
  };

  const report = section("REPORT");
  const verdict = section("VERDICT");
  const stepsBlock = section("NEXT 3 STEPS");

  const steps: VerdictStep[] = [];
  const stepChunks = stepsBlock.split(/\n(?=STEP\s*\d+\s*:)/i).filter((c) => /STEP\s*\d+/i.test(c));
  for (const chunk of stepChunks) {
    const lines = chunk.split("\n");
    const title = lines[0].replace(/^STEP\s*\d+\s*:?\s*/i, "").trim();
    const microActions = lines
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l))
      .map((l) => l.replace(/^[-*]\s+/, "").trim())
      .filter(Boolean);
    steps.push({ title, microActions });
  }

  // If the model didn't use our headers, keep the whole text as the report so
  // nothing is lost.
  if (!report && !verdict && steps.length === 0) return { report: text.trim(), verdict: "", steps: [] };
  return { report, verdict, steps };
}

// ---- Orchestration --------------------------------------------------------

function fenceInstruction(source: string, content: string): string {
  return `<injected-context source="${source}" trust="human-authored">\n${content}\n</injected-context>`;
}

async function callAgent(
  providers: Map<string, ChatProvider>,
  agent: AgentConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<{ ok: boolean; content: string; usage?: { inputTokens: number; outputTokens: number } }> {
  const provider = providers.get(agent.adapterId);
  if (!provider) return { ok: false, content: `[unknown provider "${agent.adapterId}"]` };
  try {
    const { text, usage } = await collectFullWithUsage(
      provider,
      agent.model,
      [{ role: "user", content: userMessage }],
      [fenceInstruction("board:role", systemPrompt)],
    );
    return { ok: true, content: text, usage };
  } catch (err) {
    return { ok: false, content: `[agent error: ${err instanceof Error ? err.message : String(err)}]` };
  }
}

export interface AdvisoryOutput {
  advisors: AdvisorResult[];
  anonymised: AnonymisedAnswer[];
  reviews: ReviewResult[];
  clarifyingQuestions: string[];
  counselContext: string;
}

/** Phases 1–3: advisors → anonymise+shuffle → reviewers → clarifying questions. */
export async function runAdvisory(
  providers: Map<string, ChatProvider>,
  opts: { brief: string; advisors: AgentConfig[]; reviewers: AgentConfig[]; counsel: AgentConfig; rng?: () => number },
): Promise<AdvisoryOutput> {
  const roles = ADVISOR_ROLES;

  const advisors: AdvisorResult[] = await Promise.all(
    opts.advisors.slice(0, roles.length).map(async (agent, i) => {
      const role = roles[i];
      const r = await callAgent(providers, agent, role.systemPrompt, buildAdvisorMessage(role, opts.brief));
      return { roleKey: role.key, label: role.label, adapterId: agent.adapterId, model: agent.model, ...r };
    }),
  );

  const anonymised = anonymiseAndShuffle(advisors.map((a) => ({ content: a.content })), opts.rng);

  const reviews: ReviewResult[] = await Promise.all(
    opts.reviewers.map(async (agent, i) => {
      const r = await callAgent(providers, agent, REVIEWER_SYSTEM_PROMPT, buildReviewerMessage(anonymised));
      return { reviewerIndex: i, adapterId: agent.adapterId, model: agent.model, ...r };
    }),
  );

  const counselContext = buildCounselContext(advisors, reviews);
  const questionsRes = await callAgent(providers, opts.counsel, COUNSEL_QUESTION_SYSTEM, counselContext);
  const clarifyingQuestions = parseClarifyingQuestions(questionsRes.content);

  return { advisors, anonymised, reviews, clarifyingQuestions, counselContext };
}

export interface VerdictOutput extends ParsedVerdict {
  raw: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** Phase 4: the Counsel writes the report, verdict, and 3 micro-action steps. */
export async function runVerdict(
  providers: Map<string, ChatProvider>,
  opts: { counselContext: string; questions: string[]; answers: string; counsel: AgentConfig },
): Promise<VerdictOutput> {
  const message = [
    opts.counselContext,
    "",
    "Clarifying questions you asked and the user's answers:",
    opts.questions.length ? opts.questions.map((q, i) => `Q${i + 1}: ${q}`).join("\n") : "(none)",
    "",
    "User's answers:",
    opts.answers.trim() || "(the user did not provide additional detail)",
  ].join("\n");

  const res = await callAgent(providers, opts.counsel, COUNSEL_VERDICT_SYSTEM, message);
  return { ...parseVerdict(res.content), raw: res.content, usage: res.usage };
}
