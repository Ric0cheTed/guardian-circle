from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set

router = APIRouter(prefix="/ws", tags=["ws"])

# MVP: in-memory rooms (fine for dev). Later: Redis pubsub.
rooms: Dict[str, Set[WebSocket]] = {}

@router.websocket("/alerts/{alert_id}")
async def ws_alert(alert_id: str, ws: WebSocket):
    await ws.accept()
    rooms.setdefault(alert_id, set()).add(ws)
    try:
        while True:
            msg = await ws.receive_json()
            # Broadcast to all listeners in the room
            for client in list(rooms.get(alert_id, set())):
                if client is not ws:
                    await client.send_json(msg)
    except WebSocketDisconnect:
        rooms.get(alert_id, set()).discard(ws)
