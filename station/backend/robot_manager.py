from __future__ import annotations
"""
机器人管理器

负责：
1. 管理已连接机器人列表（上线、离线、心跳超时检测）
2. 存储各机器人最新状态
3. 指令执行追踪（exec_id 匹配 ack）
4. 话题订阅状态管理
"""

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

from protocol.messages import (
    Message,
    MessageType,
    StatusData,
    CmdAckData,
    EventData,
    DiscoverResponseData,
    TopicResponseData,
)

logger = logging.getLogger(__name__)


@dataclass
class RobotInfo:
    """机器人信息"""

    robot_id: str
    online: bool = True
    last_seen: float = 0.0  # 最后一次收到消息的时间戳

    # 最新状态
    status: Optional[StatusData] = None

    # 发现响应信息
    ros_version: str = ""
    ip: str = ""
    available_topics: list = field(default_factory=list)

    # 已订阅的话题
    subscribed_topics: dict = field(default_factory=dict)  # {ros_topic: {"msg_type": str, ...}}

    # 指令追踪
    pending_commands: dict = field(default_factory=dict)  # {exec_id: {"cmd": CmdData, "sent_at": float}}


class RobotManager:
    """机器人管理器

    用法：
        manager = RobotManager(heartbeat_timeout=30.0)
        manager.start()  # 启动心跳检测线程
        # ... 设置回调后，通过 MQTTHandler 接收消息
    """

    def __init__(self, heartbeat_timeout: float = 30.0):
        """
        Args:
            heartbeat_timeout: 心跳超时时间（秒），超过此时间未收到状态则判定离线
        """
        self._robots: dict[str, RobotInfo] = {}
        self._heartbeat_timeout = heartbeat_timeout
        self._running = False
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

        # 事件回调
        self._on_robot_online = None
        self._on_robot_offline = None

    def set_callbacks(
        self,
        on_robot_online=None,
        on_robot_offline=None,
    ) -> None:
        """设置事件回调

        回调签名：
        - on_robot_online(robot_id: str, info: RobotInfo)
        - on_robot_offline(robot_id: str)
        """
        self._on_robot_online = on_robot_online
        self._on_robot_offline = on_robot_offline

    def start(self) -> None:
        """启动机器人管理器"""
        self._running = True
        self._heartbeat_thread = threading.Thread(
            target=self._heartbeat_check_loop,
            daemon=True,
            name="heartbeat_checker",
        )
        self._heartbeat_thread.start()
        logger.info("[RobotManager] Started")

    def stop(self) -> None:
        """停止机器人管理器"""
        self._running = False
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=3.0)
        logger.info("[RobotManager] Stopped")

    # ============================================================
    # 消息处理（由 MQTTHandler 调用）
    # ============================================================

    def update_status(self, robot_id: str, message: Message) -> None:
        """处理状态上报"""
        with self._lock:
            info = self._get_or_create(robot_id)
            info.last_seen = time.monotonic()

            # 解析状态数据
            data = message.data
            if isinstance(data, dict):
                info.status = StatusData(
                    battery=data.get("battery", 0),
                    position=data.get("position"),
                    velocity=data.get("velocity"),
                    mode=data.get("mode", ""),
                    ros_version=data.get("ros_version", ""),
                    uptime=data.get("uptime", 0),
                    ip=data.get("ip", ""),
                )
            elif isinstance(data, StatusData):
                info.status = data

            if not info.online:
                info.online = True
                logger.info(f"[RobotManager] Robot {robot_id} came online")
                if self._on_robot_online:
                    self._on_robot_online(robot_id, info)

    def handle_cmd_ack(self, robot_id: str, message: Message) -> None:
        """处理指令确认"""
        data = message.data
        exec_id = data.get("exec_id", "") if isinstance(data, dict) else getattr(data, "exec_id", "")
        result = data.get("result", "") if isinstance(data, dict) else getattr(data, "result", "")
        msg = data.get("message", "") if isinstance(data, dict) else getattr(data, "message", "")

        with self._lock:
            info = self._robots.get(robot_id)
            if info and exec_id in info.pending_commands:
                cmd_info = info.pending_commands.pop(exec_id)
                logger.info(
                    f"[RobotManager] Command {exec_id} ack: {result} ({msg})"
                )
            else:
                logger.warning(
                    f"[RobotManager] Unknown command ack: robot={robot_id}, exec_id={exec_id}"
                )

    def handle_event(self, robot_id: str, message: Message) -> None:
        """处理告警/事件"""
        data = message.data
        level = data.get("level", "info") if isinstance(data, dict) else getattr(data, "level", "info")
        code = data.get("code", "") if isinstance(data, dict) else getattr(data, "code", "")
        msg = data.get("message", "") if isinstance(data, dict) else getattr(data, "message", "")

        logger.info(f"[RobotManager] Event from {robot_id}: [{level}] {code}: {msg}")

    def handle_discover_response(self, robot_id: str, message: Message) -> None:
        """处理发现响应"""
        data = message.data
        with self._lock:
            info = self._get_or_create(robot_id)
            info.last_seen = time.monotonic()
            info.online = True

            if isinstance(data, dict):
                info.ros_version = data.get("ros_version", "")
                info.ip = data.get("ip", "")
                info.available_topics = data.get("topics", [])
            elif isinstance(data, DiscoverResponseData):
                info.ros_version = data.ros_version
                info.ip = data.ip
                info.available_topics = data.topics

            logger.info(
                f"[RobotManager] Discovered robot {robot_id}: "
                f"ROS={info.ros_version}, IP={info.ip}, "
                f"topics={len(info.available_topics)}"
            )

            if self._on_robot_online:
                self._on_robot_online(robot_id, info)

    def handle_topic_response(self, robot_id: str, message: Message) -> None:
        """处理话题订阅响应"""
        data = message.data
        if isinstance(data, dict):
            result = data.get("result", "")
        else:
            result = getattr(data, "result", "")

        logger.info(f"[RobotManager] Topic response from {robot_id}: {result}")

    def handle_sensor_data(self, robot_id: str, sensor_name: str, payload: bytes) -> None:
        """处理传感器数据"""
        # 目前仅记录，后续前端渲染时需要
        logger.debug(
            f"[RobotManager] Sensor data from {robot_id}/{sensor_name}: {len(payload)} bytes"
        )

    def track_command(self, robot_id: str, exec_id: str, cmd_data: dict) -> None:
        """追踪已发送的指令"""
        with self._lock:
            info = self._robots.get(robot_id)
            if info:
                info.pending_commands[exec_id] = {
                    "cmd": cmd_data,
                    "sent_at": time.monotonic(),
                }

    # ============================================================
    # 查询接口
    # ============================================================

    def get_robot(self, robot_id: str) -> Optional[RobotInfo]:
        """获取机器人信息"""
        with self._lock:
            return self._robots.get(robot_id)

    def get_all_robots(self) -> dict[str, RobotInfo]:
        """获取所有机器人信息"""
        with self._lock:
            return dict(self._robots)

    def get_online_robots(self) -> dict[str, RobotInfo]:
        """获取在线机器人"""
        with self._lock:
            return {rid: info for rid, info in self._robots.items() if info.online}

    def get_robot_status(self, robot_id: str) -> Optional[dict]:
        """获取机器人状态摘要（适合 API 返回）"""
        with self._lock:
            info = self._robots.get(robot_id)
            if not info or not info.status:
                return None

            status = info.status
            pos = status.position
            vel = status.velocity

            # position 可能是 Position 对象或 dict
            if isinstance(pos, dict):
                px, py, ptheta = pos.get("x", 0), pos.get("y", 0), pos.get("theta", 0)
            elif pos:
                px, py, ptheta = pos.x, pos.y, pos.theta
            else:
                px, py, ptheta = 0, 0, 0

            # velocity 可能是 Velocity 对象或 dict
            if isinstance(vel, dict):
                vlinear, vangular = vel.get("linear", 0), vel.get("angular", 0)
            elif vel:
                vlinear, vangular = vel.linear, vel.angular
            else:
                vlinear, vangular = 0, 0

            return {
                "robot_id": robot_id,
                "online": info.online,
                "battery": status.battery,
                "position": {"x": px, "y": py, "theta": ptheta},
                "velocity": {"linear": vlinear, "angular": vangular},
                "mode": status.mode,
                "ros_version": status.ros_version,
                "uptime": status.uptime,
                "ip": status.ip,
                "available_topics": info.available_topics,
                "subscribed_topics": list(info.subscribed_topics.keys()),
            }

    # ============================================================
    # 内部方法
    # ============================================================

    def _get_or_create(self, robot_id: str) -> RobotInfo:
        """获取或创建机器人信息"""
        if robot_id not in self._robots:
            self._robots[robot_id] = RobotInfo(robot_id=robot_id)
        return self._robots[robot_id]

    def _heartbeat_check_loop(self) -> None:
        """心跳检测循环"""
        while self._running:
            self._check_heartbeats()
            time.sleep(5.0)  # 每 5 秒检查一次

    def _check_heartbeats(self) -> None:
        """检查心跳超时"""
        now = time.monotonic()
        with self._lock:
            for robot_id, info in list(self._robots.items()):
                if info.online and (now - info.last_seen) > self._heartbeat_timeout:
                    info.online = False
                    logger.warning(
                        f"[RobotManager] Robot {robot_id} heartbeat timeout"
                    )
                    if self._on_robot_offline:
                        self._on_robot_offline(robot_id)
