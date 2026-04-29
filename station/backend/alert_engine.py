from __future__ import annotations
"""
告警规则引擎

规则说明：
- 电量低于 阈值（默认 50% 触发 warning，20% 触发 critical）
- 通信超时（机器人离线时自动生成事件）
- 位置超出预设边界

每条规则有防重复机制：同类型告警在 debounce 时间内不再触发。
"""

import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)


class AlertEngine:
    """告警规则引擎"""

    def __init__(self, rules: Optional[dict] = None):
        """
        Args:
            rules: 告警规则配置字典
                {
                    "battery_warning_threshold": 50.0,
                    "battery_critical_threshold": 20.0,
                    "position_x_min": -100, "position_x_max": 100,
                    "position_y_min": -100, "position_y_max": 100,
                    "debounce_seconds": 300,
                }
        """
        self._rules = {
            "battery_warning_threshold": 50.0,
            "battery_critical_threshold": 20.0,
            "position_x_min": -100.0,
            "position_x_max": 100.0,
            "position_y_min": -100.0,
            "position_y_max": 100.0,
            "debounce_seconds": 300,
        }
        if rules:
            self._rules.update(rules)

        # 防重复：{key: last_fired_timestamp}
        self._debounce: dict[str, float] = {}

    def update_rules(self, rules: dict) -> None:
        """动态更新规则"""
        self._rules.update(rules)

    def check_battery(self, robot_id: str, battery: float) -> Optional[dict]:
        """检查电量阈值"""
        critical = self._rules["battery_critical_threshold"]
        warning = self._rules["battery_warning_threshold"]

        if battery <= critical:
            key = f"{robot_id}/battery_critical"
            if self._should_fire(key):
                logger.warning(f"[AlertEngine] {robot_id} battery critical: {battery}%")
                return {
                    "level": "error",
                    "code": "BATTERY_CRITICAL",
                    "message": f"Battery critically low: {battery}%",
                    "details": {"battery": battery},
                }

        elif battery <= warning:
            key = f"{robot_id}/battery_warning"
            if self._should_fire(key):
                logger.info(f"[AlertEngine] {robot_id} battery warning: {battery}%")
                return {
                    "level": "warning",
                    "code": "BATTERY_LOW",
                    "message": f"Battery low: {battery}%",
                    "details": {"battery": battery},
                }

        return None

    def check_offline(self, robot_id: str) -> Optional[dict]:
        """检查机器人离线事件"""
        key = f"{robot_id}/offline"
        if self._should_fire(key):
            logger.warning(f"[AlertEngine] {robot_id} went offline")
            return {
                "level": "error",
                "code": "ROBOT_OFFLINE",
                "message": f"Robot {robot_id} went offline (heartbeat timeout)",
                "details": {},
            }
        return None

    def check_position(self, robot_id: str, position: dict) -> Optional[dict]:
        """检查位置是否超出边界"""
        x = position.get("x", 0)
        y = position.get("y", 0)
        x_min = self._rules["position_x_min"]
        x_max = self._rules["position_x_max"]
        y_min = self._rules["position_y_min"]
        y_max = self._rules["position_y_max"]

        if x < x_min or x > x_max or y < y_min or y > y_max:
            key = f"{robot_id}/position_out_of_bounds"
            if self._should_fire(key):
                logger.warning(f"[AlertEngine] {robot_id} position out of bounds: ({x}, {y})")
                return {
                    "level": "warning",
                    "code": "POSITION_OUT_OF_BOUNDS",
                    "message": f"Position out of bounds: ({x:.2f}, {y:.2f})",
                    "details": {"position": {"x": x, "y": y}},
                }
        return None

    def _should_fire(self, key: str) -> bool:
        """检查是否应该触发（防重复）"""
        now = time.time()
        last = self._debounce.get(key, 0)
        debounce = self._rules["debounce_seconds"]
        if now - last >= debounce:
            self._debounce[key] = now
            return True
        return False
