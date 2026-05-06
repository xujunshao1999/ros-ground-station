import React, { useEffect, useState } from "react";
import { formatBytes } from "../panel-utils";

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
interface TrafficMonitorProps {
  context: PanelExtensionContext;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TrafficStat {
  topic: string;
  bytes_per_sec: number;
  msg_count: number;
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
  fontSize: 15,
  fontWeight: 700,
  padding: "8px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 12,
};

const statRow: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const topicLabel: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "monospace",
  color: "rgba(255,255,255,0.7)",
  fontWeight: 500,
};

const barRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const barTrack: React.CSSProperties = {
  flex: 1,
  height: 10,
  borderRadius: 5,
  background: "rgba(255,255,255,0.06)",
  overflow: "hidden",
};

const barFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 5,
  background: "linear-gradient(90deg, #4fc3f7, #29b6f6)",
  transition: "width 0.3s ease",
};

const statValue: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "monospace",
  color: "rgba(255,255,255,0.5)",
  flexShrink: 0,
  whiteSpace: "nowrap",
  width: 120,
  textAlign: "right",
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
export function TrafficMonitor({
  context,
}: TrafficMonitorProps): React.ReactElement {
  const [stats, setStats] = useState<TrafficStat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState(true);

  // Subscribe + render
  useEffect(() => {
    const sub = context.subscribe("/station/traffic_stats");

    context.onRender = (rs: Record<string, unknown>) => {
      try {
        const rawMsgs = (rs as Record<string, unknown>).messages;
        let evts: unknown[] | undefined;
        if (rawMsgs instanceof Map)
          evts = rawMsgs.get("/station/traffic_stats");
        else if (rawMsgs && typeof rawMsgs === "object")
          evts = (rawMsgs as Record<string, unknown>)[
            "/station/traffic_stats"
          ] as unknown[] | undefined;
        if (!evts || evts.length === 0) return;

        const latest = evts[evts.length - 1] as Record<string, unknown>;
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

        let trafficData: TrafficStat[];
        const topics = parsed.topics;
        if (Array.isArray(topics)) {
          trafficData = (topics as TrafficStat[]).slice();
        } else if (parsed.topic && parsed.bytes_per_sec !== undefined) {
          // Single stat entry
          trafficData = [parsed as unknown as TrafficStat];
        } else {
          return;
        }

        // Sort by bandwidth descending
        trafficData.sort((a, b) => b.bytes_per_sec - a.bytes_per_sec);
        setStats(trafficData);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Parse error");
      } finally {
        setLoadingState(false);
      }
    };

    return () => {
      sub.unsubscribe();
      context.onRender = undefined;
    };
  }, [context]);

  // Compute max bandwidth for bar scaling (minimum 1 to avoid division by 0)
  const maxBytes = stats.length > 0
    ? Math.max(stats[0].bytes_per_sec, 1)
    : 1;

  // ---- Render: Loading ----
  if (loadingState) {
    return (
      <div>
        <div style={header}>Traffic</div>
        <div style={loading}>等待数据...</div>
      </div>
    );
  }

  return (
    <div style={container}>
      <div style={header}>Traffic</div>

      {error && <div style={errorBanner}>{error}</div>}

      {stats.length === 0 ? (
        <div style={emptyHint}>暂无流量数据</div>
      ) : (
        <div style={list}>
          {stats.map((stat, i) => {
            const fraction = stat.bytes_per_sec / maxBytes;
            const percent = Math.max(fraction * 100, 2); // minimum 2% for visibility
            return (
              <div key={stat.topic} style={statRow}>
                <div style={topicLabel}>{stat.topic}</div>
                <div style={barRow}>
                  <div style={barTrack}>
                    <div
                      style={{
                        ...barFill,
                        width: `${percent}%`,
                      }}
                    />
                  </div>
                  <span style={statValue}>
                    {formatBytes(stat.bytes_per_sec)} ({stat.msg_count} msg/s)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
