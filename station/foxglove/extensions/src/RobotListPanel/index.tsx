import React, { useCallback, useEffect, useRef, useState } from "react";
import { normalize, batColor, modeColor } from "../panel-utils";

// ---------------------------------------------------------------------------
// Local Foxglove types (not available at build time)
// ---------------------------------------------------------------------------
interface Subscription { unsubscribe(): void }
interface PanelExtensionContext {
  subscribe(topic: string, opts?: { fields?: string[] }): Subscription;
  publish(topic: string, msg: Record<string, unknown>): void;
  advertise(topic: string, schema: string): void;
  onRender?: (rs: Record<string, unknown>) => void;
  panel: { config: Record<string, unknown> };
  theme: { palette: "dark" | "light"; primaryColor: string };
  saveState(s: Record<string, unknown>): void;
}
interface RobotListPanelProps { context: PanelExtensionContext }

// ---------------------------------------------------------------------------
// Display model
// ---------------------------------------------------------------------------
interface RobotInfo {
  robot_id: string;
  online: boolean;
  battery: number | null;
  mode: string | null;
  velocity: { linear: number; angular: number } | null;
  subscribedTopicsCount: number;
}
function px(n: number, on: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
    borderRadius: 6, cursor: "pointer", opacity: on ? 1 : 0.5,
    background: n ? "rgba(76,175,80,0.12)" : "rgba(255,255,255,0.04)",
    border: n ? "1px solid rgba(76,175,80,0.4)" : "1px solid transparent",
    transition: "background 0.15s, border 0.15s",
  };
}
function dot(on: boolean): React.CSSProperties {
  return { width: 10, height: 10, borderRadius: "50%", background: on ? "#4caf50" : "#f44336", flexShrink: 0 };
}
function badge(c: string): React.CSSProperties {
  return { display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600, color: "#fff", background: c };
}
const hdr: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "8px 12px", fontSize: 13, fontWeight: 600,
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};
const hdrBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
  color: "inherit", borderRadius: 4, padding: "3px 8px", fontSize: 11, cursor: "pointer",
};
const ftr: React.CSSProperties = {
  display: "flex", alignItems: "center", padding: "8px 12px", fontSize: 12,
  color: "rgba(255,255,255,0.5)", borderTop: "1px solid rgba(255,255,255,0.1)",
};
const row: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12, color: "rgba(255,255,255,0.6)",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function RobotListPanel({ context }: RobotListPanelProps): React.ReactElement {
  const [robots, setRobots] = useState<RobotInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastIdx = useRef(-1);

  // Subscribe + render
  useEffect(() => {
    const subs = [context.subscribe("/station/robot_list")];
    context.advertise("/station/discover", "std_msgs/String");
    context.advertise("/station/selected_robots", "std_msgs/String");

    context.onRender = (rs: Record<string, unknown>) => {
      try {
        const rawMsgs = (rs as Record<string, unknown>).messages;
        let evts: unknown[] | undefined;
        if (rawMsgs instanceof Map) evts = rawMsgs.get("/station/robot_list");
        else if (rawMsgs && typeof rawMsgs === "object")
          evts = (rawMsgs as Record<string, unknown>)["/station/robot_list"] as unknown[] | undefined;
        if (!evts || evts.length === 0) return;

        const latest = evts[evts.length - 1] as Record<string, unknown>;
        const rawData = latest.message;
        let parsed: Record<string, unknown>;
        if (typeof rawData === "string") parsed = JSON.parse(rawData);
        else if (rawData && typeof (rawData as Record<string, unknown>).data === "string")
          parsed = JSON.parse((rawData as Record<string, unknown>).data as string);
        else parsed = rawData as Record<string, unknown>;

        const list = parsed?.robots;
        if (Array.isArray(list)) { setRobots((list as Record<string, unknown>[]).map(normalize)); setError(null); }
        else setError("Invalid robot list: missing 'robots' array");
      } catch (e: unknown) { setError(e instanceof Error ? e.message : "Parse error"); }
      finally { setLoading(false); }
    };
    return () => { subs.forEach((s) => s.unsubscribe()); context.onRender = undefined; };
  }, [context]);

  // Publish selection on change
  useEffect(() => {
    context.publish("/station/selected_robots", { data: JSON.stringify({ robot_ids: Array.from(selectedIds) }) });
  }, [selectedIds, context]);

  // Handlers
  const handleClick = useCallback((i: number, e: React.MouseEvent) => {
    const robot = robots[i]; if (!robot) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (e.ctrlKey || e.metaKey) {
        next.has(robot.robot_id) ? next.delete(robot.robot_id) : next.add(robot.robot_id);
        lastIdx.current = i;
      } else if (e.shiftKey && lastIdx.current >= 0) {
        const [a, b] = [Math.min(lastIdx.current, i), Math.max(lastIdx.current, i)];
        for (let j = a; j <= b; j++) next.add(robots[j].robot_id);
      } else {
        if (next.size === 1 && next.has(robot.robot_id)) next.clear();
        else { next.clear(); next.add(robot.robot_id); }
        lastIdx.current = i;
      }
      return next;
    });
  }, [robots]);

  const handleAll = useCallback(() => {
    setSelectedIds(new Set(robots.map((r) => r.robot_id)));
  }, [robots]);
  const handleClear = useCallback(() => setSelectedIds(new Set()), []);
  const handleDisc = useCallback(() => context.publish("/station/discover", { data: "{}" }), [context]);

  const onlineCount = robots.filter((r) => r.online).length;
  const allSelected = robots.length > 0 && selectedIds.size === robots.length;

  // Render states
  const btnRow = (
    <div style={{ display: "flex", gap: 6 }}>
      <button style={hdrBtn} onClick={handleDisc}>发现</button>
      {robots.length > 0 && (
        <button style={hdrBtn} onClick={allSelected ? handleClear : handleAll}>
          {allSelected ? "清除" : "全选"}
        </button>
      )}
    </div>
  );

  if (loading) return <div style={{ ...hdr, ...{ justifyContent: "center", border: "none" } }}>等待机器人数据...</div>;
  if (error && robots.length === 0) return <div><div style={hdr}><span>Robot List</span>{btnRow}</div><div style={{ ...hdr, color: "#f44336", justifyContent: "center", border: "none", padding: 40 }}>{error}</div></div>;
  if (robots.length === 0) return <div><div style={hdr}><span>Robot List</span>{btnRow}</div><div style={{ ...hdr, justifyContent: "center", border: "none", padding: 40, color: "rgba(255,255,255,0.4)" }}>没有在线机器人</div></div>;

  // Normal
  return (
    <div>
      <div style={hdr}>
        <span>Robot List 在线: {onlineCount}/{robots.length}</span>
        {btnRow}
      </div>
      {error && (
        <div style={{ padding: "6px 12px", fontSize: 12, color: "#f44336", background: "rgba(244,67,54,0.1)", borderBottom: "1px solid rgba(244,67,54,0.2)" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8 }} role="listbox" aria-label="Robot list">
        {robots.map((r, i) => {
          const sel = selectedIds.has(r.robot_id);
          return (
            <div key={r.robot_id} style={px(sel ? 1 : 0, r.online)} onClick={(e) => handleClick(i, e)} role="option" aria-selected={sel}>
              <div style={dot(r.online)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{r.robot_id}</div>
                {r.online ? (
                  <div style={row}>
                    {r.battery !== null && <span style={{ color: batColor(r.battery) }}>{r.battery.toFixed(0)}%</span>}
                    {r.mode && <span style={badge(modeColor(r.mode))}>{r.mode}</span>}
                    {r.velocity && <span>{r.velocity.linear.toFixed(1)} m/s</span>}
                    <span>{r.subscribedTopicsCount} topic(s)</span>
                  </div>
                ) : (
                  <div style={{ ...row, color: "#f44336" }}>offline</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={ftr}>{selectedIds.size === 0 ? "未选中" : `已选中: ${selectedIds.size} 个机器人`}</div>
    </div>
  );
}
