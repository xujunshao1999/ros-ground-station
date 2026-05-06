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
interface TopicConfigPanelProps {
  context: PanelExtensionContext;
}

// ---------------------------------------------------------------------------
// Display model
// ---------------------------------------------------------------------------
interface SubEntry {
  topic: string;
  msg_type: string;
  freq_limit: number;
  transport: string;
  status: "pending" | "active" | "failed";
  robot_id: string;
}

interface AvailableTopic {
  topic: string;
  msg_type: string;
}

// ---------------------------------------------------------------------------
// Parsing helper
// ---------------------------------------------------------------------------
function getMessage(
  rs: Record<string, unknown>,
  topic: string,
): Record<string, unknown> | undefined {
  const rawMsgs = (rs as Record<string, unknown>).messages;
  let evts: unknown[] | undefined;
  if (rawMsgs instanceof Map) evts = rawMsgs.get(topic);
  else if (rawMsgs && typeof rawMsgs === "object")
    evts = (rawMsgs as Record<string, unknown>)[topic] as unknown[] | undefined;
  if (!evts || evts.length === 0) return undefined;
  const latest = evts[evts.length - 1] as Record<string, unknown>;
  const rawData = latest.message;
  if (typeof rawData === "string") return JSON.parse(rawData);
  if (
    rawData &&
    typeof (rawData as Record<string, unknown>).data === "string"
  )
    return JSON.parse((rawData as Record<string, unknown>).data as string);
  return rawData as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
const typeAbbrev: Record<string, string> = {
  "nav_msgs/Odometry": "Odometry",
  "sensor_msgs/LaserScan": "LaserScan",
  "sensor_msgs/CompressedImage": "CompImage",
  "sensor_msgs/Imu": "IMU",
  "sensor_msgs/NavSatFix": "GPS",
  "sensor_msgs/PointCloud2": "PointCloud",
  "geometry_msgs/Twist": "Twist",
};

function shortType(msgType: string): string {
  return typeAbbrev[msgType] ?? msgType.split("/").pop() ?? msgType;
}

function freqDisplay(freq: number): string {
  return freq > 0 ? `${freq}Hz` : "--";
}

function statusDotColor(status: string): string {
  if (status === "active") return "#4caf50";
  if (status === "pending") return "#ff9800";
  return "#f44336";
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

const labelRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  fontSize: 12,
  color: "rgba(255,255,255,0.5)",
};

const select: React.CSSProperties = {
  flex: 1,
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontSize: 12,
  outline: "none",
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 6,
  padding: "4px 12px 8px",
  flexWrap: "wrap",
};

const toolBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "inherit",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background 0.15s",
};

const toolBtnDisabled: React.CSSProperties = {
  ...toolBtn,
  opacity: 0.4,
  cursor: "not-allowed",
};

const tableContainer: React.CSSProperties = {
  margin: "0 8px",
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

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "6px 10px",
  fontSize: 12,
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const cellTopic: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontFamily: "monospace",
  fontSize: 11,
};

const cellType: React.CSSProperties = {
  width: 80,
  flexShrink: 0,
  color: "rgba(255,255,255,0.55)",
  fontSize: 11,
};

const cellFreq: React.CSSProperties = {
  width: 48,
  flexShrink: 0,
  textAlign: "right",
  fontFamily: "monospace",
  fontSize: 11,
};

const cellStatus: React.CSSProperties = {
  width: 20,
  flexShrink: 0,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  display: "inline-block",
  flexShrink: 0,
};

const cellAction: React.CSSProperties = {
  width: 36,
  flexShrink: 0,
  textAlign: "center",
};

const deleteBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "rgba(244,67,54,0.7)",
  fontSize: 11,
  cursor: "pointer",
  padding: "2px 4px",
  borderRadius: 3,
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

// --- Dialog overlay styles ---
const dialogOverlay: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: 24,
  zIndex: 100,
};

