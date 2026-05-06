import React, { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Local Foxglove types (not available at build time)
// ---------------------------------------------------------------------------
interface Subscription { unsubscribe(): void }
interface PanelExtensionContext {
  subscribe(topic: string, opts?: { fields?: string[] }): Subscription;
  publish(topic: string, msg: Record<string, unknown>): void;
  onRender?: (rs: Record<string, unknown>) => void;
  panel: { config: Record<string, unknown> };
  theme: { palette: "dark" | "light"; primaryColor: string };
  saveState(s: Record<string, unknown>): void;
}
interface CommandPanelProps { context: PanelExtensionContext }

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const container: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 12,
  fontSize: 13,
  color: "rgba(255,255,255,0.85)",
};

const header: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  paddingBottom: 8,
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const targetLabel: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.5)",
  padding: "4px 0",
};

const selectedNames: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "rgba(255,255,255,0.85)",
  paddingBottom: 4,
};

const sliderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const sliderLabel: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.6)",
  flexShrink: 0,
  width: 100,
};

const slider: React.CSSProperties = {
  flex: 1,
  height: 6,
  borderRadius: 3,
  accentColor: "#4fc3f7",
  cursor: "pointer",
};

const sliderValue: React.CSSProperties = {
  fontSize: 12,
  fontFamily: "monospace",
  flexShrink: 0,
  width: 44,
  textAlign: "right" as const,
};

const sendBtn: React.CSSProperties = {
  width: "100%",
  padding: "10px 0",
  borderRadius: 6,
  border: "none",
  background: "#4fc3f7",
  color: "#0d1117",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const eStopBtn: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "10px 0",
  borderRadius: 6,
  border: "2px solid #c0392b",
  background: "#e74c3c",
  color: "#fff",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const modeRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
};

const modeBtnBase: React.CSSProperties = {
  flex: 1,
  padding: "8px 0",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.6)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  transition: "background 0.15s, border 0.15s, color 0.15s",
};

const homeBtn: React.CSSProperties = {
  width: "100%",
  padding: "8px 0",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.6)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  transition: "background 0.15s",
};

const disabled: React.CSSProperties = {
  opacity: 0.35,
  cursor: "not-allowed",
};

