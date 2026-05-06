/**
 * Pure utility functions extracted from Foxglove panels for testability.
 * All functions here are deterministic given their inputs (no side effects).
 */

// ---------------------------------------------------------------------------
// RobotListPanel utilities
// ---------------------------------------------------------------------------

/** Display model for a robot in the list panel */
export interface RobotInfo {
  robot_id: string;
  online: boolean;
  battery: number | null;
  mode: string | null;
  velocity: { linear: number; angular: number } | null;
  subscribedTopicsCount: number;
}

/** Normalize raw robot status data into a stable display model */
export function normalize(raw: Record<string, unknown>): RobotInfo {
  const s = (raw.status as Record<string, unknown> | undefined) ?? {};
  const v = s.velocity as Record<string, unknown> | undefined;
  const linear =
    typeof v?.linear === "number"
      ? v.linear
      : typeof v?.linear === "string"
        ? parseFloat(v.linear as string)
        : undefined;
  const angular =
    typeof v?.angular === "number"
      ? v.angular
      : typeof v?.angular === "string"
        ? parseFloat(v.angular as string)
        : undefined;
  return {
    robot_id: (raw.robot_id as string) ?? "unknown",
    online: (raw.online as boolean) ?? false,
    battery:
      typeof s.battery === "number"
        ? s.battery
        : typeof s.battery === "string"
          ? parseFloat(s.battery as string)
          : null,
    mode: typeof s.mode === "string" ? s.mode : null,
    velocity:
      linear !== undefined ? { linear, angular: angular ?? 0 } : null,
    subscribedTopicsCount: Array.isArray(raw.subscriptions)
      ? raw.subscriptions.length
      : 0,
  };
}

/** Color for battery percentage: green > 50, orange > 20, red otherwise */
export function batColor(p: number): string {
  return p > 50 ? "#4caf50" : p > 20 ? "#ff9800" : "#f44336";
}

/** Color for robot mode string */
export function modeColor(m: string): string {
  switch (m) {
    case "auto":
      return "#4caf50";
    case "manual":
      return "#ff9800";
    case "stop":
      return "#f44336";
    case "error":
      return "#b71c1c";
    default:
      return "#9e9e9e";
  }
}

// ---------------------------------------------------------------------------
// EventPanel utilities
// ---------------------------------------------------------------------------

/** Map event level to hex color */
export function levelColor(level: string): string {
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

/** Format a Unix timestamp as a human-readable relative time string */
export function relativeTime(ts: number): string {
  const delta = Date.now() / 1000 - ts;
  if (delta < 0) return "0s ago";
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// TopicConfigPanel utilities
// ---------------------------------------------------------------------------

/** Mapping from full ROS message type to short abbreviation */
export const typeAbbrev: Record<string, string> = {
  "nav_msgs/Odometry": "Odometry",
  "sensor_msgs/LaserScan": "LaserScan",
  "sensor_msgs/CompressedImage": "CompImage",
  "sensor_msgs/Imu": "IMU",
  "sensor_msgs/NavSatFix": "GPS",
  "sensor_msgs/PointCloud2": "PointCloud",
  "geometry_msgs/Twist": "Twist",
};

/** Shorten a ROS message type name for display */
export function shortType(msgType: string): string {
  return typeAbbrev[msgType] ?? msgType.split("/").pop() ?? msgType;
}

/** Format a frequency number for display */
export function freqDisplay(freq: number): string {
  return freq > 0 ? `${freq}Hz` : "--";
}

/** Color for subscription status dot */
export function statusDotColor(status: string): string {
  if (status === "active") return "#4caf50";
  if (status === "pending") return "#ff9800";
  return "#f44336";
}

/**
 * Parse the latest message on a given topic from a Foxglove render-state object.
 * Handles Map and plain-object message bags.
 */
export function getMessage(
  rs: Record<string, unknown>,
  topic: string,
): Record<string, unknown> | undefined {
  const rawMsgs = (rs as Record<string, unknown>).messages;
  let evts: unknown[] | undefined;
  if (rawMsgs instanceof Map) {
    evts = rawMsgs.get(topic);
  } else if (rawMsgs && typeof rawMsgs === "object") {
    evts = (rawMsgs as Record<string, unknown>)[topic] as
      | unknown[]
      | undefined;
  }
  if (!evts || evts.length === 0) return undefined;
  const latest = evts[evts.length - 1] as Record<string, unknown>;
  const rawData = latest.message;
  if (typeof rawData === "string") return JSON.parse(rawData);
  if (rawData && typeof (rawData as Record<string, unknown>).data === "string")
    return JSON.parse((rawData as Record<string, unknown>).data as string);
  return rawData as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// TrafficMonitor utilities
// ---------------------------------------------------------------------------

/** Format a byte count as a human-readable bandwidth string */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB/s`;
  return `${bytes.toFixed(0)} B/s`;
}
