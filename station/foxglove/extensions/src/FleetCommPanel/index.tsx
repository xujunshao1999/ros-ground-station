import React, { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Local Foxglove types (not available at build time)
// ---------------------------------------------------------------------------
interface Subscription {
  unsubscribe(): void;
}
interface PanelExtensionContext {
  subscribe(topic: string, opts?: { fields?: string[] }): Subscription;
  publish(topic: string, msg: Record<string, unknown>): void;
  advertise(topic: string, schemaName: string): void;
  onRender?: (rs: Record<string, unknown>) => void;
  panel: { config: Record<string, unknown> };
  theme: { palette: "dark" | "light"; primaryColor: string };
  saveState(s: Record<string, unknown>): void;
}
interface FleetCommPanelProps {
  context: PanelExtensionContext;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface FleetRule {
  id: string;
  topic: string;
  msg_type: string;
  source: string;
  target: string;
  freq_limit: number;
  transport: "mqtt_json" | "mqtt_binary" | "http_stream" | "auto";
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const container: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  fontSize: 13,
  color: "rgba(255,255,255,0.85)",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const addBtn: React.CSSProperties = {
  background: "rgba(79,195,247,0.15)",
  border: "1px solid rgba(79,195,247,0.3)",
  color: "#4fc3f7",
  borderRadius: 4,
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background 0.15s",
};

const tableContainer: React.CSSProperties = {
  margin: "6px 8px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.1)",
  overflow: "hidden",
};

const thRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
};

const colSource: React.CSSProperties = {
  width: 60,
  flexShrink: 0,
  fontSize: 11,
  fontFamily: "monospace",
};

const colArrow: React.CSSProperties = {
  width: 24,
  flexShrink: 0,
  textAlign: "center",
  color: "rgba(255,255,255,0.25)",
  fontSize: 11,
};

const colTarget: React.CSSProperties = {
  width: 60,
  flexShrink: 0,
  fontSize: 11,
  fontFamily: "monospace",
};

const colTopic: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontFamily: "monospace",
  fontSize: 11,
};

const colFreq: React.CSSProperties = {
  width: 42,
  flexShrink: 0,
  textAlign: "right",
  fontFamily: "monospace",
  fontSize: 11,
};

const colToggle: React.CSSProperties = {
  width: 36,
  flexShrink: 0,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const colAction: React.CSSProperties = {
  width: 28,
  flexShrink: 0,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "6px 10px",
  fontSize: 12,
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const toggleOff: React.CSSProperties = {
  width: 28,
  height: 14,
  borderRadius: 7,
  background: "rgba(255,255,255,0.15)",
  position: "relative",
  cursor: "pointer",
  border: "none",
  padding: 0,
  flexShrink: 0,
};

const toggleOn: React.CSSProperties = {
  ...toggleOff,
  background: "#4fc3f7",
};

const toggleKnob: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: "50%",
  background: "#fff",
  position: "absolute",
  top: 1,
  transition: "left 0.15s",
};

const deleteBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "rgba(244,67,54,0.7)",
  fontSize: 12,
  cursor: "pointer",
  padding: "2px 4px",
  borderRadius: 3,
  lineHeight: 1,
};

const footer: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px",
  fontSize: 12,
  color: "rgba(255,255,255,0.5)",
  borderTop: "1px solid rgba(255,255,255,0.1)",
};

const emptyHint: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "28px 12px",
  fontSize: 13,
  color: "rgba(255,255,255,0.3)",
};

const errorBanner: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  color: "#f44336",
  background: "rgba(244,67,54,0.1)",
  borderBottom: "1px solid rgba(244,67,54,0.2)",
};

const loading: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "28px 12px",
  fontSize: 13,
  color: "rgba(255,255,255,0.3)",
};

// --- Inline form styles ---
const formContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "8px 12px",
  background: "rgba(79,195,247,0.06)",
  borderBottom: "1px solid rgba(79,195,247,0.2)",
};

const formRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const formInput: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontSize: 11,
  outline: "none",
  fontFamily: "monospace",
};

const formSelect: React.CSSProperties = {
  ...formInput,
  minWidth: 80,
};

const formBtn: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: 4,
  border: "none",
  background: "#4fc3f7",
  color: "#0d1117",
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
};

const formCancel: React.CSSProperties = {
  ...formBtn,
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "rgba(255,255,255,0.6)",
};

