/** Shared types for Foxglove ground station extension panels. */

/** Position in 2D space */
export interface Position {
  x: number;
  y: number;
  theta: number;
}

/** Velocity */
export interface Velocity {
  linear: number;
  angular: number;
}

/** A single robot's status (from /station/robot_list) */
export interface RobotInfo {
  robot_id: string;
  online: boolean;
  battery: number;
  position: Position;
  velocity: Velocity;
  mode: "auto" | "manual" | "stop" | "error";
  ros_version: string;
  ip: string;
  uptime: number;
  available_topics: TopicEntry[];
  subscribed_topics: Record<string, TopicSubscription>;
}

/** A topic entry from agent discovery */
export interface TopicEntry {
  topic: string;
  msg_type: string;
  description?: string;
}

/** Subscription state for a single topic */
export interface TopicSubscription {
  topic: string;
  msg_type: string;
  freq_limit: number;
  transport: "mqtt_json" | "mqtt_binary" | "http_stream" | "auto";
  status: "pending" | "active" | "failed";
}

/** Fleet communication rule */
export interface FleetRule {
  id: string;
  topic: string;
  msg_type: string;
  source: string;
  target: string;
  freq_limit: number;
  transport: "mqtt_json" | "mqtt_binary" | "http_stream" | "auto";
  enabled: boolean;
}

/** Config diff result (for sync dialog) */
export interface ConfigDiff {
  matched: TopicSubscription[];
  conflict: Array<{ local: TopicSubscription; remote: TopicSubscription }>;
  local_only: TopicSubscription[];
  remote_only: TopicSubscription[];
  unavailable: TopicEntry[];
}

/** Event from a robot */
export interface RobotEvent {
  robot_id: string;
  level: "info" | "warning" | "error" | "critical";
  code: string;
  message: string;
  timestamp: number;
}

/** Traffic stat for one topic */
export interface TrafficStat {
  topic: string;
  bytes_per_sec: number;
  msg_count: number;
}

/** Command sent to robot via /cmd/{id}/command */
export interface RobotCommand {
  robot_id: string;
  action: "velocity" | "mode" | "nav_goal" | "custom";
  params: Record<string, unknown>;
}

/** Topic request sent via /station/topic_request */
export interface TopicRequest {
  action: "subscribe" | "unsubscribe";
  topic: string;
  msg_type: string;
  freq_limit?: number;
  transport?: string;
  robot_id: string;
}
