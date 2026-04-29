from __future__ import annotations
"""
地面站后端启动入口

启动流程：
1. 加载配置
2. 创建 MQTTHandler、RobotManager、WsManager
3. 绑定回调（MQTT → RobotManager → WebSocket 推送）
4. 启动 MQTT 连接
5. 启动 FastAPI 服务（含 WebSocket）
"""

import argparse
import asyncio
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
import uvicorn

# 确保项目根目录在 path 中
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from station.backend.mqtt_handler import MQTTHandler
from station.backend.robot_manager import RobotManager
from station.backend.ws_manager import ConnectionManager
from station.backend.database import RecordingDB
from station.backend.recorder import RecordingManager
from station.backend import dependencies
import station.backend.api as api

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 配置 dataclass（带校验）
# ---------------------------------------------------------------------------
@dataclass
class StationConfig:
    """地面站配置"""

    broker_host: str = "localhost"
    broker_port: int = 1883
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    heartbeat_timeout: float = 30.0
    max_sensor_entries: int = 200
    alert_rules: dict = None  # 告警规则配置
    debounce_seconds: int = 300

    # 录制配置
    db_path: str = "data/recording.db"
    auto_record: bool = False
    recording_interval: float = 1.0

    # 可选字段
    mqtt_username: str = ""
    mqtt_password: str = ""

    def __post_init__(self):
        if not self.broker_host:
            raise ValueError("broker_host 不能为空")
        if not (1 <= self.broker_port <= 65535):
            raise ValueError(f"broker_port 必须在 1-65535 之间，当前: {self.broker_port}")
        if not self.api_host:
            raise ValueError("api_host 不能为空")
        if not (1 <= self.api_port <= 65535):
            raise ValueError(f"api_port 必须在 1-65535 之间，当前: {self.api_port}")
        if self.heartbeat_timeout <= 0:
            raise ValueError(f"heartbeat_timeout 必须大于 0，当前: {self.heartbeat_timeout}")
        if self.max_sensor_entries <= 0:
            raise ValueError(f"max_sensor_entries 必须大于 0，当前: {self.max_sensor_entries}")
        if self.alert_rules is None:
            self.alert_rules = {"debounce_seconds": self.debounce_seconds}
        else:
            self.alert_rules.setdefault("debounce_seconds", self.debounce_seconds)

    @classmethod
    def from_yaml(cls, path: str) -> StationConfig:
        """从 YAML 文件加载并校验配置"""
        from pathlib import Path

        p = Path(path)
        if not p.exists():
            logger.warning(f"配置文件不存在: {path}，使用默认值")
            return cls()

        with open(p, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}

        # 检测未知字段（防止拼写错误）
        known_keys = {
            "broker_host", "broker_port", "api_host", "api_port",
            "heartbeat_timeout", "max_sensor_entries",
            "mqtt_username", "mqtt_password",
            "alert_rules",
            "db_path", "auto_record", "recording_interval",
        }
        unknown = set(raw.keys()) - known_keys
        if unknown:
            logger.warning(f"配置文件中存在未识别的字段: {unknown}")

        return cls(
            broker_host=raw.get("broker_host", "localhost"),
            broker_port=raw.get("broker_port", 1883),
            api_host=raw.get("api_host", "0.0.0.0"),
            api_port=raw.get("api_port", 8000),
            heartbeat_timeout=raw.get("heartbeat_timeout", 30.0),
            max_sensor_entries=raw.get("max_sensor_entries", 200),
            mqtt_username=raw.get("mqtt_username", ""),
            mqtt_password=raw.get("mqtt_password", ""),
            alert_rules=raw.get("alert_rules", {}),
            db_path=raw.get("db_path", "data/recording.db"),
            auto_record=raw.get("auto_record", False),
            recording_interval=raw.get("recording_interval", 1.0),
        )


