from __future__ import annotations
"""
地面站 FastAPI 后端

[DEPRECATED] Foxglove 方案实施后，REST API + WebSocket 接口由 Foxglove Studio + ROS topic 替代。
此模块仅保留用于现有 Vue 前端的过渡期。过渡完成后将移除。

提供 REST API 和 WebSocket 接口，供前端和外部工具调用。
Phase 2 Step 2.2: 完整实现 WebSocket 双向通道。
"""

import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Optional
from urllib.request import urlopen, Request

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ============================================================
# Lifespan: 应用启动/关闭时设置 WsManager 的 event loop
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时：设置 WsManager 的 event loop 引用
    ws_mgr = get_ws_manager()
    if ws_mgr:
        import asyncio
        ws_mgr.set_event_loop(asyncio.get_event_loop())
        logger.info("[API] WsManager event loop set")
    yield
    # 关闭时：清理
    logger.info("[API] Shutting down")


# FastAPI 应用实例
app = FastAPI(
    title="ROS Ground Station API",
    description="地面站控制接口",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS（开发阶段允许所有来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from station.backend.dependencies import get_mqtt_handler, get_robot_manager, get_ws_manager, get_recorder


def _broadcast(data: dict) -> None:
    """线程安全的 WebSocket 广播（MQTT 回调线程调用）"""
    ws_mgr = get_ws_manager()
    if ws_mgr:
        ws_mgr.broadcast_sync(data)


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
    ws_mgr = get_ws_manager()
    return {
        "name": "ROS Ground Station API",
        "version": "0.2.0",
        "status": "running",
        "ws_connections": ws_mgr.connection_count if ws_mgr else 0,
    }


@app.get("/api/robots")
async def list_robots():
    """获取所有机器人列表"""
    rm = get_robot_manager()
    if not rm:
        return {"robots": []}

    robots = rm.get_all_robots()
    result = []
    for rid, info in robots.items():
        status = rm.get_robot_status(rid)
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
    rm = get_robot_manager()
    if not rm:
        return {"error": "Robot manager not initialized"}

    status = rm.get_robot_status(robot_id)
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
    mqtt = get_mqtt_handler()
    if not mqtt:
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

    exec_id = str(uuid.uuid4())[:8]

    cmd = CmdData(
        action=cmd_action,
        params=cmd_params,
        exec_id=exec_id,
    )

    mqtt.send_command(robot_id, cmd)

    # 追踪指令
    rm = get_robot_manager()
    if rm:
        rm.track_command(robot_id, exec_id, {"action": req.action, "params": req.params})

    return {"exec_id": exec_id, "action": req.action, "status": "sent"}


class BatchCommandRequest(BaseModel):
    """批量控制指令请求"""
    robot_ids: list[str] = []
    action: str
    params: dict = {}


@app.post("/api/robots/batch/command")
async def batch_command(req: BatchCommandRequest):
    """批量对多个机器人下发指令

    Body:
        robot_ids: 机器人 ID 列表（为空则发给所有在线机器人）
        action: 指令类型
        params: 指令参数
    """
    mqtt = get_mqtt_handler()
    rm = get_robot_manager()
    if not mqtt or not rm:
        return {"error": "Server not initialized"}

    # 确定目标机器人
    robot_ids = req.robot_ids
    if not robot_ids:
        # 发给所有在线机器人
        robot_ids = list(rm.get_online_robots().keys())

    if not robot_ids:
        return {"error": "No robots to command", "results": []}

    from protocol.messages import CmdData, CmdAction

    action_map = {
        "velocity": CmdAction.VELOCITY,
        "mode": CmdAction.MODE,
        "stop": CmdAction.MODE,
        "return_home": CmdAction.NAV_GOAL,
        "nav_goal": CmdAction.NAV_GOAL,
        "custom": CmdAction.CUSTOM,
    }

    cmd_action = action_map.get(req.action)
    if not cmd_action:
        return {"error": f"Unknown action: {req.action}"}

    cmd_params = dict(req.params)
    if req.action == "stop":
        cmd_params.setdefault("mode", "stop")
    elif req.action == "return_home":
        cmd_params.setdefault("target", "home")

    results = []
    for robot_id in robot_ids:
        exec_id = str(uuid.uuid4())[:8]
        cmd = CmdData(action=cmd_action, params=cmd_params, exec_id=exec_id)
        mqtt.send_command(robot_id, cmd)
        rm.track_command(robot_id, exec_id, {"action": req.action, "params": req.params})
        results.append({"robot_id": robot_id, "exec_id": exec_id, "status": "sent"})

    return {"results": results, "count": len(results)}


@app.post("/api/discover")
async def discover_robots():
    """发送发现请求"""
    mqtt = get_mqtt_handler()
    if not mqtt:
        return {"error": "MQTT handler not initialized"}

    mqtt.send_discover()
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
    mqtt = get_mqtt_handler()
    if not mqtt:
        return {"error": "MQTT handler not initialized"}

    mqtt.send_topic_subscribe(
        robot_id, req.topic, req.msg_type, req.freq_limit, req.options
    )
    return {"status": "subscribe_sent", "topic": req.topic}


@app.post("/api/robots/{robot_id}/unsubscribe")
async def unsubscribe_topic(robot_id: str, req: UnsubscribeRequest):
    """取消订阅机器人话题

    Body:
        topic: ROS 话题名
    """
    mqtt = get_mqtt_handler()
    if not mqtt:
        return {"error": "MQTT handler not initialized"}

    mqtt.send_topic_unsubscribe(robot_id, req.topic)
    return {"status": "unsubscribe_sent", "topic": req.topic}


@app.get("/api/robots/{robot_id}/events")
async def get_robot_events(robot_id: str, level: str = "", since: float = 0.0):
    """获取机器人告警/事件列表

    Query:
        level: 按级别过滤（info / warning / error），可选
        since: Unix 时间戳（秒），只返回此时间之后的事件，可选
    """
    rm = get_robot_manager()
    if not rm:
        return {"error": "Robot manager not initialized"}

    info = rm.get_robot(robot_id)
    if not info:
        return {"error": f"Robot {robot_id} not found", "events": []}

    events = info.recent_events
    if level:
        events = [e for e in events if e.get("level") == level]
    if since > 0:
        events = [e for e in events if (e.get("timestamp") or 0) >= since]
    return {"robot_id": robot_id, "events": events}


# ============================================================
# 数据录制
# ============================================================


@app.post("/api/record/start")
async def record_start():
    """开始录制机器人状态数据"""
    recorder = get_recorder()
    if not recorder:
        return {"error": "Recorder not initialized"}
    recorder.start()
    return {"status": "recording_started"}


@app.post("/api/record/stop")
async def record_stop():
    """停止录制"""
    recorder = get_recorder()
    if not recorder:
        return {"error": "Recorder not initialized"}
    result = recorder.stop()
    return {"status": "recording_stopped", **result}


@app.post("/api/record/pause")
async def record_pause():
    """暂停录制"""
    recorder = get_recorder()
    if not recorder:
        return {"error": "Recorder not initialized"}
    recorder.pause()
    return {"status": "recording_paused"}


@app.post("/api/record/resume")
async def record_resume():
    """恢复录制"""
    recorder = get_recorder()
    if not recorder:
        return {"error": "Recorder not initialized"}
    recorder.resume()
    return {"status": "recording_resumed"}


@app.get("/api/record/status")
async def record_status():
    """查询录制状态"""
    recorder = get_recorder()
    if not recorder:
        return {"error": "Recorder not initialized"}
    return {"status": "ok", **recorder.status()}


# ============================================================
# 历史数据查询
# ============================================================


@app.get("/api/history/{robot_id}")
async def get_robot_history(robot_id: str, since: float = 0, until: float = 0, limit: int = 1000):
    """查询机器人状态历史

    Query:
        since: Unix 时间戳，起始时间（可选）
        until: Unix 时间戳，结束时间（可选）
        limit: 最大返回条数，默认 1000
    """
    recorder = get_recorder()
    if not recorder:
        return {"error": "Recorder not initialized"}
    try:
        rows = recorder._db.query_status(robot_id, since=since, until=until, limit=limit)
        return {"robot_id": robot_id, "records": rows, "count": len(rows)}
    except Exception as e:
        return {"error": str(e), "records": []}


@app.get("/api/history/{robot_id}/events")
async def get_robot_history_events(
    robot_id: str, level: str = "", since: float = 0, until: float = 0, limit: int = 200
):
    """查询机器人事件历史"""
    recorder = get_recorder()
    if not recorder:
        return {"error": "Recorder not initialized"}
    try:
        rows = recorder._db.query_events(robot_id, level=level, since=since, until=until, limit=limit)
        return {"robot_id": robot_id, "events": rows, "count": len(rows)}
    except Exception as e:
        return {"error": str(e), "events": []}


@app.get("/api/history/robots")
async def get_history_robot_list():
    """获取有历史数据的机器人列表"""
    recorder = get_recorder()
    if not recorder:
        return {"error": "Recorder not initialized"}
    try:
        robots = recorder._db.get_robot_list()
        return {"robots": robots}
    except Exception as e:
        return {"error": str(e), "robots": []}


# ============================================================
# WebSocket — 双向实时通道
# ============================================================


@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """WebSocket 实时推送通道

    推送（Server → Client）：
        - robot_online:    机器人上线
        - robot_offline:   机器人离线
        - status_update:   状态更新（位置、速度、电量等）
        - event:           告警/异常事件
        - cmd_ack:         指令确认

    接收（Client → Server）：
        - command:         发送控制指令
        - subscribe:       订阅话题
        - unsubscribe:     取消订阅
        - discover:        发现机器人
    """
    ws_mgr = get_ws_manager()
    if not ws_mgr:
        await websocket.close(code=1011, reason="Server not ready")
        return

    await ws_mgr.connect(websocket)

    # 连接成功后，推送当前所有机器人状态（初始化快照）
    rm = get_robot_manager()
    if rm:
        robots = rm.get_all_robots()
        for rid, info in robots.items():
            status = rm.get_robot_status(rid)
            if status:
                await ws_mgr.send_to(websocket, {
                    "type": "status_update",
                    "robot_id": rid,
                    "data": status,
                })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws_mgr.send_to(websocket, {
                    "type": "error",
                    "message": "Invalid JSON",
                })
                continue

            await _handle_ws_message(websocket, msg)

    except WebSocketDisconnect:
        ws_mgr.disconnect(websocket)
        logger.info("[WS] Client disconnected")


async def _handle_ws_message(websocket: WebSocket, msg: dict) -> None:
    """处理来自 WebSocket 客户端的消息"""
    ws_mgr = get_ws_manager()
    if not ws_mgr:
        return

    msg_type = msg.get("type", "")

    if msg_type == "command":
        await _ws_handle_command(websocket, msg)

    elif msg_type == "subscribe":
        await _ws_handle_subscribe(websocket, msg)

    elif msg_type == "unsubscribe":
        await _ws_handle_unsubscribe(websocket, msg)

    elif msg_type == "discover":
        await _ws_handle_discover(websocket, msg)

    elif msg_type == "ping":
        await ws_mgr.send_to(websocket, {"type": "pong"})

    else:
        await ws_mgr.send_to(websocket, {
            "type": "error",
            "message": f"Unknown message type: {msg_type}",
        })


async def _ws_handle_command(websocket: WebSocket, msg: dict) -> None:
    """处理 WebSocket 发来的控制指令"""
    ws_mgr = get_ws_manager()
    if not ws_mgr:
        return

    robot_id = msg.get("robot_id", "")
    action = msg.get("action", "")
    params = msg.get("params", {})

    if not robot_id or not action:
        await ws_mgr.send_to(websocket, {
            "type": "error",
            "message": "Missing robot_id or action",
        })
        return

    # 复用 REST API 逻辑
    result = await send_command(robot_id, CommandRequest(action=action, params=params))
    await ws_mgr.send_to(websocket, {
        "type": "command_sent",
        "robot_id": robot_id,
        "data": result,
    })


async def _ws_handle_subscribe(websocket: WebSocket, msg: dict) -> None:
    """处理 WebSocket 发来的话题订阅请求"""
    ws_mgr = get_ws_manager()
    if not ws_mgr:
        return

    robot_id = msg.get("robot_id", "")
    topic = msg.get("topic", "")
    msg_type = msg.get("msg_type", "")
    freq_limit = msg.get("freq_limit", 10.0)
    options = msg.get("options", {})

    if not robot_id or not topic:
        await ws_mgr.send_to(websocket, {
            "type": "error",
            "message": "Missing robot_id or topic",
        })
        return

    result = await subscribe_topic(robot_id, SubscribeRequest(
        topic=topic, msg_type=msg_type, freq_limit=freq_limit, options=options
    ))
    await ws_mgr.send_to(websocket, {
        "type": "subscribe_sent",
        "robot_id": robot_id,
        "data": result,
    })


async def _ws_handle_unsubscribe(websocket: WebSocket, msg: dict) -> None:
    """处理 WebSocket 发来的取消订阅请求"""
    ws_mgr = get_ws_manager()
    if not ws_mgr:
        return

    robot_id = msg.get("robot_id", "")
    topic = msg.get("topic", "")

    if not robot_id or not topic:
        await ws_mgr.send_to(websocket, {
            "type": "error",
            "message": "Missing robot_id or topic",
        })
        return

    result = await unsubscribe_topic(robot_id, UnsubscribeRequest(topic=topic))
    await ws_mgr.send_to(websocket, {
        "type": "unsubscribe_sent",
        "robot_id": robot_id,
        "data": result,
    })


async def _ws_handle_discover(websocket: WebSocket, msg: dict) -> None:
    """处理 WebSocket 发来的发现请求"""
    ws_mgr = get_ws_manager()
    if not ws_mgr:
        return

    result = await discover_robots()
    await ws_mgr.send_to(websocket, {
        "type": "discover_sent",
        "data": result,
    })


# ============================================================
# WebSocket 推送接口（供 MQTT→WS 联动调用）
# ============================================================


def push_robot_online(robot_id: str, info: dict) -> None:
    """推送机器人上线事件"""
    _broadcast({"type": "robot_online", "robot_id": robot_id, "data": info})


def push_robot_offline(robot_id: str) -> None:
    """推送机器人离线事件"""
    _broadcast({"type": "robot_offline", "robot_id": robot_id})


def push_status_update(robot_id: str, status: dict) -> None:
    """推送机器人状态更新"""
    _broadcast({"type": "status_update", "robot_id": robot_id, "data": status})


def push_event(robot_id: str, event: dict) -> None:
    """推送告警/事件"""
    _broadcast({"type": "event", "robot_id": robot_id, "data": event})


def push_cmd_ack(robot_id: str, ack: dict) -> None:
    """推送指令确认"""
    _broadcast({"type": "cmd_ack", "robot_id": robot_id, "data": ack})


def push_topic_response(robot_id: str, data: dict) -> None:
    """推送话题订阅响应"""
    _broadcast({"type": "topic_response", "robot_id": robot_id, "data": data})


def push_sensor_data(robot_id: str, sensor_name: str, data: dict) -> None:
    """推送传感器数据"""
    _broadcast({
        "type": "sensor_data",
        "robot_id": robot_id,
        "data": {"sensor_name": sensor_name, **data},
    })


def push_sensor_meta(robot_id: str, meta: dict) -> None:
    """推送传感器元信息（重量话题流 URL）"""
    _broadcast({"type": "sensor_meta", "robot_id": robot_id, "data": meta})