const dialogBox: React.CSSProperties = {
  background: "#1e1e1e",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  padding: 16,
  width: "90%",
  maxWidth: 340,
  maxHeight: "80%",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const dialogTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  paddingBottom: 8,
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const inputLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.5)",
  marginBottom: 2,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const inputSmall: React.CSSProperties = {
  ...input,
  width: 80,
};

const selectSmall: React.CSSProperties = {
  ...input,
  width: "auto",
  minWidth: 100,
};

const quickList: React.CSSProperties = {
  maxHeight: 120,
  overflowY: "auto",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  background: "rgba(255,255,255,0.03)",
};

const quickItem: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 11,
  cursor: "pointer",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  fontFamily: "monospace",
  transition: "background 0.1s",
};

const dialogBtnRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  paddingTop: 6,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

const cancelBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "rgba(255,255,255,0.6)",
  fontSize: 12,
  cursor: "pointer",
};

const confirmBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 4,
  border: "none",
  background: "#4fc3f7",
  color: "#0d1117",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
};

const noAvailHint: React.CSSProperties = {
  padding: "8px",
  fontSize: 11,
  color: "rgba(255,255,255,0.35)",
  textAlign: "center",
  fontStyle: "italic",
};

const sectionDivider: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: "rgba(255,255,255,0.3)",
  margin: "2px 0",
};

