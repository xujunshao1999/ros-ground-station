# MEMORY.md - 长期记忆

## 身份
- 我叫 Buddy，用户称呼为"用户"
- 风格：务实直接，不废话

## 项目
- 工作空间：ROS_Project
- 方向：ROS 地面站软件（一对多机器人控制）
- 当前：ROS 1，后续通用化（ROS 2 + 非 ROS）
- 架构：ROS 本地 + MQTT 跨网络 + Web 地面站
- 技术栈：Python Agent / FastAPI 后端 / Vue 3 前端 / Mosquitto Broker
- 用户关注：带宽控制、不使用 rosmaster、ROS 版本解耦

## 项目进度
- Phase 1 基本完成（1.5a Windows 验证通过）
- Step 1.1 ✅ 协议层 + 项目骨架
- Step 1.2 ✅ Mosquitto 2.1.2 已安装 + amqtt 备用 Broker
- Step 1.3 ✅ Agent 框架（BaseAgent/MockAgent/RateLimiter/TopicHandler）
- Step 1.4 ✅ 地面站后端（MQTTHandler/RobotManager/FastAPI API）
- Step 1.5a ✅ 端到端验证（Mock Agent + Mosquitto + 后端 API 全链路通过）
- Step 1.5b 待完成：Linux ROS Agent 验证

## 关键修复记录
- paho-mqtt v2 API：callback_api_version=VERSION2，reason_code 替代 rc
- MessageFactory(src=...) 无 dst 参数，工厂方法传 dataclass 实例
- RobotMode 无 IDLE/RETURNING，用 STOP/AUTO
- CmdAction 无 STOP/RETURN_HOME，用 VELOCITY/MODE/NAV_GOAL/CUSTOM
  - API 层语义映射：stop→MODE(mode=stop), return_home→NAV_GOAL(target=home)
- TopicRequestData 用 compression 不用 options
- StatusData.position 可能是 dict 不是 Position 对象，需要兼容处理
- topics.py 中 station_topic_response() 需要接受 robot_id 参数
- base_agent.py _on_connect else 分支使用了未定义变量 rc → 修复为 reason_code
- base_agent.py _start_status_loop / _store_stream_data 空实现 → 补全默认实现
- Python 3.8 兼容（Noetic）：pyproject.toml requires-python 从 >=3.10 降为 >=3.8
- Python 3.8 兼容：所有 .py 文件添加 from __future__ import annotations

## 用户偏好
- 随和，不纠结称呼
- 喜欢直接给答案，不喜欢铺垫
- 开发环境：Windows，无 ROS
- Phase 2 前端风格参考：`git_Source/awesome-design-md-main/`（58 个 DESIGN.md，Google Stitch 格式）
  - 推荐 Sentry/PostHog/Kraken（数据密集仪表盘）或 Linear/Supabase（开发者工具感）