// ---------------------------------------------------------------------------
// Helper: generate a short unique id
// ---------------------------------------------------------------------------
let _ruleCounter = 0;
function nextRuleId(): string {
  _ruleCounter += 1;
  return `rule_${Date.now()}_${_ruleCounter}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function FleetCommPanel({
  context,
}: FleetCommPanelProps): React.ReactElement {
  const [rules, setRules] = useState<FleetRule[]>([]);
  const [robotList, setRobotList] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form fields
  const [formSource, setFormSource] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formMsgType, setFormMsgType] = useState("");
  const [formFreq, setFormFreq] = useState(10);
  const [formTransport, setFormTransport] =
    useState<string>("mqtt_json");

  // Subscribe + render
  useEffect(() => {
    const subs: Subscription[] = [
      context.subscribe("/station/fleet_rules"),
      context.subscribe("/station/robot_list"),
    ];
    context.advertise("/station/config_sync", "std_msgs/String");

    context.onRender = (rs: Record<string, unknown>) => {
      try {
        const rawMsgs = (rs as Record<string, unknown>).messages;

        // Parse fleet rules
        let rulesEvts: unknown[] | undefined;
        if (rawMsgs instanceof Map)
          rulesEvts = rawMsgs.get("/station/fleet_rules");
        else if (rawMsgs && typeof rawMsgs === "object")
          rulesEvts = (rawMsgs as Record<string, unknown>)[
            "/station/fleet_rules"
          ] as unknown[] | undefined;
        if (rulesEvts && rulesEvts.length > 0) {
          const latest = rulesEvts[
            rulesEvts.length - 1
          ] as Record<string, unknown>;
          const rawData = latest.message;
          let parsed: Record<string, unknown>;
          if (typeof rawData === "string") parsed = JSON.parse(rawData);
          else if (
            rawData &&
            typeof (rawData as Record<string, unknown>).data === "string"
          )
            parsed = JSON.parse(
              (rawData as Record<string, unknown>).data as string,
            );
          else parsed = rawData as Record<string, unknown>;

          const fleetRules = parsed.fleet_rules;
          if (Array.isArray(fleetRules)) {
            setRules(fleetRules as FleetRule[]);
          }
        }

        // Parse robot list for source/target options
        let listEvts: unknown[] | undefined;
        if (rawMsgs instanceof Map)
          listEvts = rawMsgs.get("/station/robot_list");
        else if (rawMsgs && typeof rawMsgs === "object")
          listEvts = (rawMsgs as Record<string, unknown>)[
            "/station/robot_list"
          ] as unknown[] | undefined;
        if (listEvts && listEvts.length > 0) {
          const latest = listEvts[
            listEvts.length - 1
          ] as Record<string, unknown>;
          const rawData = latest.message;
          let parsed: Record<string, unknown>;
          if (typeof rawData === "string") parsed = JSON.parse(rawData);
          else if (
            rawData &&
            typeof (rawData as Record<string, unknown>).data === "string"
          )
            parsed = JSON.parse(
              (rawData as Record<string, unknown>).data as string,
            );
          else parsed = rawData as Record<string, unknown>;

          const robots = parsed.robots;
          if (Array.isArray(robots)) {
            setRobotList(
              (robots as Record<string, unknown>[]).map(
                (r) => r.robot_id as string,
              ),
            );
          }
        }

        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Parse error");
      } finally {
        setLoadingState(false);
      }
    };

    return () => {
      subs.forEach((s) => s.unsubscribe());
      context.onRender = undefined;
    };
  }, [context]);

  // Publish updated fleet rules to config_sync
  const publishRules = useCallback(
    (updatedRules: FleetRule[]) => {
      context.publish("/station/config_sync", {
        data: JSON.stringify({
          fleet_rules: updatedRules,
        }),
      });
    },
    [context],
  );

  // Toggle rule enabled/disabled
  const handleToggle = useCallback(
    (ruleId: string) => {
      setRules((prev) => {
        const next = prev.map((r) =>
          r.id === ruleId ? { ...r, enabled: !r.enabled } : r,
        );
        publishRules(next);
        return next;
      });
    },
    [publishRules],
  );

  // Delete rule
  const handleDelete = useCallback(
    (ruleId: string) => {
      setRules((prev) => {
        const next = prev.filter((r) => r.id !== ruleId);
        publishRules(next);
        return next;
      });
    },
    [publishRules],
  );

  // Open add form
  const handleOpenForm = useCallback(() => {
    setFormSource(robotList.length > 0 ? robotList[0] : "");
    setFormTarget(robotList.length > 1 ? robotList[1] : "");
    setFormTopic("");
    setFormMsgType("");
    setFormFreq(10);
    setFormTransport("mqtt_json");
    setShowForm(true);
  }, [robotList]);

  // Cancel add form
  const handleCancelForm = useCallback(() => {
    setShowForm(false);
  }, []);

  // Confirm add rule
  const handleAddRule = useCallback(() => {
    if (!formSource.trim() || !formTarget.trim() || !formTopic.trim()) {
      return;
    }
    const newRule: FleetRule = {
      id: nextRuleId(),
      topic: formTopic.trim(),
      msg_type: formMsgType.trim() || "std_msgs/String",
      source: formSource.trim(),
      target: formTarget.trim(),
      freq_limit: formFreq,
      transport: formTransport as FleetRule["transport"],
      enabled: true,
    };
    setRules((prev) => {
      const next = [...prev, newRule];
      publishRules(next);
      return next;
    });
    setShowForm(false);
  }, [
    formSource,
    formTarget,
    formTopic,
    formMsgType,
    formFreq,
    formTransport,
    publishRules,
  ]);

  const enabledCount = rules.filter((r) => r.enabled).length;

  // ---- Render: Loading ----
  if (loadingState) {
    return (
      <div>
        <div style={header}>
          <span>Fleet Communication</span>
        </div>
        <div style={loading}>加载中...</div>
      </div>
    );
  }

  return (
    <div style={container}>
      {/* Header */}
      <div style={header}>
        <span> Fleet Communication</span>
        <button style={addBtn} onClick={handleOpenForm}>
          添加规则
        </button>
      </div>

      {error && <div style={errorBanner}>{error}</div>}

      {/* Inline add form */}
      {showForm && (
        <div style={formContainer}>
          <div style={formRow}>
            <select
              style={{ ...formSelect, width: 80 }}
              value={formSource}
              onChange={(e) => setFormSource(e.target.value)}
            >
              {robotList.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
              →
            </span>
            <select
              style={{ ...formSelect, width: 80 }}
              value={formTarget}
              onChange={(e) => setFormTarget(e.target.value)}
            >
              {robotList.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <input
              style={{ ...formInput, width: 100 }}
              placeholder="Topic"
              value={formTopic}
              onChange={(e) => setFormTopic(e.target.value)}
            />
            <input
              style={{ ...formInput, width: 120 }}
              placeholder="MsgType"
              value={formMsgType}
              onChange={(e) => setFormMsgType(e.target.value)}
            />
          </div>
          <div style={formRow}>
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              频率:
            </span>
            <input
              style={{ ...formInput, width: 50 }}
              type="number"
              min={0}
              max={1000}
              value={formFreq}
              onChange={(e) =>
                setFormFreq(Math.max(0, parseInt(e.target.value) || 0))
              }
            />
            <span
              style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}
            >
              Hz
            </span>
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                marginLeft: 8,
              }}
            >
              传输:
            </span>
            <select
              style={formSelect}
              value={formTransport}
              onChange={(e) => setFormTransport(e.target.value)}
            >
              <option value="mqtt_json">MQTT JSON</option>
              <option value="mqtt_binary">MQTT Binary</option>
              <option value="http_stream">HTTP Stream</option>
              <option value="auto">Auto</option>
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button style={formCancel} onClick={handleCancelForm}>
                取消
              </button>
              <button style={formBtn} onClick={handleAddRule}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {rules.length === 0 ? (
        <div style={emptyHint}>暂无通信规则，点击「添加规则」创建</div>
      ) : (
        <div style={tableContainer}>
          <div style={thRow}>
            <span style={colSource}>源</span>
            <span style={colArrow} />
            <span style={colTarget}>目标</span>
            <span style={colTopic}>Topic</span>
            <span style={colFreq}>Freq</span>
            <span style={colToggle}>状态</span>
            <span style={colAction} />
          </div>
          {rules.map((rule) => (
            <div key={rule.id} style={row}>
              <span style={colSource}>{rule.source}</span>
              <span style={colArrow}>→</span>
              <span style={colTarget}>{rule.target}</span>
              <span style={colTopic} title={`${rule.topic} (${rule.msg_type})`}>
                {rule.topic}
              </span>
              <span style={colFreq}>{rule.freq_limit > 0 ? `${rule.freq_limit}Hz` : "--"}</span>
              <span style={colToggle}>
                <button
                  style={rule.enabled ? toggleOn : toggleOff}
                  onClick={() => handleToggle(rule.id)}
                  title={rule.enabled ? "禁用" : "启用"}
                >
                  <span
                    style={{
                      ...toggleKnob,
                      left: rule.enabled ? 15 : 1,
                    }}
                  />
                </button>
              </span>
              <span style={colAction}>
                <button
                  style={deleteBtn}
                  onClick={() => handleDelete(rule.id)}
                  title="删除"
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={footer}>
        <span>规则数: {rules.length}</span>
        <span>已启用: {enabledCount}</span>
      </div>
    </div>
  );
}
