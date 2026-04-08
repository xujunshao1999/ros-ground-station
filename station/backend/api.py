"""
地面站 FastAPI 后端

提供 REST API 和 WebSocket 接口，供前端和外部工具调用。
Phase 1 先实现基础的 REST API，WebSocket 留到 Phase 2。
"""

import logging
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# FastAPI 应用实例
app = FastAPI(
    title="ROS Ground Station API",
    description="地面站控制接口",
    version="0.1.0",
)

# CORS（开发阶段允许所有来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局引用（在 main.py 中注入）
mqtt_handler = None
robot_manager = None


# ============================================================
# Pydantic 请求模型
# ============================================================


class CommandRequest(BaseModel):
    """控制指令请求"""
    action: str  # velocity / mode / stop / return_home / nav_goal / custom
    params: dict = {}


class SubscribeRequest(BaseModel):
    """话题订阅请求"""
    topic: str
    msg_type: str = ""
    freq_limit: float = 10.0
    options: dict = {}


class UnsubscribeRequest(BaseModel):
    """话题取消订阅请求"""
    topic: str


# ============================================================
# REST API
# ============================================================


@app.get("/")
async def root():
    """API 根路径"""
    return {
        "name": "ROS Ground Station API",
        "version": "0.1.0",
        "status": "running",
    }


@app.get("/api/robots")
async def list_robots():
    """获取所有机器人列表"""
    if not robot_manager:
        return {"robots": []}

    robots = robot_manager.get_all_robots()
    result = []
    for rid, info in robots.items():
        status = robot_manager.get_robot_status(rid)
        if status:
            result.append(status)
        else:
            result.append({
                "robot_id": rid,
                "online": info.online,
            })
    return {"robots": result}


@app.get("/api/robots/{robot_id}")
async def get_robot(robot_id: str):
    """获取单个机器人状态"""
    if not robot_manager:
        return {"error": "Robot manager not initialized"}

    status = robot_manager.get_robot_status(robot_id)
    if status:
        return status
    return {"error": f"Robot {robot_id} not found", "online": False}


@app.post("/api/robots/{robot_id}/command")
async def send_command(robot_id: str, req: CommandRequest):
    """发送控制指令

    Body:
        action: velocity / mode / stop / return_home / nav_goal / custom
        params: 指令参数（如 {"linear": 0.5, "angular": 0.1}）
    """
    if not mqtt_handler:
        return {"error": "MQTT handler not initialized"}

    from protocol.messages import CmdData, CmdAction

    # 映射 action 字符串到 CmdAction
    # stop/return_home 映射到 MODE + 对应 params
    action_map = {
        "velocity": CmdAction.VELOCITY,
        "mode": CmdAction.MODE,
        "stop": CmdAction.MODE,          # stop → mode(stop)
        "return_home": CmdAction.NAV_GOAL,  # return_home → nav_goal
        "nav_goal": CmdAction.NAV_GOAL,
        "custom": CmdAction.CUSTOM,
    }

    cmd_action = action_map.get(req.action)
    if not cmd_action:
        return {"error": f"Unknown action: {req.action}"}

    # 对语义化 action 注入默认 params
    cmd_params = dict(req.params)
    if req.action == "stop":
        cmd_params.setdefault("mode", "stop")
    elif req.action == "return_home":
        cmd_params.setdefault("target", "home")

    import uuid
    exec_id = str(uuid.uuid4())[:8]

    cmd = CmdData(
        action=cmd_action,
        params=cmd_params,
        exec_id=exec_id,
    )

    mqtt_handler.send_command(robot_id, cmd)

    # 追踪指令
    if robot_manager:
        robot_manager.track_command(robot_id, exec_id, {"action": req.action, "params": req.params})

    return {"exec_id": exec_id, "action": req.action, "status": "sent"}


@app.post("/api/discover")
async def discover_robots():
    """发送发现请求"""
    if not mqtt_handler:
        return {"error": "MQTT handler not initialized"}

    mqtt_handler.send_discover()
    return {"status": "discover_sent"}


@app.post("/api/robots/{robot_id}/subscribe")
async def subscribe_topic(robot_id: str, req: SubscribeRequest):
    """订阅机器人话题

    Body:
        topic: ROS 话题名
        msg_type: 消息类型
        freq_limit: 频率上限 (Hz)
        options: 压缩/降采样选项
    """
    if not mqtt_handler:
        return {"error": "MQTT handler not initialized"}

    mqtt_handler.send_topic_subscribe(
        robot_id, req.topic, req.msg_type, req.freq_limit, req.options
    )
    return {"status": "subscribe_sent", "topic": req.topic}


@app.post("/api/robots/{robot_id}/unsubscribe")
async def unsubscribe_topic(robot_id: str, req: UnsubscribeRequest):
    """取消订阅机器人话题

    Body:
        topic: ROS 话题名
    """
    if not mqtt_handler:
        return {"error": "MQTT handler not initialized"}

    mqtt_handler.send_topic_unsubscribe(robot_id, req.topic)
    return {"status": "unsubscribe_sent", "topic": req.topic}


# ============================================================
# WebSocket（Phase 2 完整实现，Phase 1 仅框架）
# ============================================================


@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """WebSocket 实时推送通道

    Phase 2 会完整实现：
    - 推送机器人上线/离线事件
    - 推送状态更新
    - 推送告警事件
    - 接收控制指令
    """
    await websocket.accept()
    try:
        while True:
            # Phase 1: 仅保持连接
            data = await websocket.receive_text()
            # 回显（Phase 2 会处理实际逻辑）
            await websocket.send_text(f"echo: {data}")
    except WebSocketDisconnect:
        logger.info("[WS] Client disconnected")
