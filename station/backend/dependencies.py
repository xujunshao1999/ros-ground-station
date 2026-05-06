"""应用依赖管理 — 替代模块级全局变量注入

[DEPRECATED] Foxglove 方案实施后，依赖注入不再需要（mqtt_ros_bridge 为单进程模式）。
此模块仅保留用于现有 Vue 前端的过渡期。过渡完成后将移除。

在 main.py 中初始化，API 端点通过 get_* 函数访问组件。
所有依赖通过此模块统一管理，避免跨模块的全局变量赋值。
"""

from __future__ import annotations

from typing import Optional

from station.backend.mqtt_handler import MQTTHandler
from station.backend.robot_manager import RobotManager
from station.backend.ws_manager import ConnectionManager


from station.backend.recorder import RecordingManager


class _AppDependencies:
    """应用级依赖持有者"""

    def __init__(self):
        self.mqtt_handler: Optional[MQTTHandler] = None
        self.robot_manager: Optional[RobotManager] = None
        self.ws_manager: Optional[ConnectionManager] = None
        self.recorder: Optional[RecordingManager] = None


_deps = _AppDependencies()


def init(
    mqtt_handler: Optional[MQTTHandler] = None,
    robot_manager: Optional[RobotManager] = None,
    ws_manager: Optional[ConnectionManager] = None,
    recorder: Optional[RecordingManager] = None,
) -> None:
    """初始化所有依赖（在 main.py 启动时调用）"""
    _deps.mqtt_handler = mqtt_handler
    _deps.robot_manager = robot_manager
    _deps.ws_manager = ws_manager
    _deps.recorder = recorder


def get_mqtt_handler() -> Optional[MQTTHandler]:
    return _deps.mqtt_handler


def get_robot_manager() -> Optional[RobotManager]:
    return _deps.robot_manager


def get_ws_manager() -> Optional[ConnectionManager]:
    return _deps.ws_manager


def get_recorder() -> Optional[RecordingManager]:
    return _deps.recorder