const emptyHint: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "40px 12px",
  fontSize: 14,
  color: "rgba(255,255,255,0.35)",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CommandPanel({ context }: CommandPanelProps): React.ReactElement {
  const [robotIds, setRobotIds] = useState<string[]>([]);
  const [linear, setLinear] = useState(0);
  const [angular, setAngular] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastLinear = useRef(0);
  const lastAngular = useRef(0);

  const hasSelection = robotIds.length > 0;

  // Subscribe to selected robots
  useEffect(() => {
    const sub = context.subscribe("/station/selected_robots");

    context.onRender = (rs: Record<string, unknown>) => {
      try {
        const rawMsgs = (rs as Record<string, unknown>).messages;
        let evts: unknown[] | undefined;
        if (rawMsgs instanceof Map) evts = rawMsgs.get("/station/selected_robots");
        else if (rawMsgs && typeof rawMsgs === "object")
          evts = (rawMsgs as Record<string, unknown>)["/station/selected_robots"] as unknown[] | undefined;
        if (!evts || evts.length === 0) return;
        setError(null);

        const latest = evts[evts.length - 1] as Record<string, unknown>;
        const rawData = latest.message;
        let parsed: { robot_ids?: string[] };
        if (typeof rawData === "string") parsed = JSON.parse(rawData);
        else if (rawData && typeof (rawData as Record<string, unknown>).data === "string")
          parsed = JSON.parse((rawData as Record<string, unknown>).data as string);
        else parsed = rawData as { robot_ids?: string[] };

        if (Array.isArray(parsed?.robot_ids)) {
          setRobotIds(parsed.robot_ids as string[]);
        } else {
          setRobotIds([]);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Parse error");
      } finally {
        setLoading(false);
      }
    };

    return () => { sub.unsubscribe(); context.onRender = undefined; };
  }, [context]);

  // Publish helper
  const sendCommand = useCallback(
    (action: string, params: Record<string, unknown>) => {
      for (const robotId of robotIds) {
        if (!robotId) continue;
        context.publish(`/cmd/${robotId}/command`, {
          data: JSON.stringify({ action, params }),
        });
      }
    },
    [robotIds, context],
  );

  // "发送速度指令"
  const handleSendVelocity = useCallback(() => {
    lastLinear.current = linear;
    lastAngular.current = angular;
    sendCommand("velocity", { linear, angular });
  }, [linear, angular, sendCommand]);

  // "全部急停"
  const handleEStop = useCallback(() => {
    setLinear(0);
    setAngular(0);
    sendCommand("velocity", { linear: 0, angular: 0 });
  }, [sendCommand]);

  // Mode buttons
  const handleModeManual = useCallback(() => {
    sendCommand("mode", { mode: "manual" });
  }, [sendCommand]);

  const handleModeAuto = useCallback(() => {
    sendCommand("mode", { mode: "auto" });
  }, [sendCommand]);

  // "返回 Home"
  const handleHome = useCallback(() => {
    sendCommand("nav_goal", { target: "home" });
  }, [sendCommand]);

  // Loading state
  if (loading) {
    return (
      <div style={{ ...header, justifyContent: "center", border: "none", padding: 40, color: "rgba(255,255,255,0.4)" } as React.CSSProperties}>
        等待机器人数据...
      </div>
    );
  }

  // Error state (no robots) – still show the panel but disabled
  if (error && !hasSelection) {
    return (
      <div style={container}>
        <div style={header}>Command</div>
        <div style={{ fontSize: 12, color: "#f44336", textAlign: "center", padding: 12 }}>
          {error}
        </div>
        <div style={emptyHint}>未选中机器人</div>
      </div>
    );
  }

  const sliderStyle = { ...slider, ...(hasSelection ? {} : disabled) };
  const sendBtnStyle = hasSelection ? sendBtn : { ...sendBtn, ...disabled };
  const eStopBtnStyle = hasSelection ? eStopBtn : { ...eStopBtn, ...disabled };
  const homeBtnStyle = hasSelection ? homeBtn : { ...homeBtn, ...disabled };

  return (
    <div style={container}>
      {/* Title */}
      <div style={header}>Command</div>

      {/* Selected robot names */}
      <div style={targetLabel}>目标:</div>
      <div style={selectedNames}>
        {hasSelection ? robotIds.join(", ") : "未选中机器人"}
      </div>

      {/* Error message */}
      {error && (
        <div style={{ fontSize: 12, color: "#f44336", padding: "2px 0" }}>
          {error}
        </div>
      )}

      {/* Linear slider */}
      <div style={{ fontWeight: 600, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
        Linear (m/s)
      </div>
      <div style={sliderRow}>
        <input
          type="range"
          min={-1.0}
          max={1.0}
          step={0.1}
          value={linear}
          style={sliderStyle}
          disabled={!hasSelection}
          onChange={(e) => setLinear(parseFloat(e.target.value))}
        />
        <span style={sliderValue}>{linear.toFixed(1)}</span>
      </div>

      {/* Angular slider */}
      <div style={{ fontWeight: 600, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
        Angular (rad/s)
      </div>
      <div style={sliderRow}>
        <input
          type="range"
          min={-1.0}
          max={1.0}
          step={0.1}
          value={angular}
          style={sliderStyle}
          disabled={!hasSelection}
          onChange={(e) => setAngular(parseFloat(e.target.value))}
        />
        <span style={sliderValue}>{angular.toFixed(1)}</span>
      </div>

      {/* Send velocity button */}
      <button
        style={sendBtnStyle}
        disabled={!hasSelection}
        onClick={handleSendVelocity}
      >
        发送速度指令
      </button>

      {/* Emergency stop */}
      <button
        style={eStopBtnStyle}
        disabled={!hasSelection}
        onClick={handleEStop}
      >
        全部急停
      </button>

      {/* Mode toggle */}
      <div style={{ fontWeight: 600, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
        模式:
      </div>
      <div style={modeRow}>
        <button
          style={hasSelection ? modeBtnBase : { ...modeBtnBase, ...disabled }}
          disabled={!hasSelection}
          onClick={handleModeManual}
        >
          Manual
        </button>
        <button
          style={hasSelection ? modeBtnBase : { ...modeBtnBase, ...disabled }}
          disabled={!hasSelection}
          onClick={handleModeAuto}
        >
          Auto
        </button>
      </div>

      {/* Return Home */}
      <button
        style={homeBtnStyle}
        disabled={!hasSelection}
        onClick={handleHome}
      >
        返回 Home
      </button>
    </div>
  );
}
