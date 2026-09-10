from fastapi import APIRouter, WebSocket
from app.core.websocket_manager import ws_manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Secure WebSocket endpoint with initial in-message authentication.
    No tokens appear in URL query strings or access logs.
    """
    await ws_manager.handle_connection(websocket)