def main():
    parser = argparse.ArgumentParser(description="ROS Ground Station Backend")
    parser.add_argument(
        "--config",
        default="station/backend/config.yaml",
        help="配置文件路径 (default: station/backend/config.yaml)",
    )
    parser.add_argument(
        "--broker-host",
        default=None,
        help="MQTT Broker 地址 (覆盖配置文件)",
    )
    parser.add_argument(
        "--broker-port",
        type=int,
        default=None,
        help="MQTT Broker 端口 (覆盖配置文件)",
    )
    parser.add_argument(
        "--api-port",
        type=int,
        default=None,
        help="API 服务端口 (覆盖配置文件)",
    )
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
        help="日志级别 (default: INFO)",
    )

    args = parser.parse_args()

    # 配置日志
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )

    # 加载并校验配置（优先级：命令行 > 环境变量 > YAML > 默认值）
    cfg = StationConfig.from_yaml(args.config)
    broker_host = args.broker_host or os.environ.get("BROKER_HOST") or cfg.broker_host
    broker_port = args.broker_port or (int(os.environ["BROKER_PORT"]) if os.environ.get("BROKER_PORT") else None) or cfg.broker_port
    api_host = cfg.api_host
    api_port = args.api_port or (int(os.environ["API_PORT"]) if os.environ.get("API_PORT") else None) or cfg.api_port

    logger.info(f"Broker: {broker_host}:{broker_port}")
    logger.info(f"API: {api_host}:{api_port}")
    logger.info(f"Max sensor entries per robot: {cfg.max_sensor_entries}")
    if cfg.alert_rules:
        logger.info(f"Alert rules: enabled ({len(cfg.alert_rules)} rules)")

    # 创建组件
    mqtt_handler = MQTTHandler(broker_host=broker_host, broker_port=broker_port)
    robot_manager = RobotManager(
        heartbeat_timeout=cfg.heartbeat_timeout,
        max_sensor_entries=cfg.max_sensor_entries,
        alert_rules=cfg.alert_rules,
    )
    ws_manager = ConnectionManager()
    recording_db = RecordingDB(db_path=cfg.db_path)
    recorder = RecordingManager(
        db=recording_db,
        recording_interval=cfg.recording_interval,
        auto_record=cfg.auto_record,
    )

    # 注入到依赖管理
    dependencies.init(
        mqtt_handler=mqtt_handler,
        robot_manager=robot_manager,
        ws_manager=ws_manager,
        recorder=recorder,
    )

    # ============================================================
    # 回调链路：MQTT → RobotManager → WebSocket → 前端
    # ============================================================

    # MQTT → RobotManager（消息处理）
    mqtt_handler.set_callbacks(
        on_status=robot_manager.update_status,
        on_cmd_ack=robot_manager.handle_cmd_ack,
        on_event=robot_manager.handle_event,
        on_discover_response=robot_manager.handle_discover_response,
        on_topic_response=robot_manager.handle_topic_response,
        on_sensor_data=robot_manager.handle_sensor_data,
        on_sensor_meta=robot_manager.handle_sensor_meta,
    )

    # RobotManager → WebSocket 推送（事件广播到前端）
    robot_manager.set_callbacks(
        on_robot_online=_on_robot_online,
        on_robot_offline=_on_robot_offline,
        on_status_update=_on_status_update,
        on_event=_on_event,
        on_cmd_ack=_on_cmd_ack,
        on_topic_response=_on_topic_response,
        on_sensor_data=_on_sensor_data,
        on_sensor_meta=_on_sensor_meta,
    )

    # 启动组件
    robot_manager.start()
    mqtt_handler.start()

    # 启动 FastAPI（阻塞）
    try:
        logger.info(f"[Station] Starting API server on {api_host}:{api_port}")
        logger.info(f"[Station] API docs: http://{api_host}:{api_port}/docs")
        logger.info(f"[Station] WebSocket: ws://{api_host}:{api_port}/ws/live")
        uvicorn.run(
            api.app,
            host=api_host,
            port=api_port,
            log_level=args.log_level.lower(),
        )
    except KeyboardInterrupt:
        logger.info("[Station] Interrupted, shutting down...")
    finally:
        mqtt_handler.stop()
        robot_manager.stop()
        logger.info("[Station] Stopped")


# ============================================================
# 回调函数：RobotManager → WebSocket
# ============================================================


def _on_robot_online(robot_id: str, info) -> None:
    """机器人上线 → WebSocket 广播"""
    logger.info(f"[Station] Robot online: {robot_id}")

    # 构造推送数据
    data = {
        "robot_id": robot_id,
        "online": True,
    }
    # 如果有状态信息，一并推送
    from station.backend.api import push_robot_online
    push_robot_online(robot_id, data)


def _on_robot_offline(robot_id: str) -> None:
    """机器人离线 → WebSocket 广播"""
    logger.info(f"[Station] Robot offline: {robot_id}")
    from station.backend.api import push_robot_offline
    push_robot_offline(robot_id)


def _on_status_update(robot_id: str, status: dict) -> None:
    """状态更新 → WebSocket 广播 + 录制"""
    from station.backend.api import push_status_update
    push_status_update(robot_id, status)
    recorder = dependencies.get_recorder()
    if recorder:
        recorder.on_status_update(robot_id, status)


def _on_event(robot_id: str, event: dict) -> None:
    """告警事件 → WebSocket 广播 + 录制"""
    from station.backend.api import push_event
    push_event(robot_id, event)
    recorder = dependencies.get_recorder()
    if recorder:
        recorder.on_event(robot_id, event)


def _on_cmd_ack(robot_id: str, ack: dict) -> None:
    """指令确认 → WebSocket 广播"""
    from station.backend.api import push_cmd_ack
    push_cmd_ack(robot_id, ack)


def _on_topic_response(robot_id: str, data: dict) -> None:
    """话题订阅响应 → WebSocket 广播"""
    from station.backend.api import push_topic_response
    push_topic_response(robot_id, data)


def _on_sensor_data(robot_id: str, sensor_name: str, data: dict) -> None:
    """传感器数据 → WebSocket 广播"""
    from station.backend.api import push_sensor_data
    push_sensor_data(robot_id, sensor_name, data)


def _on_sensor_meta(robot_id: str, meta: dict) -> None:
    """传感器元信息 → WebSocket 广播"""
    from station.backend.api import push_sensor_meta
    push_sensor_meta(robot_id, meta)


if __name__ == "__main__":
    main()
