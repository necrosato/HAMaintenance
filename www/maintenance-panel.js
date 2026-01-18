import "./maintenance-board.js";

class MaintenancePanel extends HTMLElement {
  constructor() {
    super();
    this._initialized = false;
    this._hass = null;
    this._panel = null;
  }

  set hass(hass) {
    this._hass = hass;
    this._applyConfig();
  }

  set panel(panel) {
    this._panel = panel;
    this._applyConfig();
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100vh;
          background: var(--lovelace-background, var(--primary-background-color));
          color: var(--primary-text-color);
        }
        ha-app-layout {
          background: var(--lovelace-background, var(--primary-background-color));
          color: var(--primary-text-color);
        }
        app-header {
          background: var(--app-header-background-color, var(--primary-color));
          color: var(--app-header-text-color, var(--text-primary-color));
        }
        app-toolbar {
          height: var(--header-height, 56px);
          display: flex;
          align-items: center;
        }
        .title {
          font-size: 20px;
          font-weight: 600;
          margin-left: 8px;
        }
        .content {
          padding: 16px 24px 32px;
          box-sizing: border-box;
        }
        .container {
          max-width: 1100px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .card-shell {
          background: var(--card-background-color, var(--ha-card-background, var(--primary-background-color)));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,.08));
          border: 1px solid var(--divider-color);
          padding: 12px 16px 16px;
          box-sizing: border-box;
        }
        .empty-card {
          display: block;
        }
        .empty-content {
          padding: 16px;
          color: var(--primary-text-color);
        }
        @media (max-width: 640px) {
          .content {
            padding: 12px;
          }
          .card-shell {
            padding: 12px;
          }
        }
      </style>
      <ha-app-layout>
        <app-header fixed>
          <app-toolbar>
            <ha-menu-button id="menuBtn"></ha-menu-button>
            <div class="title" id="panelTitle">Maintenance</div>
          </app-toolbar>
        </app-header>
        <div class="content">
          <div class="container">
            <div class="card-shell">
              <maintenance-board style="display:none;"></maintenance-board>
              <ha-card id="empty-card" class="empty-card" hidden>
                <div class="empty-content">
                  No Maintenance tasks sensor found. Add the integration first, then reload.
                </div>
              </ha-card>
            </div>
          </div>
        </div>
      </ha-app-layout>
    `;

    this._board = this.shadowRoot.querySelector("maintenance-board");
    this._emptyCard = this.shadowRoot.getElementById("empty-card");
    this._menuBtn = this.shadowRoot.getElementById("menuBtn");
    this._titleEl = this.shadowRoot.getElementById("panelTitle");
    this._applyConfig();
  }

  _applyConfig() {
    if (!this._board || !this._hass) return;
    if (this._menuBtn) this._menuBtn.hass = this._hass;
    if (this._titleEl) {
      const title = this._panel?.title || this._panel?.config?.title || "Maintenance";
      this._titleEl.textContent = title;
    }

    const entity = this._resolveTasksEntity();
    if (!entity) {
      this._showMissing();
      return;
    }

    const userEntity = this._resolveUserEntity();
    this._hideMissing();

    try {
      this._board.setConfig({ entity, user_entity: userEntity });
    } catch (err) {
      console.error("maintenance-panel: unable to set config", err);
    }

    this._board.hass = this._hass;
  }

  _resolveTasksEntity() {
    const cfg = this._panel?.config ?? {};
    const explicit = cfg.entity || cfg.entity_id || cfg.entityId;
    if (explicit && this._hass?.states?.[explicit]) return explicit;

    return this._findTasksSensor();
  }

  _findTasksSensor() {
    if (!this._hass?.states) return undefined;

    const candidates = Object.values(this._hass.states).filter(
      (st) => st.entity_id?.startsWith("sensor.") && Array.isArray(st.attributes?.tasks)
    );

    if (!candidates.length) return undefined;

    const preferred = candidates.find((st) => st.entity_id.includes("maintenance"));
    return (preferred ?? candidates[0]).entity_id;
  }

  _resolveUserEntity() {
    const cfg = this._panel?.config ?? {};
    const explicit = cfg.user_entity || cfg.userEntity;
    if (explicit && this._hass?.states?.[explicit]) return explicit;

    return this._findUserSelect();
  }

  _findUserSelect() {
    if (!this._hass?.states) return undefined;

    const candidates = Object.values(this._hass.states).filter(
      (st) => st.entity_id?.startsWith("select.") && st.entity_id.includes("maintenance")
    );

    if (!candidates.length) return undefined;

    return candidates[0].entity_id;
  }

  _showMissing() {
    if (!this._emptyCard) return;
    this._emptyCard.hidden = false;
    if (this._board) this._board.style.display = "none";
  }

  _hideMissing() {
    if (!this._emptyCard) return;
    this._emptyCard.hidden = true;
    if (this._board) this._board.style.display = "block";
  }
}

if (!customElements.get("maintenance-panel")) {
  customElements.define("maintenance-panel", MaintenancePanel);
}
window.customPanel = true;