const dividerLine: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: "rgba(255,255,255,0.08)",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TopicConfigPanel({
  context,
}: TopicConfigPanelProps): React.ReactElement {
  // --- State ---
  const [robotIds, setRobotIds] = useState<string[]>([]);
  const [targetRobotId, setTargetRobotId] = useState<string>("");
  const [subscriptions, setSubscriptions] = useState<SubEntry[]>([]);
  const [availableTopics, setAvailableTopics] = useState<AvailableTopic[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Dialog form state ---
  const [dialogTopic, setDialogTopic] = useState("");
  const [dialogMsgType, setDialogMsgType] = useState("");
  const [dialogFreqLimit, setDialogFreqLimit] = useState(10);
  const [dialogTransport, setDialogTransport] =
    useState<string>("auto");

  // --- Refs ---
  const robotIdsRef = useRef<string[]>([]);
  const targetRobotIdRef = useRef<string>("");
  const perRobotSubs = useRef<Map<string, Subscription>>(new Map());
  const discoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Filter subscriptions for the current target robot
  const targetSubs = subscriptions.filter(
    (s) => s.robot_id === targetRobotId,
  );

  // --- Effect 1: Subscribe to data topics + advertise publishers ---
  useEffect(() => {
    const subs: Subscription[] = [
      context.subscribe("/station/selected_robots"),
      context.subscribe("/station/robot_list"),
    ];

    context.advertise("/station/discover", "std_msgs/String");
    context.advertise("/station/topic_request", "std_msgs/String");
    context.advertise("/station/config_sync", "std_msgs/String");

    context.onRender = (rs: Record<string, unknown>) => {
      try {
        // ---- selected robots ----
        const selData = getMessage(rs, "/station/selected_robots");
        if (selData) {
          const ids = selData.robot_ids;
          if (Array.isArray(ids)) {
            const strIds = ids as string[];
            setRobotIds(strIds);
            robotIdsRef.current = strIds;
          }
        }

        // ---- robot list -> available topics for target ----
        const listData = getMessage(rs, "/station/robot_list");
        if (listData) {
          const robots = listData.robots;
          if (Array.isArray(robots)) {
            const targetId = targetRobotIdRef.current;
            if (targetId) {
              const targetInfo = (
                robots as Record<string, unknown>[]
              ).find((r) => r.robot_id === targetId);
              if (targetInfo) {
                const avail = targetInfo.available_topics as
                  | AvailableTopic[]
                  | undefined;
                if (Array.isArray(avail) && avail.length > 0) {
                  setAvailableTopics(avail);
                }
              }
            }
          }
        }

        // ---- topic responses (subscription confirmations) ----
        for (const rid of robotIdsRef.current) {
          const respData = getMessage(rs, `/${rid}/topic_response`);
          if (respData) {
            const topic = respData.topic as string | undefined;
            const result = respData.result as string | undefined;
            if (topic && result) {
              setSubscriptions((prev) =>
                prev.map((sub) =>
                  sub.robot_id === rid && sub.topic === topic
                    ? {
                        ...sub,
                        status:
                          result === "ok" ? "active" : "failed",
                      }
                    : sub,
                ),
              );
            }
          }
        }

        // ---- available topics from discover ----
        for (const rid of robotIdsRef.current) {
          const availData = getMessage(
            rs,
            `/${rid}/available_topics`,
          );
          if (availData) {
            const topics = availData.topics as
              | AvailableTopic[]
              | undefined;
            if (Array.isArray(topics)) {
              setAvailableTopics((prev) => {
                const merged = new Map<
                  string,
                  AvailableTopic
                >();
                for (const t of prev) merged.set(t.topic, t);
                for (const t of topics) merged.set(t.topic, t);
                return Array.from(merged.values());
              });
              setDiscovering(false);
              if (discoverTimer.current) {
                clearTimeout(discoverTimer.current);
                discoverTimer.current = null;
              }
            }
          }
        }
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : "Parse error",
        );
      } finally {
        setLoading(false);
      }
    };

    return () => {
      subs.forEach((s) => s.unsubscribe());
      context.onRender = undefined;
    };
  }, [context]);

  // --- Effect 2: Per-robot subscriptions ---
  useEffect(() => {
    // Unsubscribe previous per-robot subscriptions
    perRobotSubs.current.forEach((sub) => sub.unsubscribe());
    perRobotSubs.current.clear();

    // Subscribe for each known robot
    for (const id of robotIds) {
      const respTopic = `/${id}/topic_response`;
      perRobotSubs.current.set(
        respTopic,
        context.subscribe(respTopic),
      );

      const availTopic = `/${id}/available_topics`;
      perRobotSubs.current.set(
        availTopic,
        context.subscribe(availTopic),
      );
    }

    // Auto-select first robot
    if (robotIds.length > 0 && !robotIds.includes(targetRobotId)) {
      setTargetRobotId(robotIds[0]);
      targetRobotIdRef.current = robotIds[0];
    } else if (robotIds.length === 0) {
      setTargetRobotId("");
      targetRobotIdRef.current = "";
    }

    return () => {
      perRobotSubs.current.forEach((sub) => sub.unsubscribe());
      perRobotSubs.current.clear();
    };
  }, [robotIds, context]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Handlers ---

  const handleTargetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setTargetRobotId(id);
      targetRobotIdRef.current = id;
    },
    [],
  );

  const handleDiscover = useCallback(() => {
    setDiscovering(true);
    context.publish("/station/discover", { data: "{}" });
    if (discoverTimer.current) {
      clearTimeout(discoverTimer.current);
    }
    discoverTimer.current = setTimeout(() => {
      setDiscovering(false);
      discoverTimer.current = null;
    }, 3000);
  }, [context]);

  const handleOpenAddDialog = useCallback(() => {
    // Pre-fill from available topics if we have any
    setDialogTopic("");
    setDialogMsgType("");
    setDialogFreqLimit(10);
    setDialogTransport("auto");
    setShowAddDialog(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setShowAddDialog(false);
  }, []);

  const handleSelectQuickTopic = useCallback(
    (at: AvailableTopic) => {
      setDialogTopic(at.topic);
      setDialogMsgType(at.msg_type);
    },
    [],
  );

  const handleAddTopic = useCallback(() => {
    if (!dialogTopic.trim() || !dialogMsgType.trim()) return;
    if (!targetRobotId) return;

    // Publish subscribe request
    context.publish("/station/topic_request", {
      data: JSON.stringify({
        action: "subscribe",
        topic: dialogTopic.trim(),
        msg_type: dialogMsgType.trim(),
        freq_limit: dialogFreqLimit,
        transport: dialogTransport,
        robot_id: targetRobotId,
      }),
    });

    // Insert pending entry
    setSubscriptions((prev) => [
      ...prev,
      {
        topic: dialogTopic.trim(),
        msg_type: dialogMsgType.trim(),
        freq_limit: dialogFreqLimit,
        transport: dialogTransport,
        status: "pending",
        robot_id: targetRobotId,
      },
    ]);

    setShowAddDialog(false);
  }, [
    dialogTopic,
    dialogMsgType,
    dialogFreqLimit,
    dialogTransport,
    targetRobotId,
    context,
  ]);

  const handleDeleteTopic = useCallback(
    (entry: SubEntry) => {
      // Publish unsubscribe request
      context.publish("/station/topic_request", {
        data: JSON.stringify({
          action: "unsubscribe",
          topic: entry.topic,
          msg_type: entry.msg_type,
          robot_id: entry.robot_id,
        }),
      });

      // Remove from local list
      setSubscriptions((prev) =>
        prev.filter(
          (s) =>
            !(
              s.topic === entry.topic &&
              s.robot_id === entry.robot_id
            ),
        ),
      );
    },
    [context],
  );

  const handleSync = useCallback(() => {
    if (!targetRobotId) return;
    setSyncing(true);

    const targetList = subscriptions.filter(
      (s) => s.robot_id === targetRobotId,
    );

    context.publish("/station/config_sync", {
      data: JSON.stringify({
        robot_id: targetRobotId,
        subscriptions: targetList.map((s) => ({
          topic: s.topic,
          msg_type: s.msg_type,
          freq_limit: s.freq_limit,
          transport: s.transport,
        })),
      }),
    });

    setTimeout(() => {
      setSyncing(false);
    }, 2000);
  }, [targetRobotId, subscriptions, context]);

  // ---- Render: Loading ----
  if (loading) {
    return (
      <div style={header}>
        <span>Topic Config</span>
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          加载中...
        </span>
      </div>
    );
  }

  // ---- Render: No robot selected ----
  if (robotIds.length === 0) {
    return (
      <div>
        <div style={header}>
          <span>Topic Config</span>
        </div>
        <div style={emptyHint}>请先选择机器人</div>
      </div>
    );
  }

  // ---- Render: Normal ----
  const isDiscoverDisabled = discovering || !targetRobotId;
  const isAddDisabled = !targetRobotId;
  const isSyncDisabled = syncing || !targetRobotId || targetSubs.length === 0;

  return (
    <div
      ref={panelRef}
      style={{ ...container, position: "relative" }}
    >
      {/* Header */}
      <div style={header}>
        <span>Topic Config</span>
      </div>

      {/* Target robot dropdown */}
      <div style={labelRow}>
        <span style={{ flexShrink: 0 }}>目标:</span>
        <select
          style={select}
          value={targetRobotId}
          onChange={handleTargetChange}
        >
          {robotIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      {/* Toolbar */}
      <div style={toolbar}>
        <button
          style={isDiscoverDisabled ? toolBtnDisabled : toolBtn}
          disabled={isDiscoverDisabled}
          onClick={handleDiscover}
        >
          {discovering ? "发现中..." : "拉取可用话题"}
        </button>
        <button
          style={isAddDisabled ? toolBtnDisabled : toolBtn}
          disabled={isAddDisabled}
          onClick={handleOpenAddDialog}
        >
          添加话题
        </button>
        <button
          style={isSyncDisabled ? toolBtnDisabled : toolBtn}
          disabled={isSyncDisabled}
          onClick={handleSync}
        >
          {syncing ? "同步中..." : "同步配置"}
        </button>
      </div>

      {/* Error banner */}
      {error && <div style={errorBanner}>{error}</div>}

      {/* Subscription table */}
      {targetSubs.length === 0 ? (
        <div style={emptyHint}>
          未订阅任何话题，点击「添加话题」开始
        </div>
      ) : (
        <div style={tableContainer}>
          {/* Table header */}
          <div style={thRow}>
            <span style={cellTopic}>Topic</span>
            <span style={cellType}>Type</span>
            <span style={cellFreq}>Freq</span>
            <span style={cellStatus} />
            <span style={cellAction} />
          </div>

          {/* Table rows */}
          {targetSubs.map((entry) => (
            <div key={entry.topic} style={row}>
              <span
                style={cellTopic}
                title={`${entry.topic} (${entry.msg_type})`}
              >
                {entry.topic}
              </span>
              <span style={cellType}>
                {shortType(entry.msg_type)}
              </span>
              <span style={cellFreq}>
                {freqDisplay(entry.freq_limit)}
              </span>
              <span style={cellStatus}>
                <span
                  style={{
                    ...dotStyle,
                    background: statusDotColor(entry.status),
                  }}
                  title={entry.status}
                />
              </span>
              <span style={cellAction}>
                <button
                  style={deleteBtn}
                  onClick={() => handleDeleteTopic(entry)}
                  title="删除"
                >
                  删除
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={footer}>
        <span>
          已订阅: {targetSubs.length} 个话题
          {targetSubs.filter((s) => s.status === "pending").length > 0
            ? ` (${targetSubs.filter((s) => s.status === "pending").length} pending)`
            : ""}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
          }}
        >
          {targetRobotId}
        </span>
      </div>

      {/* Add topic dialog */}
      {showAddDialog && (
        <div style={dialogOverlay}>
          <div style={dialogBox}>
            <div style={dialogTitle}>添加话题订阅</div>

            {/* Quick-select: available topics */}
            <div>
              <div style={inputLabel}>选择可用话题</div>
              {availableTopics.length === 0 ? (
                <div style={noAvailHint}>
                  暂无可用话题，请先点击「拉取可用话题」
                </div>
              ) : (
                <div style={quickList}>
                  {availableTopics.map((at) => (
                    <div
                      key={at.topic}
                      style={quickItem}
                      onClick={() => handleSelectQuickTopic(at)}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "rgba(79,195,247,0.12)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "transparent";
                      }}
                    >
                      {at.topic}{" "}
                      <span
                        style={{
                          color: "rgba(255,255,255,0.35)",
                        }}
                      >
                        ({at.msg_type})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={sectionDivider}>
              <span style={dividerLine} />
              <span>或手动输入</span>
              <span style={dividerLine} />
            </div>

            {/* Manual inputs */}
            <div>
              <div style={inputLabel}>话题名称</div>
              <input
                style={input}
                type="text"
                placeholder="/topic_name"
                value={dialogTopic}
                onChange={(e) => setDialogTopic(e.target.value)}
              />
            </div>
            <div>
              <div style={inputLabel}>消息类型</div>
              <input
                style={input}
                type="text"
                placeholder="pkg/MessageType"
                value={dialogMsgType}
                onChange={(e) =>
                  setDialogMsgType(e.target.value)
                }
              />
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-end",
              }}
            >
              <div>
                <div style={inputLabel}>频率限制 (Hz)</div>
                <input
                  style={inputSmall}
                  type="number"
                  min={0}
                  max={1000}
                  value={dialogFreqLimit}
                  onChange={(e) =>
                    setDialogFreqLimit(
                      Math.max(
                        0,
                        parseInt(e.target.value) || 0,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <div style={inputLabel}>传输层</div>
                <select
                  style={selectSmall}
                  value={dialogTransport}
                  onChange={(e) =>
                    setDialogTransport(e.target.value)
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="mqtt_json">JSON</option>
                  <option value="mqtt_binary">Binary</option>
                  <option value="http_stream">HTTP</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={dialogBtnRow}>
              <button
                style={cancelBtn}
                onClick={handleCloseDialog}
              >
                取消
              </button>
              <button
                style={confirmBtn}
                onClick={handleAddTopic}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
