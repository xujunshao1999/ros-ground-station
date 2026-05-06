import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalize,
  batColor,
  modeColor,
  levelColor,
  relativeTime,
  shortType,
  freqDisplay,
  statusDotColor,
  formatBytes,
  getMessage,
  typeAbbrev,
  type RobotInfo,
} from "./panel-utils";

// ======================================================================
// normalize
// ======================================================================
describe("normalize", () => {
  it("returns default values for empty input", () => {
    const result = normalize({});
    expect(result.robot_id).toBe("unknown");
    expect(result.online).toBe(false);
    expect(result.battery).toBeNull();
    expect(result.mode).toBeNull();
    expect(result.velocity).toBeNull();
    expect(result.subscribedTopicsCount).toBe(0);
  });

  it("extracts robot_id and online flag", () => {
    const result = normalize({ robot_id: "robot_01", online: true });
    expect(result.robot_id).toBe("robot_01");
    expect(result.online).toBe(true);
  });

  it("extracts battery from status as number", () => {
    const result = normalize({ status: { battery: 75 } });
    expect(result.battery).toBe(75);
  });

  it("extracts battery from status as string", () => {
    const result = normalize({ status: { battery: "42.5" } });
    expect(result.battery).toBeCloseTo(42.5);
  });

  it("extracts mode from status", () => {
    const result = normalize({ status: { mode: "manual" } });
    expect(result.mode).toBe("manual");
  });

  it("extracts velocity from status", () => {
    const result = normalize({
      status: { velocity: { linear: 0.5, angular: 0.2 } },
    });
    expect(result.velocity).toEqual({ linear: 0.5, angular: 0.2 });
  });

  it("parses velocity strings", () => {
    const result = normalize({
      status: { velocity: { linear: "1.0", angular: "0.5" } },
    });
    expect(result.velocity).toEqual({ linear: 1.0, angular: 0.5 });
  });

  it("sets velocity to null when missing", () => {
    const result = normalize({ status: {} });
    expect(result.velocity).toBeNull();
  });

  it("counts subscriptions array", () => {
    const result = normalize({
      subscriptions: ["/cmd_vel", "/odom", "/scan"],
    });
    expect(result.subscribedTopicsCount).toBe(3);
  });

  it("returns zero count when subscriptions is not an array", () => {
    const result = normalize({ subscriptions: "not-an-array" });
    expect(result.subscribedTopicsCount).toBe(0);
  });

  it("handles missing status gracefully", () => {
    expect(() => normalize({ robot_id: "r1" })).not.toThrow();
    expect(normalize({ robot_id: "r1" }).robot_id).toBe("r1");
  });
});

// ======================================================================
// batColor
// ======================================================================
describe("batColor", () => {
  it("returns green for battery > 50", () => {
    expect(batColor(100)).toBe("#4caf50");
    expect(batColor(51)).toBe("#4caf50");
  });

  it("returns orange for battery between 21 and 50", () => {
    expect(batColor(50)).toBe("#ff9800");
    expect(batColor(21)).toBe("#ff9800");
  });

  it("returns red for battery <= 20", () => {
    expect(batColor(20)).toBe("#f44336");
    expect(batColor(0)).toBe("#f44336");
  });
});

// ======================================================================
// modeColor
// ======================================================================
describe("modeColor", () => {
  it("returns green for auto", () => expect(modeColor("auto")).toBe("#4caf50"));
  it("returns orange for manual", () => expect(modeColor("manual")).toBe("#ff9800"));
  it("returns red for stop", () => expect(modeColor("stop")).toBe("#f44336"));
  it("returns dark red for error", () => expect(modeColor("error")).toBe("#b71c1c"));
  it("returns grey for unknown mode", () => expect(modeColor("unknown")).toBe("#9e9e9e"));
});

// ======================================================================
// levelColor
// ======================================================================
describe("levelColor", () => {
  it("returns blue for info", () => expect(levelColor("info")).toBe("#2196f3"));
  it("returns orange for warning", () => expect(levelColor("warning")).toBe("#ff9800"));
  it("returns red for error", () => expect(levelColor("error")).toBe("#f44336"));
  it("returns dark red for critical", () => expect(levelColor("critical")).toBe("#b71c1c"));
  it("returns grey for unknown level", () => expect(levelColor("debug")).toBe("#9e9e9e"));
});

// ======================================================================
// relativeTime
// ======================================================================
describe("relativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "0s ago" for future timestamps', () => {
    const future = Date.now() / 1000 + 60;
    expect(relativeTime(future)).toBe("0s ago");
  });

  it("returns seconds ago for deltas under 60s", () => {
    const now = Date.now() / 1000;
    vi.setSystemTime(now * 1000 + 5000); // 5s later
    expect(relativeTime(now)).toBe("5s ago");
  });

  it("returns minutes ago for deltas under 1h", () => {
    const now = Date.now() / 1000;
    vi.setSystemTime(now * 1000 + 120 * 1000); // 2m later
    expect(relativeTime(now)).toBe("2m ago");
  });

  it("returns hours ago for deltas under 24h", () => {
    const now = Date.now() / 1000;
    vi.setSystemTime(now * 1000 + 5 * 3600 * 1000); // 5h later
    expect(relativeTime(now)).toBe("5h ago");
  });

  it("returns days ago for deltas over 24h", () => {
    const now = Date.now() / 1000;
    vi.setSystemTime(now * 1000 + 3 * 86400 * 1000); // 3d later
    expect(relativeTime(now)).toBe("3d ago");
  });
});

