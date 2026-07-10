import { useEffect, useRef, useState } from "react";
import { getCostSummary } from "./api";

interface Pos {
  x: number;
  y: number;
}

const POS_KEY = "waes_cost_widget_pos";
const OPACITY_KEY = "waes_cost_widget_opacity";

/**
 * A small always-on cost readout that floats over any screen. Draggable by its
 * header, resizable (CSS resize handle), with an adjustable transparency slider.
 * Reads the same local cost ledger as the Cost dashboard and refreshes on an
 * interval so you can keep an eye on spend while working.
 */
export function CostWidget({ onClose }: { onClose: () => void }) {
  const [pos, setPos] = useState<Pos>(() => {
    try {
      return JSON.parse(localStorage.getItem(POS_KEY) ?? "") as Pos;
    } catch {
      return { x: window.innerWidth - 240, y: 80 };
    }
  });
  const [opacity, setOpacity] = useState<number>(() => Number(localStorage.getItem(OPACITY_KEY) ?? "0.95"));
  const [collapsed, setCollapsed] = useState(false);
  const [summary, setSummary] = useState<{ today: number; window: number; calls: number } | null>(null);
  const [error, setError] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  }, [pos]);
  useEffect(() => {
    localStorage.setItem(OPACITY_KEY, String(opacity));
  }, [opacity]);

  async function load() {
    try {
      const data = await getCostSummary(1);
      const todayKey = new Date().toISOString().slice(0, 10);
      const today = (data.byDay ?? []).find((d: any) => d.day === todayKey)?.costCents ?? 0;
      setSummary({ today, window: data.total.costCents ?? 0, calls: data.total.calls ?? 0 });
      setError(false);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
  }
  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div
      className="glass-card"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        opacity,
        padding: 8,
        minWidth: 160,
        resize: collapsed ? "none" : "both",
        overflow: "auto",
        fontSize: 12,
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "move", gap: 8 }}
      >
        <b>💸 Cost</b>
        <span style={{ display: "flex", gap: 4 }}>
          <button className="waes-button" style={{ padding: "0 6px" }} onClick={() => setCollapsed((c) => !c)} title="Collapse">
            {collapsed ? "▸" : "▾"}
          </button>
          <button className="waes-button" style={{ padding: "0 6px" }} onClick={onClose} title="Hide">
            ✕
          </button>
        </span>
      </div>

      {!collapsed && (
        <div style={{ marginTop: 6 }}>
          {error ? (
            <div style={{ color: "#ffb2a3" }}>server unreachable</div>
          ) : summary ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 600 }}>${(summary.today / 100).toFixed(2)}</div>
              <div style={{ opacity: 0.65 }}>today · {summary.calls} calls (24h)</div>
            </>
          ) : (
            <div style={{ opacity: 0.6 }}>…</div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, opacity: 0.7 }}>
            <span>opacity</span>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
