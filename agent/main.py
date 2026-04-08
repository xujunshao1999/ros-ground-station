"""
Agent 启动入口

用法：
    # 默认启动 Mock Agent
    python -m agent.main

    # 指定配置文件
    python -m agent.main --config agent/config.yaml

    # 指定机器人 ID
    python -m agent.main --robot-id robot_002

    # 指定 Broker 地址
    python -m agent.main --broker-host 192.168.1.100 --broker-port 1883

    # 使用 ROS 1 Agent（需要 ROS 环境）
    python -m agent.main --agent-type ros1
"""

import argparse
import logging
import sys
import os
from pathlib import Path

import yaml

# 确保项目根目录在 path 中
sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.base_agent import AgentConfig


def load_config(config_path: str) -> dict:
    """加载 YAML 配置文件"""
    path = Path(config_path)
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def build_config(args, yaml_config: dict) -> AgentConfig:
    """构建 Agent 配置

    优先级：命令行参数 > YAML 配置 > 默认值
    """
    return AgentConfig(
        robot_id=args.robot_id or yaml_config.get("robot_id", "robot_001"),
        broker_host=args.broker_host or yaml_config.get("broker_host", "localhost"),
        broker_port=args.broker_port or yaml_config.get("broker_port", 1883),
        status_interval=yaml_config.get("status_interval", 2.0),
        default_freq_limit=yaml_config.get("default_freq_limit", 10.0),
        http_stream_port=yaml_config.get("http_stream_port", 8080),
        auto_reconnect=yaml_config.get("auto_reconnect", True),
        reconnect_delay=yaml_config.get("reconnect_delay", 5.0),
    )


def main():
    parser = argparse.ArgumentParser(description="ROS Ground Station Agent")
    parser.add_argument(
        "--config",
        default="agent/config.yaml",
        help="配置文件路径 (default: agent/config.yaml)",
    )
    parser.add_argument(
        "--robot-id",
        default=None,
        help="机器人 ID (覆盖配置文件)",
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
        "--agent-type",
        choices=["mock", "ros1", "ros2"],
        default="mock",
        help="Agent 类型 (default: mock)",
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
    config = build_config(args, yaml_config)

    logger = logging.getLogger("agent.main")
    logger.info(f"Robot ID: {config.robot_id}")
    logger.info(f"Broker: {config.broker_host}:{config.broker_port}")
    logger.info(f"Agent type: {args.agent_type}")

    # 创建 Agent
    if args.agent_type == "mock":
        from agent.mock_agent import MockAgent

        agent = MockAgent(config)
    elif args.agent_type == "ros1":
        try:
            from agent.ros1_agent import ROS1Agent

            agent = ROS1Agent(config)
        except ImportError:
            logger.error("ROS 1 Agent requires rospy. Use --agent-type mock for development.")
            sys.exit(1)
    elif args.agent_type == "ros2":
        try:
            from agent.ros2_agent import ROS2Agent

            agent = ROS2Agent(config)
        except ImportError:
            logger.error("ROS 2 Agent requires rclpy. Use --agent-type mock for development.")
            sys.exit(1)
    else:
        logger.error(f"Unknown agent type: {args.agent_type}")
        sys.exit(1)

    # 启动
    try:
        agent.start()
    except KeyboardInterrupt:
        logger.info("Interrupted, shutting down...")
        agent.stop()


if __name__ == "__main__":
    main()
