# ROS Ground Station Project

基于 MQTT 的地面站控制系统，实现一对多机器人管理。

## 项目结构

- `protocol/` — 消息协议定义（无 ROS 依赖）
- `agent/` — 机器人端桥接代理（BaseAgent + MockAgent + ROS Agent）
- `station/` — 地面站（后端 + 前端）
- `broker/` — MQTT Broker 配置
- `docs/` — 文档

## 快速开始

```bash
# 创建虚拟环境
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # Linux

# 安装依赖
pip install -e .

# 启动 Mock Agent（开发测试用）
python -m agent.main --mode mock

# 启动地面站后端
python -m station.backend.main
```

## 开发环境

- Windows + Mock Agent 进行日常开发
- 真实 ROS Agent 在 Linux 环境测试（WSL2 / Docker / 实体机）
