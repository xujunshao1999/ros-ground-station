"""
地面站后端启动入口

启动流程：
1. 加载配置
2. 创建 MQTTHandler 和 RobotManager
3. 绑定回调
4. 启动 MQTT 连接
5. 启动 FastAPI 服务
"""

import argparse
import logging
import sys
from pathlib import Path

import yaml
import uvicorn

# 确保项目根目录在 path 中
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from station.backend.mqtt_handler import MQTTHandler
from station.backend.robot_manager import RobotManager
import station.backend.api as api

logger = logging.getLogger(__name__)


def load_config(config_path: str) -> dict:
    """加载 YAML 配置文件"""
    path = Path(config_path)
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


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

    # 加载配置
    yaml_config = load_config(args.config)
    broker_host = args.broker_host or yaml_config.get("broker_host", "localhost")
    broker_port = args.broker_port or yaml_config.get("broker_port", 1883)
    api_host = yaml_config.get("api_host", "0.0.0.0")
    api_port = args.api_port or yaml_config.get("api_port", 8000)
    heartbeat_timeout = yaml_config.get("heartbeat_timeout", 30.0)

    logger.info(f"Broker: {broker_host}:{broker_port}")
    logger.info(f"API: {api_host}:{api_port}")

    # 创建组件
    mqtt_handler = MQTTHandler(broker_host=broker_host, broker_port=broker_port)
    robot_manager = RobotManager(heartbeat_timeout=heartbeat_timeout)

    # 设置回调
    mqtt_handler.set_callbacks(
        on_status=robot_manager.update_status,
        on_cmd_ack=robot_manager.handle_cmd_ack,
        on_event=robot_manager.handle_event,
        on_discover_response=robot_manager.handle_discover_response,
        on_topic_response=robot_manager.handle_topic_response,
        on_sensor_data=robot_manager.handle_sensor_data,
    )

    # 注入到 API 模块
    api.mqtt_handler = mqtt_handler
    api.robot_manager = robot_manager

    # 启动组件
    robot_manager.start()
    mqtt_handler.start()

    # 启动 FastAPI（阻塞）
    try:
        logger.info(f"[Station] Starting API server on {api_host}:{api_port}")
        logger.info(f"[Station] API docs: http://{api_host}:{api_port}/docs")
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


if __name__ == "__main__":
    main()
