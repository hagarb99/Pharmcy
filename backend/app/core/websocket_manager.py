import asyncio
import json
import logging
import uuid
from typing import Dict, List, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect

from app.core.security import decode_access_token

logger = logging.getLogger("dawatech.websocket")


class ConnectionManager:
    def __init__(self):
        # Map user_id -> Set of active WebSockets (allows multiple tabs/devices per user)
        self.active_user_connections: Dict[uuid.UUID, Set[WebSocket]] = {}
        # Reverse map for fast clean disconnect
        self.socket_to_user: Dict[WebSocket, uuid.UUID] = {}

    async def handle_connection(self, websocket: WebSocket) -> None:
        """
        Accept an incoming WebSocket connection and perform in-message authentication
        so that no access tokens ever appear in URL query parameters or server logs.
        """
        await websocket.accept()
        user_id: Optional[uuid.UUID] = None

        try:
            # Wait for the initial authentication message with a 5-second timeout
            raw_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            data = json.loads(raw_msg)

            if data.get("type") != "authenticate" or not data.get("token"):
                await websocket.send_text(
                    json.dumps({"type": "auth_error", "message": "Missing authentication message."})
                )
                await websocket.close(code=1008)
                return

            token = data["token"]
            payload = decode_access_token(token)
            sub = payload.get("sub")
            if not sub:
                await websocket.send_text(
                    json.dumps({"type": "auth_error", "message": "Invalid token subject."})
                )
                await websocket.close(code=1008)
                return

            user_id = uuid.UUID(sub)

            # Register connection
            if user_id not in self.active_user_connections:
                self.active_user_connections[user_id] = set()
            self.active_user_connections[user_id].add(websocket)
            self.socket_to_user[websocket] = user_id

            # Acknowledge successful authentication
            await websocket.send_text(
                json.dumps({
                    "type": "authenticated",
                    "user_id": str(user_id),
                    "message": "اتصال آمن وموثق بنجاح"
                })
            )
            logger.info(f"WebSocket authenticated for user: {user_id}")

            # Keep connection open and listen for ping/pong or client messages
            while True:
                incoming = await websocket.receive_text()
                try:
                    parsed = json.loads(incoming)
                    if parsed.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                except Exception:
                    pass

        except (asyncio.TimeoutError, json.JSONDecodeError, Exception) as exc:
            logger.debug(f"WebSocket handshake or session ended: {exc}")
        finally:
            self.disconnect(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        user_id = self.socket_to_user.pop(websocket, None)
        if user_id and user_id in self.active_user_connections:
            self.active_user_connections[user_id].discard(websocket)
            if not self.active_user_connections[user_id]:
                del self.active_user_connections[user_id]
        logger.debug(f"WebSocket disconnected for user: {user_id}")

    async def send_to_user(self, user_id: uuid.UUID, event_type: str, data: dict) -> None:
        """Push a real-time event to all active sessions of a specific user."""
        sockets = self.active_user_connections.get(user_id, set()).copy()
        payload = json.dumps({"type": event_type, "data": data})
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.warning(f"Failed to send to user {user_id}: {e}")
                self.disconnect(ws)

    async def broadcast_to_users(
        self, user_ids: List[uuid.UUID], event_type: str, data: dict
    ) -> None:
        """Push a real-time event to a list of specified users."""
        for uid in user_ids:
            await self.send_to_user(uid, event_type, data)


# Global singleton instance
ws_manager = ConnectionManager()
