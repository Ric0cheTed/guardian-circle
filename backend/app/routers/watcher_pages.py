import json
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.watchers import WatcherAccessError, get_watcher_alert_snapshot

router = APIRouter(tags=["watcher-pages"])

WATCHER_POLL_INTERVAL_MS = 15_000
APP_WATCHER_SCHEME = "mobile://watcher"


def _render_watcher_page(
    watcher_token: str,
    initial_payload: dict[str, object] | None,
    error_message: str | None = None,
    status_code: int = 200,
) -> HTMLResponse:
    encoded_token = quote(watcher_token, safe="")
    initial_json = json.dumps(initial_payload or {})
    escaped_error = escape(error_message or "")
    open_in_app_url = f"{APP_WATCHER_SCHEME}/{encoded_token}"

    content = f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Guardian Circle Watcher</title>
    <style>
      :root {{
        color-scheme: light;
        --bg: #f5f1ed;
        --panel: #fffdfb;
        --ink: #1f2937;
        --muted: #5b6573;
        --danger: #8b1e2d;
        --danger-soft: #fde8eb;
        --safe: #1b5e20;
        --safe-soft: #eef7ef;
        --expired: #8a4b00;
        --expired-soft: #fff3dd;
        --border: #d7d1ca;
        --button: #111827;
      }}

      * {{ box-sizing: border-box; }}

      body {{
        margin: 0;
        font-family: "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top right, rgba(139, 30, 45, 0.12), transparent 28%),
          linear-gradient(180deg, #faf7f4 0%, var(--bg) 100%);
        color: var(--ink);
      }}

      main {{
        width: min(760px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }}

      .hero {{
        display: grid;
        gap: 10px;
        margin-bottom: 20px;
      }}

      .eyebrow {{
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--danger);
        font-weight: 700;
      }}

      h1 {{
        margin: 0;
        font-size: clamp(30px, 5vw, 44px);
        line-height: 1;
      }}

      .lede {{
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }}

      .panel {{
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 22px;
        box-shadow: 0 14px 40px rgba(31, 41, 55, 0.08);
      }}

      .status-card.active {{
        background: linear-gradient(180deg, #271014, #17080a);
        border-color: #b33a4b;
        color: #ffe6e3;
      }}

      .status-card.resolved {{
        background: linear-gradient(180deg, #f3fbf4, #e8f5ea);
        border-color: #8bcf9b;
        color: #1b5e20;
      }}

      .status-card.expired {{
        background: linear-gradient(180deg, #fffaf0, #fff1d8);
        border-color: #e0b15f;
        color: var(--expired);
      }}

      .status-row {{
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }}

      .status-card.resolved .status-row {{
        border-top-color: rgba(27, 94, 32, 0.12);
      }}

      .status-card.expired .status-row {{
        border-top-color: rgba(138, 75, 0, 0.12);
      }}

      .status-row:first-of-type {{
        border-top: 0;
      }}

      .label {{
        opacity: 0.82;
      }}

      .value {{
        text-align: right;
        font-weight: 700;
      }}

      .badge {{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        font-weight: 700;
        font-size: 13px;
      }}

      .status-card.resolved .badge {{
        background: rgba(27, 94, 32, 0.1);
      }}

      .status-card.expired .badge {{
        background: rgba(138, 75, 0, 0.1);
      }}

      .map-card {{
        margin-top: 18px;
        display: grid;
        gap: 12px;
      }}

      .map-card img {{
        width: 100%;
        border-radius: 18px;
        border: 1px solid var(--border);
        display: block;
        background: #f3f4f6;
        min-height: 220px;
        object-fit: cover;
      }}

      .actions {{
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
      }}

      .button {{
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px 16px;
        border-radius: 14px;
        text-decoration: none;
        font-weight: 700;
        border: 1px solid transparent;
      }}

      .button.primary {{
        background: var(--button);
        color: white;
      }}

      .button.secondary {{
        background: transparent;
        color: inherit;
        border-color: currentColor;
      }}

      .helper {{
        margin-top: 18px;
        color: var(--muted);
        line-height: 1.6;
      }}

      .error {{
        background: var(--danger-soft);
        border-color: #d9a4ad;
        color: #7f0000;
      }}

      @media (max-width: 640px) {{
        .status-row {{
          flex-direction: column;
        }}

        .value {{
          text-align: left;
        }}
      }}
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">Guardian Circle</p>
        <h1>Read-only watcher view</h1>
        <p class="lede">
          This link can show the current alert state and the latest location shared in Guardian Circle.
          It cannot edit the alert, contact emergency services, or guarantee service availability.
        </p>
      </section>

      <section id="watcher-root" class="panel {'error' if error_message else ''}">
        <div id="content"></div>
      </section>
    </main>

    <script>
      const initialAlert = {initial_json};
      const initialError = {json.dumps(error_message)};
      const watcherToken = {json.dumps(watcher_token)};
      const apiPath = "/alerts/watcher/" + encodeURIComponent(watcherToken);
      const appPath = {json.dumps(open_in_app_url)};
      const pollIntervalMs = {WATCHER_POLL_INTERVAL_MS};

      const root = document.getElementById("watcher-root");
      const content = document.getElementById("content");

      function formatDateTime(timestamp) {{
        if (!timestamp) {{
          return "Unavailable";
        }}

        try {{
          return new Intl.DateTimeFormat(undefined, {{
            dateStyle: "medium",
            timeStyle: "medium",
          }}).format(new Date(timestamp));
        }} catch {{
          return timestamp;
        }}
      }}

      function formatCoordinates(lat, lng) {{
        if (lat == null || lng == null) {{
          return "Location has not been shared yet";
        }}

        return Number(lat).toFixed(5) + ", " + Number(lng).toFixed(5);
      }}

      function getStateLabel(alert) {{
        if (!alert) {{
          return "Unavailable";
        }}

        if (alert.is_active) {{
          return "Active";
        }}

        if (alert.status === "resolved") {{
          return "Safe";
        }}

        return alert.status.charAt(0).toUpperCase() + alert.status.slice(1);
      }}

      function getStateClass(alert) {{
        if (!alert || alert.is_active) {{
          return "active";
        }}

        if (alert.status === "resolved") {{
          return "resolved";
        }}

        return "expired";
      }}

      function getStateDescription(alert) {{
        if (!alert) {{
          return "This alert is unavailable.";
        }}

        if (alert.is_active) {{
          return "This alert is active. Use the latest shared location to support the person and contact emergency services if needed.";
        }}

        if (alert.status === "resolved") {{
          return "This alert is no longer active. The user has marked themselves safe.";
        }}

        if (alert.status === "expired") {{
          return "This alert is no longer active. Guardian Circle closed it automatically after inactivity.";
        }}

        return "This alert is no longer active.";
      }}

      function getMapsUrl(alert) {{
        if (!alert || alert.last_lat == null || alert.last_lng == null) {{
          return "";
        }}

        return "https://www.google.com/maps/search/?api=1&query=" + alert.last_lat + "," + alert.last_lng;
      }}

      function getMapImageUrl(alert) {{
        if (!alert || alert.last_lat == null || alert.last_lng == null) {{
          return "";
        }}

        return "https://staticmap.openstreetmap.de/staticmap.php?center="
          + alert.last_lat + "," + alert.last_lng
          + "&zoom=15&size=900x420&markers="
          + alert.last_lat + "," + alert.last_lng + ",red-pushpin";
      }}

      function renderError(message) {{
        root.className = "panel error";
        content.innerHTML = `
          <h2 style="margin-top: 0;">Watcher unavailable</h2>
          <p style="line-height: 1.6;">${{message}}</p>
          <p style="line-height: 1.6;">
            This link may be invalid, expired, or the alert may no longer be available.
          </p>
        `;
      }}

      function renderAlert(alert) {{
        const stateLabel = getStateLabel(alert);
        const stateClass = getStateClass(alert);
        const mapsUrl = getMapsUrl(alert);
        const mapImageUrl = getMapImageUrl(alert);
        const mapHtml = mapImageUrl
          ? `
              <div class="map-card">
                <img src="${{mapImageUrl}}" alt="Latest shared location map" />
              </div>
            `
          : "";
        const mapsButton = mapsUrl
          ? `<a class="button secondary" href="${{mapsUrl}}" target="_blank" rel="noreferrer">Open in Maps</a>`
          : "";

        root.className = "panel status-card " + stateClass;
        content.innerHTML = `
          <div class="badge">${{stateLabel}}</div>
          <h2 style="margin-bottom: 8px;">Alert #${{alert.id}}</h2>
          <p style="line-height: 1.6; margin-top: 0;">
            ${{getStateDescription(alert)}}
          </p>

          <div class="status-row">
            <span class="label">Latest location</span>
            <span class="value">${{formatCoordinates(alert.last_lat, alert.last_lng)}}</span>
          </div>
          <div class="status-row">
            <span class="label">Last location update</span>
            <span class="value">${{formatDateTime(alert.last_location_at)}}</span>
          </div>
          <div class="status-row">
            <span class="label">Alert started</span>
            <span class="value">${{formatDateTime(alert.created_at)}}</span>
          </div>
          <div class="status-row">
            <span class="label">Last server refresh</span>
            <span class="value">${{formatDateTime(alert.refreshed_at)}}</span>
          </div>

          ${{mapHtml}}

          <div class="actions">
            <a class="button primary" href="${{appPath}}">Open in Guardian Circle app</a>
            ${{mapsButton}}
            <a class="button secondary" href="javascript:void(0)" id="refresh-button">Refresh now</a>
          </div>

          <p class="helper">
            Guardian Circle is an assistive coordination tool. Service interruptions and location inaccuracies are possible.
          </p>
        `;

        const refreshButton = document.getElementById("refresh-button");
        if (refreshButton) {{
          refreshButton.addEventListener("click", () => {{
            void refreshWatcher();
          }});
        }}
      }}

      async function refreshWatcher() {{
        try {{
          const response = await fetch(apiPath, {{ headers: {{ "Accept": "application/json" }} }});
          if (!response.ok) {{
            throw new Error("Watcher access is unavailable.");
          }}

          const payload = await response.json();
          renderAlert(payload);
        }} catch {{
          renderError("Guardian Circle could not refresh this watcher view right now.");
        }}
      }}

      if (initialError) {{
        renderError(initialError);
      }} else {{
        renderAlert(initialAlert);
        window.setInterval(() => {{
          void refreshWatcher();
        }}, pollIntervalMs);
      }}
    </script>
  </body>
</html>
"""
    return HTMLResponse(content=content, status_code=status_code)


@router.get("/watcher/{watcher_token}", response_class=HTMLResponse)
def watcher_page(watcher_token: str, db: Session = Depends(get_db)):
    try:
        snapshot = get_watcher_alert_snapshot(watcher_token, db)
        return _render_watcher_page(
            watcher_token=watcher_token,
            initial_payload=snapshot.model_dump(mode="json"),
        )
    except WatcherAccessError as exc:
        status_code = 404 if str(exc) == "Alert not found" else 401
        return _render_watcher_page(
            watcher_token=watcher_token,
            initial_payload=None,
            error_message=str(exc),
            status_code=status_code,
        )
