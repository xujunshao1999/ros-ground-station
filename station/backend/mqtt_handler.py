"""
地面站 MQTT 通信处理器

负责：
1. 连接 MQTT Broker
2. 订阅所有机器人的状态、确认、事件
3. 发送发现请求
4. 发送话题订阅/取消请求
5. 发送控制指令
6. 将收到的消息回调给 RobotManager
"""

import json
import logging
import threading
import time
from typing import Callable, Optional

import paho.mqtt.client as mqtt

from protocol.messages import (
    Message,
    MessageType,
    MessageFactory,
    CmdData,
    TopicRequestData,
    TopicAction,
    DiscoverData,
)
from protocol.topics import (
    robot_status,
    robot_sensor,
    robot_cmd,
    robot_cmd_ack,
    robot_event,
    station_discover,
    station_topic_request,
    station_topic_response,
    all_robot_status,
    all_robot_cmd_ack,
    all_robot_event,
    all_robot_sensor_meta,
)

logger = logging.getLogger(__name__)


class MQTTHandler:
    """地面站 MQTT 通信处理器

    用法：
        handler = MQTTHandler(broker_host="localhost", broker_port=1883)
        handler.set_callbacks(
            on_status=robot_manager.update_status,
            on_cmd_ack=robot_manager.handle_cmd_ack,
            on_event=robot_manager.handle_event,
            on_discover_response=robot_manager.handle_discover_response,
            on_topic_response=robot_manager.handle_topic_response,
            on_sensor_data=robot_manager.handle_sensor_data,
        )
        handler.start()
    """

    def __init__(
        self,
        broker_host: str = "localhost",
        broker_port: int = 1883,
        client_id: str = "ground_station",
        reconnect_delay: float = 5.0,
    ):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self._reconnect_delay = reconnect_delay

        self._client: Optional[mqtt.Client] = None
        self._factory = MessageFactory(src="station")

        # 消息回调
        self._on_status: Optional[Callable] = None
        self._on_cmd_ack: Optional[Callable] = None
        self._on_event: Optional[Callable] = None
        self._on_discover_response: Optional[Callable] = None
        self._on_topic_response: Optional[Callable] = None
        self._on_sensor_data: Optional[Callable] = None
        self._on_sensor_meta: Optional[Callable] = None

        self._running = False
        self._reconnect_thread: Optional[threading.Thread] = None

    def set_callbacks(
        self,
        on_status: Optional[Callable] = None,
        on_cmd_ack: Optional[Callable] = None,
        on_event: Optional[Callable] = None,
        on_discover_response: Optional[Callable] = None,
        on_topic_response: Optional[Callable] = None,
        on_sensor_data: Optional[Callable] = None,
        on_sensor_meta: Optional[Callable] = None,
    ) -> None:
        """设置消息回调函数

        回调签名：
        - on_status(robot_id: str, message: Message)
        - on_cmd_ack(robot_id: str, message: Message)
        - on_event(robot_id: str, message: Message)
        - on_discover_response(robot_id: str, message: Message)
        - on_topic_response(robot_id: str, message: Message)
        - on_sensor_data(robot_id: str, sensor_name: str, payload: bytes)
        - on_sensor_meta(robot_id: str, meta: dict)
        """
        self._on_status = on_status
        self._on_cmd_ack = on_cmd_ack
        self._on_event = on_event
        self._on_discover_response = on_discover_response
        self._on_topic_response = on_topic_response
        self._on_sensor_data = on_sensor_data
        self._on_sensor_meta = on_sensor_meta

    def start(self) -> None:
        """启动 MQTT 客户端"""
        logger.info(f"[MQTTHandler] Connecting to {self.broker_host}:{self.broker_port}...")

        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="ground_station",
        )

        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

        self._client.connect(self.broker_host, self.broker_port)
        self._client.loop_start()
        self._running = True

        logger.info("[MQTTHandler] Started")

    def stop(self) -> None:
        """停止 MQTT 客户端"""
        self._running = False
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()
        logger.info("[MQTTHandler] Stopped")

    # ============================================================
    # 发送操作
    # ============================================================

    def send_discover(self) -> None:
        """发送发现请求（查找在线机器人）"""
        msg = self._factory.discover()
        self._client.publish(station_discover(), msg.to_json().encode("utf-8"), qos=1)
        logger.info("[MQTTHandler] Sent discover request")

    def send_command(self, robot_id: str, cmd: CmdData) -> None:
        """发送控制指令给指定机器人

        Args:
            robot_id: 机器人 ID
            cmd: 指令数据
        """
        msg = self._factory.cmd(cmd, dst=robot_id)
        topic = robot_cmd(robot_id)
        self._client.publish(topic, msg.to_json().encode("utf-8"), qos=1)
        logger.info(f"[MQTTHandler] Sent command to {robot_id}: {cmd.action}")

    def send_topic_subscribe(
        self,
        robot_id: str,
        ros_topic: str,
        msg_type: str,
        freq_limit: float = 10.0,
        options: dict = None,
    ) -> None:
        """请求订阅机器人的话题

        Args:
            robot_id: 机器人 ID
            ros_topic: ROS 话题名
            msg_type: 消息类型
            freq_limit: 频率上限
            options: 压缩/降采样选项
        """
        req = TopicRequestData(
            action=TopicAction.SUBSCRIBE,
            topic=ros_topic,
            msg_type=msg_type,
            freq_limit=freq_limit,
            compression=options or {},
        )
        msg = self._factory.topic_request(req, dst=robot_id)
        self._client.publish(
            station_topic_request(), msg.to_json().encode("utf-8"), qos=1
        )
        logger.info(f"[MQTTHandler] Sent subscribe request: {ros_topic} @ {freq_limit}Hz")

    def send_topic_unsubscribe(self, robot_id: str, ros_topic: str) -> None:
        """取消订阅机器人的话题

        Args:
            robot_id: 机器人 ID
            ros_topic: ROS 话题名
        """
        req = TopicRequestData(
            action=TopicAction.UNSUBSCRIBE,
            topic=ros_topic,
        )
        msg = self._factory.topic_request(req, dst=robot_id)
        self._client.publish(
            station_topic_request(), msg.to_json().encode("utf-8"), qos=1
        )
        logger.info(f"[MQTTHandler] Sent unsubscribe request: {ros_topic}")

    # ============================================================
    # 自动重连
    # ============================================================

    def _start_reconnect(self) -> None:
        """启动自动重连线程"""
        if self._reconnect_thread and self._reconnect_thread.is_alive():
            return  # 已经在重连中
        self._reconnect_thread = threading.Thread(
            target=self._reconnect_loop,
            daemon=True,
            name="mqtt_reconnect",
        )
        self._reconnect_thread.start()

    def _reconnect_loop(self) -> None:
        """自动重连循环"""
        while self._running:
            logger.info(f"[MQTTHandler] Reconnecting in {self._reconnect_delay}s...")
            time.sleep(self._reconnect_delay)
            try:
                if self._client:
                    self._client.reconnect()
                logger.info("[MQTTHandler] Reconnected!")
                return
            except Exception as e:
                logger.error(f"[MQTTHandler] Reconnect failed: {e}")

    # ============================================================
    # MQTT 回调
    # ============================================================

    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        """连接成功回调"""
        rc_val = reason_code if isinstance(reason_code, int) else getattr(reason_code, 'value', 1)
        if rc_val == 0:
            logger.info("[MQTTHandler] Connected to broker")

            # 订阅所有机器人的状态、确认、事件
            client.subscribe(all_robot_status(), qos=1)
            client.subscribe(all_robot_cmd_ack(), qos=1)
            client.subscribe(all_robot_event(), qos=1)
            client.subscribe(all_robot_sensor_meta(), qos=0)

            # 订阅传感器数据通配符
            client.subscribe("robot/+/sensor/#", qos=0)

            # 订阅发现响应和话题请求响应
            client.subscribe("station/topic/response/+", qos=1)

            # 自动发送发现请求
            self.send_discover()
        else:
            logger.error(f"[MQTTHandler] Connection failed: {rc_val}")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties) -> None:
        """断开连接回调"""
        rc_val = reason_code if isinstance(reason_code, int) else getattr(reason_code, 'value', 0)
        if rc_val != 0:
            logger.warning(f"[MQTTHandler] Unexpected disconnect (rc={rc_val}), reconnecting...")
            self._start_reconnect()

    def _on_message(self, client, userdata, msg) -> None:
        """消息回调"""
        topic = msg.topic

        try:
            # 传感器数据可能是二进制
            if topic.startswith("robot/") and "/sensor/" in topic:
                self._handle_sensor_message(topic, msg.payload)
                return

            # 其他消息是 JSON
            payload = msg.payload.decode("utf-8")
            message = Message.from_json(payload)
            self._dispatch_message(topic, message)

        except Exception as e:
            logger.error(f"[MQTTHandler] Error handling message on {topic}: {e}")

    def _dispatch_message(self, topic: str, message: Message) -> None:
        """分发消息到对应回调"""
        msg_type = message.type
        robot_id = message.src

        if msg_type == MessageType.STATUS and self._on_status:
            self._on_status(robot_id, message)

        elif msg_type == MessageType.CMD_ACK and self._on_cmd_ack:
            self._on_cmd_ack(robot_id, message)

        elif msg_type == MessageType.EVENT and self._on_event:
            self._on_event(robot_id, message)

        elif msg_type == MessageType.DISCOVER_RESPONSE and self._on_discover_response:
            self._on_discover_response(robot_id, message)

        elif msg_type == MessageType.TOPIC_RESPONSE and self._on_topic_response:
            self._on_topic_response(robot_id, message)

        else:
            logger.debug(f"[MQTTHandler] Unhandled message type: {msg_type}")

    def _handle_sensor_message(self, topic: str, payload: bytes) -> None:
        """处理传感器数据消息"""
        # 解析 robot/{id}/sensor/{name}[/meta]
        parts = topic.split("/")
        if len(parts) >= 4:
            robot_id = parts[1]
            sensor_name = "/".join(parts[3:])

            # 检测 sensor_meta 消息（topic 以 /meta 结尾）
            if sensor_name.endswith("/meta") and self._on_sensor_meta:
                try:
                    message = Message.from_json(payload.decode("utf-8"))
                    meta_data = message.data
                    if isinstance(meta_data, dict):
                        self._on_sensor_meta(robot_id, meta_data)
                    return
                except Exception as e:
                    logger.error(f"[MQTTHandler] Error parsing sensor meta: {e}")
                    return

            if self._on_sensor_data:
                self._on_sensor_data(robot_id, sensor_name, payload)
