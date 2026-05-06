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
  onRender?: (rs: Record<string, unknown>) => void;
  panel: { config: Record<string, unknown> };
  theme: { palette: "dark" | "light"; primaryColor: string };
  saveState(s: Record<string, unknown>): void;
}
interface EventPanelProps {
  context: PanelExtensionContext;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RobotEvent {
  robot_id: string;
  level: "info" | "warning" | "error" | "critical";
  code: string;
  message: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function levelColor(level: string): string {
  switch (level) {
    case "info":
      return "#2196f3";
    case "warning":
      return "#ff9800";
    case "error":
      return "#f44336";
    case "critical":
      return "#b71c1c";
    default:
      return "#9e9e9e";
  }
}

function relativeTime(ts: number): string {
  const delta = Date.now() / 1000 - ts;
  if (delta < 0) return "0s ago";
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const container: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  fontSize: 13,
  color: "rgba(255,255,255,0.85)",
};

const header: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  padding: "8px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const list: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: 6,
};

const eventRow: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  borderRadius: 4,
  overflow: "hidden",
  background: "rgba(255,255,255,0.04)",
};

const colorBar: React.CSSProperties = {
  width: 4,
  flexShrink: 0,
};

const eventBody: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "6px 8px",
  flex: 1,
  minWidth: 0,
};

const eventTop: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
};

const robotTag: React.CSSProperties = {
  fontWeight: 600,
  color: "rgba(255,255,255,0.9)",
  fontSize: 11,
  fontFamily: "monospace",
};

const eventMessage: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.75)",
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const eventTime: React.CSSProperties = {
  fontSize: 10,
  color: "rgba(255,255,255,0.35)",
  marginLeft: "auto",
  flexShrink: 0,
};

const emptyHint: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "40px 12px",
  fontSize: 14,
  color: "rgba(255,255,255,0.35)",
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
  padding: "40px 12px",
  fontSize: 14,
  color: "rgba(255,255,255,0.35)",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function EventPanel({ context }: EventPanelProps): React.ReactElement {
  const [events, setEvents] = useState<RobotEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const eventsEndRef = useRef<HTMLDivElement | null>(null);
  const selectedRobots = useRef<string[]>([]);
  const robotSubs = useRef<Map<string, Subscription>>(new Map());

  // Auto-scroll to newest event when new events arrive
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  // Subscribe to selected robots + their event topics
  useEffect(() => {
    const selSub = context.subscribe("/station/selected_robots");

    context.onRender = (rs: Record<string, unknown>) => {
      try {
        const rawMsgs = (rs as Record<string, unknown>).messages;
        let selEvts: unknown[] | undefined;
        if (rawMsgs instanceof Map)
          selEvts = rawMsgs.get("/station/selected_robots");
        else if (rawMsgs && typeof rawMsgs === "object")
          selEvts = (rawMsgs as Record<string, unknown>)[
            "/station/selected_robots"
          ] as unknown[] | undefined;

        // Parse selected robots
        if (selEvts && selEvts.length > 0) {
          const latest = selEvts[selEvts.length - 1] as Record<string, unknown>;
          const rawData = latest.message;
          let parsed: { robot_ids?: string[] };
          if (typeof rawData === "string") parsed = JSON.parse(rawData);
          else if (
            rawData &&
            typeof (rawData as Record<string, unknown>).data === "string"
          )
            parsed = JSON.parse(
              (rawData as Record<string, unknown>).data as string,
            );
          else parsed = rawData as { robot_ids?: string[] };

          const ids: string[] = Array.isArray(parsed?.robot_ids)
            ? (parsed.robot_ids as string[])
            : [];
          const prevIds = selectedRobots.current;

          // Subscribe to new robots, unsubscribe from removed ones
          for (const id of ids) {
            if (!robotSubs.current.has(`/${id}/event`)) {
              const sub = context.subscribe(`/${id}/event`);
              robotSubs.current.set(`/${id}/event`, sub);
            }
          }
          for (const prevId of prevIds) {
            if (!ids.includes(prevId)) {
              const key = `/${prevId}/event`;
              const sub = robotSubs.current.get(key);
              if (sub) {
                sub.unsubscribe();
                robotSubs.current.delete(key);
              }
            }
          }
          selectedRobots.current = ids;
        }

        // Parse events from all subscribed robot event topics
        for (const [topic, _sub] of robotSubs.current) {
          let topicEvts: unknown[] | undefined;
          if (rawMsgs instanceof Map) topicEvts = rawMsgs.get(topic);
          else if (rawMsgs && typeof rawMsgs === "object")
            topicEvts = (rawMsgs as Record<string, unknown>)[
              topic
            ] as unknown[] | undefined;

          if (!topicEvts || topicEvts.length === 0) continue;

          const latest = topicEvts[
            topicEvts.length - 1
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

          // Extract robot_id from topic: /{id}/event
          const robotId = topic.split("/")[1] ?? "unknown";
          const event: RobotEvent = {
            robot_id: (parsed.robot_id as string) ?? robotId,
            level: (parsed.level as RobotEvent["level"]) ?? "info",
            code: (parsed.code as string) ?? "",
            message: (parsed.message as string) ?? "",
            timestamp:
              typeof parsed.timestamp === "number"
                ? parsed.timestamp
                : Date.now() / 1000,
          };

          setEvents((prev) => {
            const next = [event, ...prev];
            // Keep last 200 events to avoid memory bloat
            return next.slice(0, 200);
          });
        }

        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Parse error");
      } finally {
        setLoadingState(false);
      }
    };

    return () => {
      selSub.unsubscribe();
      context.onRender = undefined;
      robotSubs.current.forEach((s) => s.unsubscribe());
      robotSubs.current.clear();
    };
  }, [context]);

  // ---- Render: Loading ----
  if (loadingState) {
    return <div style={loading}>等待数据...</div>;
  }

  return (
    <div style={container}>
      <div style={header}>Events</div>

      {error && <div style={errorBanner}>{error}</div>}

      {events.length === 0 ? (
        <div style={emptyHint}>暂无事件</div>
      ) : (
        <div style={list}>
          {events.map((evt, i) => (
            <div key={`${evt.robot_id}-${evt.timestamp}-${i}`} style={eventRow}>
              <div
                style={{
                  ...colorBar,
                  background: levelColor(evt.level),
                }}
              />
              <div style={eventBody}>
                <div style={eventTop}>
                  <span style={robotTag}>{evt.robot_id}</span>
                  {evt.code && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.35)",
                        fontFamily: "monospace",
                      }}
                    >
                      {evt.code}
                    </span>
                  )}
                  <span style={eventTime}>{relativeTime(evt.timestamp)}</span>
                </div>
                <div style={eventMessage}>{evt.message}</div>
              </div>
            </div>
          ))}
          <div ref={eventsEndRef} />
        </div>
      )}
    </div>
  );
}
