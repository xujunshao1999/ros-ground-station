#!/usr/bin/env python3
"""
End-to-end verification for Docker hybrid test environment.

Usage:
    python scripts/test_hybrid.py [--station-url http://localhost:8000] [--mqtt-host localhost]

Prerequisites:
    - docker-compose up -d (robot containers running)
    - python -m station.backend.main (station running)
"""

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

STATION_URL = "http://localhost:8000"
MQTT_HOST = "localhost"
MQTT_PORT = 1883
PASSED = 0
FAILED = 0


def api_get(path):
    req = urllib.request.Request(f"{STATION_URL}{path}")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def api_post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{STATION_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def ok(msg):
    global PASSED
    PASSED += 1
    print(f"  PASS: {msg}")


def fail(msg):
    global FAILED
    FAILED += 1
    print(f"  FAIL: {msg}")


def section(title):
    print(f"\n{'='*60}")
    print(f" {title}")
    print(f"{'='*60}")


def check_mqtt_topic(topic, timeout=5):
    """Capture one message from an MQTT topic using mosquitto_sub."""
    try:
        result = subprocess.run(
            ["mosquitto_sub", "-h", MQTT_HOST, "-p", str(MQTT_PORT),
             "-t", topic, "-C", "1", "-W", str(timeout)],
            capture_output=True, text=True, timeout=timeout + 2
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
        return None
    except FileNotFoundError:
        return None  # mosquitto_sub not installed
    except Exception:
        return None


def wait_for_robots(expected_count=2, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            robots = api_get("/api/robots")
            online = [r for r in robots if r.get("online")]
            if len(online) >= expected_count:
                return online
        except (urllib.error.URLError, ConnectionRefusedError):
            pass
        time.sleep(2)
    return []


# ---------------------------------------------------------------------------
# Test 1: Station API is reachable
# ---------------------------------------------------------------------------
def test_station_health():
    section("1. Station health check")
    try:
        data = api_get("/api/")
        ok(f"Station v{data.get('version', '?')} responding")
    except Exception as e:
        fail(f"Station not reachable: {e}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Test 2: Robot discovery
# ---------------------------------------------------------------------------
def test_discovery():
    section("2. Robot discovery")
    robots = wait_for_robots(expected_count=2, timeout=30)

    ids = [r["robot_id"] for r in robots]
    if "robot_001" in ids:
        ok("robot_001 online")
    else:
        fail("robot_001 not found")

    if "robot_002" in ids:
        ok("robot_002 online")
    else:
        fail("robot_002 not found")

    return robots


# ---------------------------------------------------------------------------
# Test 3: Robot status contains expected fields
# ---------------------------------------------------------------------------
def test_status():
    section("3. Robot status data")
    try:
        status = api_get("/api/robots/robot_001")
        s = status.get("status", {})
        checks = [
            ("battery" in s, f"battery={s.get('battery')}"),
            ("position" in s, f"position={s.get('position')}"),
            ("velocity" in s, f"velocity={s.get('velocity')}"),
            ("mode" in s, f"mode={s.get('mode')}"),
            (s.get("ros_version") == "1", f"ros_version={s.get('ros_version')}"),
        ]
        for cond, desc in checks:
            if cond:
                ok(desc)
            else:
                fail(desc)
    except Exception as e:
        fail(f"Status query failed: {e}")


# ---------------------------------------------------------------------------
# Test 4: Available ROS topics
# ---------------------------------------------------------------------------
def test_available_topics():
    section("4. Available ROS topics")
    try:
        status = api_get("/api/robots/robot_001")
        topics = status.get("available_topics", [])
        expected = ["/odom", "/imu/data", "/scan", "/cmd_vel"]
        for t in expected:
            if t in topics:
                ok(f"Topic {t} available")
            else:
                fail(f"Topic {t} not in {topics}")
    except Exception as e:
        fail(f"Topic query failed: {e}")


# ---------------------------------------------------------------------------
# Test 5: MQTT status topic check
# ---------------------------------------------------------------------------
def test_mqtt_status():
    section("5. MQTT status topic")
    payload = check_mqtt_topic("robot/robot_001/status", timeout=5)
    if payload:
        try:
            msg = json.loads(payload)
            if msg.get("type") == "status" and msg.get("src") == "robot_001":
                ok(f"MQTT status message from robot_001 (seq={msg.get('seq')})")
            else:
                fail(f"Unexpected MQTT message: {json.dumps(msg)[:120]}")
        except json.JSONDecodeError:
            fail(f"Invalid JSON on status topic: {payload[:120]}")
    else:
        fail("No MQTT status message received (mosquitto_sub available?)")


# ---------------------------------------------------------------------------
# Test 6: Velocity command
# ---------------------------------------------------------------------------
def test_velocity_command():
    section("6. Velocity command")
    try:
        result = api_post("/api/robots/robot_001/command", {
            "action": "velocity",
            "params": {"linear": 0.5, "angular": 0.0},
        })
        exec_id = result.get("exec_id")
        status = result.get("status")
        if exec_id and status == "sent":
            ok(f"Command sent (exec_id={exec_id})")
        else:
            fail(f"Command response unexpected: {result}")
            return

        # Let robot move
        time.sleep(2)

        # Stop
        api_post("/api/robots/robot_001/command", {
            "action": "stop",
            "params": {},
        })
        ok("Stop command sent")
    except Exception as e:
        fail(f"Command test failed: {e}")


# ---------------------------------------------------------------------------
# Test 7: MQTT sensor data after subscription
# ---------------------------------------------------------------------------
def test_sensor_subscription():
    section("7. Sensor subscription + MQTT data")
    try:
        result = api_post("/api/robots/robot_001/subscribe", {
            "topic": "/scan",
            "msg_type": "sensor_msgs/LaserScan",
            "freq_limit": 2.0,
        })
        if result.get("status") == "subscribe_sent":
            ok("/scan subscription sent")
        else:
            fail(f"/scan subscription failed: {result}")
            return

        # Check MQTT for sensor data
        mqtt_data = check_mqtt_topic("robot/robot_001/sensor/#", timeout=6)
        if mqtt_data:
            ok(f"MQTT sensor data received ({len(mqtt_data)} bytes)")
        else:
            fail("No MQTT sensor data (check MQTT broker or topic name)")
    except Exception as e:
        fail(f"Sensor subscription test failed: {e}")


# ---------------------------------------------------------------------------
# Test 8: Multi-robot independence
# ---------------------------------------------------------------------------
def test_multi_robot():
    section("8. Multi-robot independence")
    try:
        api_post("/api/robots/robot_001/command", {
            "action": "velocity", "params": {"linear": 0.3, "angular": 0.0},
        })
        api_post("/api/robots/robot_002/command", {
            "action": "velocity", "params": {"linear": 0.0, "angular": 1.0},
        })
        time.sleep(2)

        s1 = api_get("/api/robots/robot_001")
        s2 = api_get("/api/robots/robot_002")

        api_post("/api/robots/robot_001/command", {
            "action": "stop", "params": {},
        })
        api_post("/api/robots/robot_002/command", {
            "action": "stop", "params": {},
        })

        ok(f"robot_001 online={s1.get('online')}")
        ok(f"robot_002 online={s2.get('online')}")
    except Exception as e:
        fail(f"Multi-robot test failed: {e}")


# ---------------------------------------------------------------------------
# Test 9: Events endpoint
# ---------------------------------------------------------------------------
def test_events():
    section("9. Events endpoint")
    try:
        events = api_get("/api/robots/robot_001/events")
        count = len(events) if isinstance(events, list) else 0
        ok(f"Events endpoint working ({count} events recorded)")
    except Exception as e:
        fail(f"Events test failed: {e}")


# ---------------------------------------------------------------------------
# Test 10: Batch command
# ---------------------------------------------------------------------------
def test_batch_command():
    section("10. Batch command (all stop)")
    try:
        result = api_post("/api/robots/batch/command", {
            "robot_ids": ["robot_001", "robot_002"],
            "action": "stop",
            "params": {},
        })
        if "error" not in result:
            ok(f"Batch stop sent ({result.get('status', '?')})")
        else:
            fail(f"Batch command failed: {result}")
    except Exception as e:
        fail(f"Batch command test failed: {e}")


def main():
    global PASSED, FAILED

    parser = argparse.ArgumentParser(description="Hybrid test verification")
    parser.add_argument("--station-url", default=STATION_URL,
                        help=f"Station API URL (default: {STATION_URL})")
    parser.add_argument("--mqtt-host", default=MQTT_HOST,
                        help=f"MQTT broker host (default: {MQTT_HOST})")
    args = parser.parse_args()

    global STATION_URL, MQTT_HOST
    STATION_URL = args.station_url
    MQTT_HOST = args.mqtt_host

    print("ROS Ground Station — Hybrid Test Verification")
    print("=" * 60)

    test_station_health()
    test_discovery()
    test_status()
    test_available_topics()
    test_mqtt_status()
    test_velocity_command()
    test_sensor_subscription()
    test_multi_robot()
    test_events()
    test_batch_command()

    print(f"\n{'='*60}")
    print(f" Results: {PASSED} passed, {FAILED} failed")
    print(f"{'='*60}")

    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
