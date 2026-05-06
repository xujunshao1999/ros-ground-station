from __future__ import annotations
"""
WebSocket 连接管理器

[DEPRECATED] Foxglove 方案实施后，WebSocket 通信由 foxglove_bridge 替代。
此模块仅保留用于现有 Vue 前端的过渡期。过渡完成后将移除。

负责：
1. 管理所有 WebSocket 客户端连接
2. 向所有连接客户端广播消息
3. 向指定客户端推送消息
"""

import asyncio
import json
import logging
import threading
from typing import Optional

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """WebSocket 连接管理器

    用法：
        manager = ConnectionManager()
        # 在 WebSocket 端点中
        await manager.connect(websocket)
        # 广播消息
        await manager.broadcast({"type": "status_update", ...})
    """

    def __init__(self):
        # 活跃连接列表
        self._connections: list[WebSocket] = []
        self._conn_lock: threading.Lock = threading.Lock()
        # 用于跨线程安全调度的 event loop 引用
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """设置 event loop 引用，用于跨线程调度"""
        self._loop = loop

    async def connect(self, websocket: WebSocket) -> None:
        """接受新连接并加入连接池"""
        await websocket.accept()
        with self._conn_lock:
            self._connections.append(websocket)
        logger.info(f"[WSManager] Client connected. Total: {len(self._connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        """移除断开的连接"""
        with self._conn_lock:
            if websocket in self._connections:
                self._connections.remove(websocket)
        logger.info(f"[WSManager] Client disconnected. Total: {len(self._connections)}")

    async def broadcast(self, message: dict) -> None:
        """向所有连接客户端广播消息

        Args:
            message: 要发送的字典，会自动序列化为 JSON
        """
        with self._conn_lock:
            connections = list(self._connections)

        if not connections:
            return

        payload = json.dumps(message, ensure_ascii=False)
        disconnected = []

        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.warning(f"[WSManager] Failed to send to client: {e}")
                disconnected.append(ws)

        # 清理断开的连接
        for ws in disconnected:
            self.disconnect(ws)

    async def send_to(self, websocket: WebSocket, message: dict) -> None:
        """向指定客户端发送消息"""
        payload = json.dumps(message, ensure_ascii=False)
        try:
            await websocket.send_text(payload)
        except Exception as e:
            logger.warning(f"[WSManager] Failed to send to specific client: {e}")
            self.disconnect(websocket)

    def broadcast_sync(self, message: dict) -> None:
        """线程安全的广播方法（从非 async 上下文调用）

        通过 event loop 的 call_soon_threadsafe 调度 async broadcast。
        用于 MQTT 回调线程向 WebSocket 客户端推送。
        """
        if not self._loop or not self._connections:
            return

        async def _do_broadcast():
            await self.broadcast(message)

        self._loop.call_soon_threadsafe(
            lambda: asyncio.ensure_future(_do_broadcast(), loop=self._loop)
        )

    @property
    def connection_count(self) -> int:
        """当前连接数"""
        return len(self._connections)
