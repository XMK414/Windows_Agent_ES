import { useEffect, useState } from "react";
import { createTool, listTools, listToolCategories, createStack, type Tool, type StackSummary, type ToolInput } from "./api";

const RATING_FIELDS: { key: keyof ToolInput; label: string }[] = [
  { key: "easeOfUse", label: "Ease of use" },
  { key: "speed", label: "Speed" },
  { key: "quality", label: "Quality" },
  { key: "privacy", label: "Privacy/security" },
  { key: "vendorLockIn", label: "Portability (5 = easy to leave)" },
  { key: "integrations", label: "Integrations/API" },
  { key: "support", label: "Community/support" },
  { key: "scalability", label: "Scalability" },
];

function RatingDots({ value }: { value?: number }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`waes-rating-dot${(value ?? 0) >= n ? "" : " dim"}`} />
      ))}
    </span>
  );
}

function formatCost(t: Tool): string {
  if (t.costType === "free") return "Free";
  if (t.costType === "freemium") return "Freemium";
  const amount = t.costAmountCents != null ? `$${(t.costAmountCents / 100).toFixed(2)}` : "?";
  const per = t.costPer ? `/${t.costPer}` : "";
  return `${amount}${per}`;
}

function NewToolForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<ToolInput>({ category: "", name: "", costType: "free", hosting: "self" });
  const [error, setError] = useState<string | null>(null);

  function setRating(key: keyof ToolInput, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError(null);
    try {
      await createTool(form);
      setForm({ category: form.category, name: "", costType: "free", hosting: "self" });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="glass-card">
      <h3>Add a tool to the catalog</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input className="waes-input" placeholder="Category (e.g. LLM Hosting)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input className="waes-input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="waes-select" value={form.costType} onChange={(e) => setForm({ ...form, costType: e.target.value as ToolInput["costType"] })}>
          <option value="free">Free</option>
          <option value="freemium">Freemium</option>
          <option value="subscription">Subscription</option>
          <option value="one_time">One-time</option>
          <option value="usage_based">Usage-based</option>
        </select>
        {form.costType !== "free" && form.costType !== "freemium" && (
          <>
            <input
              className="waes-input"
              type="number"
              placeholder="Cost ($)"
              style={{ width: 100 }}
              onChange={(e) => setForm({ ...form, costAmountCents: Math.round(Number(e.target.value) * 100) })}
            />
            <select className="waes-select" onChange={(e) => setForm({ ...form, costPer: e.target.value as ToolInput["costPer"] })}>
              <option value="project">per project</option>
              <option value="month">per month</option>
              <option value="unit">per unit</option>
            </select>
          </>
        )}
        <select className="waes-select" value={form.hosting} onChange={(e) => setForm({ ...form, hosting: e.target.value as ToolInput["hosting"] })}>
          <option value="self">Self-hosted</option>
          <option value="hosted">Hosted</option>
          <option value="both">Both</option>
        </select>
        <select className="waes-select" onChange={(e) => setForm({ ...form, license: e.target.value as ToolInput["license"] })}>
          <option value="">License...</option>
          <option value="open_source">Open source</option>
          <option value="proprietary">Proprietary</option>
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        {RATING_FIELDS.map(({ key, label }) => (
          <label key={key} style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
            {label}
            <input type="range" className="waes-slider" min={1} max={5} defaultValue={3} onChange={(e) => setRating(key, Number(e.target.value))} />
          </label>
        ))}
      </div>

      <input className="waes-input" placeholder="Terms summary" style={{ width: "100%", marginBottom: 8 }} onChange={(e) => setForm({ ...form, termsSummary: e.target.value })} />

      <button className="waes-button" onClick={submit} disabled={!form.category || !form.name}>
        Add tool
      </button>
      {error && <div style={{ color: "#ffb2a3", fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

export function StackBuilder() {
  const [categories, setCategories] = useState<string[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({}); // category -> toolId
  const [budget, setBudget] = useState(5000); // cents
  const [budgetPeriod, setBudgetPeriod] = useState<"project" | "month">("month");
  const [stackName, setStackName] = useState("My Stack");
  const [result, setResult] = useState<StackSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setCategories(await listToolCategories());
    setTools(await listTools());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function buildStack() {
    setError(null);
    const items = Object.entries(selected).map(([category, toolId]) => ({ category, toolId }));
    if (!items.length) {
      setError("Pick at least one tool");
      return;
    }
    try {
      const summary = await createStack(stackName, budget, budgetPeriod, items);
      setResult(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const toolsByCategory = categories.map((cat) => ({ category: cat, tools: tools.filter((t) => t.category === cat) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <NewToolForm onCreated={refresh} />

      <div className="glass-card">
        <h3>Build your stack</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <input className="waes-input" value={stackName} onChange={(e) => setStackName(e.target.value)} />
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2, minWidth: 220 }}>
            Budget: ${(budget / 100).toFixed(0)} / {budgetPeriod}
            <input type="range" className="waes-slider" min={0} max={100000} step={500} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          </label>
          <select className="waes-select" value={budgetPeriod} onChange={(e) => setBudgetPeriod(e.target.value as "project" | "month")}>
            <option value="month">per month</option>
            <option value="project">per project (one-time)</option>
          </select>
          <button className="waes-button" onClick={buildStack}>
            Calculate
          </button>
        </div>

        {toolsByCategory.map(({ category, tools: catTools }) => (
          <div key={category} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{category}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {catTools.map((t) => (
                <label
                  key={t.id}
                  style={{
                    border: `1px solid ${selected[category] === t.id ? "var(--waes-accent)" : "var(--waes-glass-border)"}`,
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <input
                    type="radio"
                    name={category}
                    style={{ display: "none" }}
                    checked={selected[category] === t.id}
                    onChange={() => setSelected((s) => ({ ...s, [category]: t.id }))}
                  />
                  <b>{t.name}</b>
                  <span>{formatCost(t)} · {t.hosting}{t.license ? ` · ${t.license.replace("_", " ")}` : ""}</span>
                  <RatingDots value={t.quality} />
                </label>
              ))}
            </div>
          </div>
        ))}

        {error && <div style={{ color: "#ffb2a3", fontSize: 12 }}>{error}</div>}
      </div>

      {result && (
        <div className="glass-card">
          <h3>
            {result.name} {result.overBudget && <span className="waes-badge warn">over budget</span>}
          </h3>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Monthly: ${(result.totals.monthlyCents / 100).toFixed(2)} · One-time: ${(result.totals.oneTimeCents / 100).toFixed(2)}
          </div>
          {result.items.map((item: any) => (
            <div key={item.id} style={{ fontSize: 12, marginBottom: 4 }}>
              <b>{item.category}:</b> {item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