// ======================================================================
// shortType (and typeAbbrev)
// ======================================================================
describe("shortType", () => {
  it("uses predefined abbreviations", () => {
    expect(shortType("nav_msgs/Odometry")).toBe("Odometry");
    expect(shortType("sensor_msgs/LaserScan")).toBe("LaserScan");
    expect(shortType("sensor_msgs/Imu")).toBe("IMU");
    expect(shortType("sensor_msgs/NavSatFix")).toBe("GPS");
    expect(shortType("sensor_msgs/PointCloud2")).toBe("PointCloud");
    expect(shortType("geometry_msgs/Twist")).toBe("Twist");
  });

  it("falls back to last path segment for unknown types", () => {
    expect(shortType("my_pkg/CustomMsg")).toBe("CustomMsg");
  });

  it("returns input when there is no slash", () => {
    expect(shortType("String")).toBe("String");
  });

  it("handles empty string", () => {
    expect(shortType("")).toBe("");
  });
});

describe("typeAbbrev", () => {
  it("contains expected entries", () => {
    expect(typeAbbrev["sensor_msgs/CompressedImage"]).toBe("CompImage");
    expect(Object.keys(typeAbbrev).length).toBe(7);
  });
});

// ======================================================================
// freqDisplay
// ======================================================================
describe("freqDisplay", () => {
  it('returns "--" for zero', () => expect(freqDisplay(0)).toBe("--"));
  it('returns "--" for negative', () => expect(freqDisplay(-1)).toBe("--"));
  it("formats positive frequencies", () => {
    expect(freqDisplay(10)).toBe("10Hz");
    expect(freqDisplay(0.5)).toBe("0.5Hz");
    expect(freqDisplay(100)).toBe("100Hz");
  });
});

// ======================================================================
// statusDotColor
// ======================================================================
describe("statusDotColor", () => {
  it("returns green for active", () => expect(statusDotColor("active")).toBe("#4caf50"));
  it("returns orange for pending", () => expect(statusDotColor("pending")).toBe("#ff9800"));
  it("returns red for failed", () => expect(statusDotColor("failed")).toBe("#f44336"));
  it("returns red for unknown status", () => expect(statusDotColor("unknown")).toBe("#f44336"));
});

// ======================================================================
// formatBytes
// ======================================================================
describe("formatBytes", () => {
  it('formats bytes as "B/s"', () => {
    expect(formatBytes(0)).toBe("0 B/s");
    expect(formatBytes(500)).toBe("500 B/s");
  });

  it('formats kilobytes as "KB/s"', () => {
    expect(formatBytes(1024)).toBe("1 KB/s");
    expect(formatBytes(15360)).toBe("15 KB/s");
  });

  it('formats megabytes as "MB/s"', () => {
    expect(formatBytes(1048576)).toBe("1.0 MB/s");
    expect(formatBytes(2097152)).toBe("2.0 MB/s");
  });
});

// ======================================================================
// getMessage
// ======================================================================
describe("getMessage", () => {
  const topic = "/test/topic";

  it("returns undefined when no messages exist", () => {
    expect(getMessage({ messages: {} }, topic)).toBeUndefined();
  });

  it("returns undefined when messages is an empty array", () => {
    expect(getMessage({ messages: { "/test/topic": [] } }, topic)).toBeUndefined();
  });

  it("parses a string message", () => {
    const rs = {
      messages: {
        [topic]: [{ message: '{"key": "value"}' }],
      },
    };
    expect(getMessage(rs, topic)).toEqual({ key: "value" });
  });

  it("parses a message with nested data field", () => {
    const rs = {
      messages: {
        [topic]: [{ message: { data: '{"nested": true}' } }],
      },
    };
    expect(getMessage(rs, topic)).toEqual({ nested: true });
  });

  it("returns raw object when already parsed", () => {
    const rs = {
      messages: {
        [topic]: [{ message: { raw: "data" } }],
      },
    };
    expect(getMessage(rs, topic)).toEqual({ raw: "data" });
  });

  it("handles Map-based messages bag", () => {
    const map = new Map();
    map.set(topic, [{ message: '{"map": true}' }]);
    expect(getMessage({ messages: map }, topic)).toEqual({ map: true });
  });

  it("returns the latest message from an array", () => {
    const rs = {
      messages: {
        [topic]: [
          { message: '{"seq": 1}' },
          { message: '{"seq": 2}' },
          { message: '{"seq": 3}' },
        ],
      },
    };
    expect(getMessage(rs, topic)).toEqual({ seq: 3 });
  });
});
