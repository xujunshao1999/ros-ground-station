from __future__ import annotations
"""
录制管理器

挂载到 RobotManager 回调，自动将机器人状态和事件写入 SQLite。
支持 start/stop/pause 控制，recording_interval 采样间隔。
"""

import logging
import threading
import time
from typing import Optional

from station.backend.database import RecordingDB

logger = logging.getLogger(__name__)


class RecordingManager:
    """录制管理器

    通过 on_status_update 和 on_event 回调接收数据并写入数据库。

    Args:
        db: RecordingDB 实例
        recording_interval: 状态采样间隔（秒），默认 1.0，避免数据过于密集
        auto_record: 是否启动时自动开始录制
    """

    def __init__(
        self,
        db: RecordingDB,
        recording_interval: float = 1.0,
        auto_record: bool = False,
    ):
        self._db = db
        self._interval = max(0.1, recording_interval)
        self._state = "off"  # off / recording / paused
        self._lock = threading.Lock()

        # 每个机器人上次写入时间戳，用于采样间隔控制
        self._last_write: dict[str, float] = {}

        self._start_time: float = 0.0
        self._record_count: int = 0

        if auto_record:
            self.start()

    @property
    def state(self) -> str:
        with self._lock:
            return self._state

    @property
    def start_time(self) -> float:
        with self._lock:
            return self._start_time

    @property
    def record_count(self) -> int:
        with self._lock:
            return self._record_count

    @property
    def elapsed(self) -> float:
        """录制已持续秒数"""
        with self._lock:
            if self._state != "recording" or self._start_time == 0:
                return 0.0
            return time.time() - self._start_time

    def start(self) -> None:
        """开始录制"""
        with self._lock:
            if self._state == "recording":
                logger.info("[Recorder] Already recording")
                return
            self._state = "recording"
            self._start_time = time.time()
            self._record_count = 0
            self._last_write.clear()
            logger.info("[Recorder] Recording started")

    def stop(self) -> dict:
        """停止录制"""
        with self._lock:
            old_state = self._state
            self._state = "off"
            elapsed = time.time() - self._start_time if self._start_time > 0 else 0
            count = self._record_count
            self._last_write.clear()
            if old_state == "recording":
                logger.info(f"[Recorder] Recording stopped: {count} records in {elapsed:.1f}s")
            return {"state": old_state, "records": count, "elapsed": elapsed}

    def pause(self) -> None:
        """暂停录制（保留状态，不写入新数据）"""
        with self._lock:
            if self._state == "recording":
                self._state = "paused"
                logger.info("[Recorder] Recording paused")

    def resume(self) -> None:
        """恢复录制"""
        with self._lock:
            if self._state == "paused":
                self._state = "recording"
                self._last_write.clear()
                logger.info("[Recorder] Recording resumed")

    def status(self) -> dict:
        """获取录制状态"""
        with self._lock:
            return {
                "state": self._state,
                "elapsed": round(time.time() - self._start_time, 1) if self._start_time > 0 else 0,
                "records": self._record_count,
            }

    def _should_write(self, robot_id: str) -> bool:
        """检查是否应该写入（采样间隔控制）"""
        now = time.time()
        last = self._last_write.get(robot_id, 0)
        if now - last >= self._interval:
            self._last_write[robot_id] = now
            return True
        return False

    # ============================================================
    # 回调：由 RobotManager 调用
    # ============================================================

    def on_status_update(self, robot_id: str, status: dict) -> None:
        """状态更新回调"""
        with self._lock:
            if self._state != "recording":
                return
            if not self._should_write(robot_id):
                return

        pos = status.get("position", {}) or {}
        vel = status.get("velocity", {}) or {}

        data = {
            "battery": status.get("battery", 0),
            "pos_x": pos.get("x", 0),
            "pos_y": pos.get("y", 0),
            "theta": pos.get("theta", 0),
            "linear_vel": vel.get("linear", 0),
            "angular_vel": vel.get("angular", 0),
            "mode": status.get("mode", ""),
        }

        self._db.write_status(robot_id, time.time(), data)
        with self._lock:
            self._record_count += 1

    def on_event(self, robot_id: str, event: dict) -> None:
        """事件回调"""
        with self._lock:
            if self._state != "recording":
                return

        self._db.write_event(robot_id, event.get("timestamp", time.time()), event)
        with self._lock:
            self._record_count += 1
