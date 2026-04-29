# 2026-04-29 工作记录 — Docker 混合测试环境 + Ubuntu 20.04 适配

## 做了什么

### 1. Docker 混合测试环境

替代 `docs/step-1.5b-guide.md` 的两台物理机器手动验证流程，改为单台 Ubuntu + Docker 容器内跑真实 ROS Noetic。

**架构：**
- Station + Mosquitto → Ubuntu 原生运行
- Robot 容器（`ros:noetic-robot` 镜像）→ Docker 运行
- 每个容器内：roscore + ROS1 Agent + sensor_simulator
- 容器通过 `host-gateway`（Docker 网关 IP）连宿主机 Mosquitto

**产出：**
- `docker-compose.yml` — 重写，只留 robot-001/002，移除 mosquitto/station 服务
- `scripts/start_hybrid_test.sh` — 一键启动（Mosquitto + 容器构建 + 连通性检查 + ROS 就绪等待）
- `scripts/stop_hybrid_test.sh` — 一键停止
- `scripts/test_hybrid.py` — 10 项自动化端到端验证
- `docs/docker-hybrid-test.md` — 完整文档（替代 step-1.5b-guide）

**关键设计决策：**
- Mosquitto 用项目 `broker/mosquitto.conf` 启动（`listener 1883` 绑定所有接口），不依赖系统配置
- Robot 容器用 bridge 网络（非 host），避免端口冲突
- `extra_hosts: host-gateway:host-gateway` 使容器能访问宿主机 Mosquitto

### 2. Ubuntu 20.04 兼容性修复

| 修复 | 文件 |
|------|------|
| `X \| None` → `Optional[X]`（8 处） | `protocol/messages.py`, `topic_registry.py`, `topics.py` |
| `uvicorn>=0.24` → `uvicorn[standard]>=0.24` | `pyproject.toml`, `Dockerfile.station` |
| `ruff target-version` py310 → py38 | `pyproject.toml` |
| 移除未使用的 `aiosqlite`, `websockets` | `pyproject.toml`, `Dockerfile.station` |
| `data/` 加入 `.gitignore` | `.gitignore` |

### 3. 项目配置与文档更新

- `CLAUDE.md` — 更新开发环境说明、命令行速查、Python 3.8 规范、文档索引
- `.gitignore` — 新增 `broker/data/`、`broker/logs/`、`data/`
- `project-plan.md` — 已标记 Phase 1-3 完成状态

### 4. 项目文件清理（建议）

- `git_Source/` — 无关内容（awesome-design-md），建议删除
- `ros_ground_station.egg-info/` — pip 自动生成，可删除
- `.pytest_cache/` — 测试缓存，可删除

## 当前项目状态

- Phase 1-3: ✅ 核心功能完成
- Phase 4 (ROS 2): 未开始
- Phase 5 (优化): 未开始
- 测试: 89 个 protocol 层单元测试通过
- 开发环境: 当前 Windows，后续迁移 Ubuntu 20.04

## 移植到新 Ubuntu 后的第一步

```bash
# 1. 安装系统依赖
sudo apt install mosquitto mosquitto-clients python3-pip python3-venv

# 2. 停用系统 mosquitto（用项目配置自己启动）
sudo systemctl stop mosquitto && sudo systemctl disable mosquitto

# 3. 安装 Docker（https://docs.docker.com/engine/install/ubuntu/）

# 4. 安装 Python 依赖
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[station,dev]"

# 5. 运行 Docker 混合测试
./scripts/start_hybrid_test.sh
python -m station.backend.main
python scripts/test_hybrid.py

# 6. 跑单元测试
python -m pytest tests/ -v
```

## 下一步工作

- [ ] 在 Ubuntu 实体机上实际验证整条链路
- [ ] Phase 4: ROS 2 Agent (`agent/ros2_agent.py`)
- [ ] Phase 5: MessagePack / WebRTC / TLS 等优化
