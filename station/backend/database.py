from __future__ import annotations
"""
SQLite 持久化层

管理机器人状态历史数据和事件日志的读写。
使用 WAL 模式支持并发读写，自动建表和定期清理。
"""

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class RecordingDB:
    """SQLite 数据库管理器

    Args:
        db_path: 数据库文件路径，默认 data/recording.db
        max_age_days: 数据保留天数，超过自动清理，默认 7 天
    """

    def __init__(self, db_path: str = "data/recording.db", max_age_days: int = 7):
        self._db_path = db_path
        self._max_age_seconds = max_age_days * 86400
        self._lock = threading.Lock()

        # 确保目录存在
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._create_tables()

    def _create_tables(self) -> None:
        """创建表结构"""
        with self._lock:
            self._conn.executescript("""
                CREATE TABLE IF NOT EXISTS status_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    robot_id TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    battery REAL DEFAULT 0,
                    pos_x REAL DEFAULT 0,
                    pos_y REAL DEFAULT 0,
                    theta REAL DEFAULT 0,
                    linear_vel REAL DEFAULT 0,
                    angular_vel REAL DEFAULT 0,
                    mode TEXT DEFAULT ''
                );

                CREATE INDEX IF NOT EXISTS idx_status_robot_time
                    ON status_history(robot_id, timestamp);

                CREATE TABLE IF NOT EXISTS event_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    robot_id TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    level TEXT NOT NULL,
                    code TEXT DEFAULT '',
                    message TEXT DEFAULT '',
                    details TEXT DEFAULT '{}'
                );

                CREATE INDEX IF NOT EXISTS idx_event_robot_time
                    ON event_log(robot_id, timestamp);
            """)
            self._conn.commit()

    def write_status(self, robot_id: str, ts: float, data: dict) -> None:
        """写入一条状态记录"""
        with self._lock:
            self._conn.execute(
                """INSERT INTO status_history
                   (robot_id, timestamp, battery, pos_x, pos_y, theta, linear_vel, angular_vel, mode)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    robot_id,
                    ts,
                    data.get("battery", 0),
                    data.get("pos_x", 0),
                    data.get("pos_y", 0),
                    data.get("theta", 0),
                    data.get("linear_vel", 0),
                    data.get("angular_vel", 0),
                    data.get("mode", ""),
                ),
            )
            self._conn.commit()

    def write_event(self, robot_id: str, ts: float, event: dict) -> None:
        """写入一条事件记录"""
        with self._lock:
            self._conn.execute(
                """INSERT INTO event_log
                   (robot_id, timestamp, level, code, message, details)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    robot_id,
                    ts,
                    event.get("level", "info"),
                    event.get("code", ""),
                    event.get("message", ""),
                    json.dumps(event.get("details", {})),
                ),
            )
            self._conn.commit()

    def query_status(
        self,
        robot_id: str,
        since: float = 0,
        until: float = 0,
        limit: int = 1000,
    ) -> list[dict]:
        """查询状态历史

        Args:
            robot_id: 机器人 ID
            since: 起始时间戳（含），0 表示不限
            until: 结束时间戳（含），0 表示不限
            limit: 最多返回条数

        Returns:
            [{timestamp, battery, pos_x, pos_y, theta, linear_vel, angular_vel, mode}, ...]
        """
        with self._lock:
            clauses = ["robot_id = ?"]
            params: list = [robot_id]

            if since > 0:
                clauses.append("timestamp >= ?")
                params.append(since)
            if until > 0:
                clauses.append("timestamp <= ?")
                params.append(until)

            query = (
                f"SELECT timestamp, battery, pos_x, pos_y, theta, linear_vel, angular_vel, mode "
                f"FROM status_history WHERE {' AND '.join(clauses)} "
                f"ORDER BY timestamp ASC LIMIT ?"
            )
            params.append(limit)

            rows = self._conn.execute(query, params).fetchall()
            return [
                {
                    "timestamp": row[0],
                    "battery": row[1],
                    "position": {"x": row[2], "y": row[3], "theta": row[4]},
                    "velocity": {"linear": row[5], "angular": row[6]},
                    "mode": row[7],
                }
                for row in rows
            ]

    def query_events(
        self,
        robot_id: str,
        level: str = "",
        since: float = 0,
        until: float = 0,
        limit: int = 200,
    ) -> list[dict]:
        """查询事件日志"""
        with self._lock:
            clauses = ["robot_id = ?"]
            params: list = [robot_id]

            if level:
                clauses.append("level = ?")
                params.append(level)
            if since > 0:
                clauses.append("timestamp >= ?")
                params.append(since)
            if until > 0:
                clauses.append("timestamp <= ?")
                params.append(until)

            query = (
                f"SELECT timestamp, level, code, message, details "
                f"FROM event_log WHERE {' AND '.join(clauses)} "
                f"ORDER BY timestamp DESC LIMIT ?"
            )
            params.append(limit)

            rows = self._conn.execute(query, params).fetchall()
            return [
                {
                    "timestamp": row[0],
                    "level": row[1],
                    "code": row[2],
                    "message": row[3],
                    "details": json.loads(row[4]) if row[4] else {},
                }
                for row in rows
            ]

    def get_robot_list(self) -> list[str]:
        """获取有历史数据的机器人列表"""
        with self._lock:
            rows = self._conn.execute(
                "SELECT DISTINCT robot_id FROM status_history ORDER BY robot_id"
            ).fetchall()
            return [row[0] for row in rows]

    def get_status_count(self, robot_id: str) -> int:
        """获取某个机器人的记录数"""
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) FROM status_history WHERE robot_id = ?",
                (robot_id,),
            ).fetchone()
            return row[0] if row else 0

    def clean_old_data(self) -> int:
        """清理过期数据，返回删除的行数"""
        cutoff = time.time() - self._max_age_seconds
        with self._lock:
            deleted = self._conn.execute(
                "DELETE FROM status_history WHERE timestamp < ?", (cutoff,)
            ).rowcount
            deleted += self._conn.execute(
                "DELETE FROM event_log WHERE timestamp < ?", (cutoff,)
            ).rowcount
            self._conn.commit()
            if deleted > 0:
                logger.info(f"[RecordingDB] Cleaned {deleted} old records")
            return deleted

    def close(self) -> None:
        """关闭数据库连接"""
        self._conn.close()
