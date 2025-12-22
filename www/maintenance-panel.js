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
          height: 100%;
          background: var(--lovelace-background, var(--primary-background-color));
          color: var(--primary-text-color);
        }
        .root {
          min-height: 100vh;
          background: var(--lovelace-background, var(--primary-background-color));
        }
        .container {
          padding: 16px;
          max-width: 1100px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .empty-card {
          display: block;
        }
        .empty-content {
          padding: 16px;
          color: var(--primary-text-color);
        }
      </style>
      <div class="root">
        <div class="container">
          <maintenance-board style="display:none;"></maintenance-board>
          <ha-card id="empty-card" class="empty-card" hidden>
            <div class="empty-content">
              No Maintenance tasks sensor found. Add the integration first, then reload.
            </div>
          </ha-card>
        </div>
      </div>
    `;

    this._board = this.shadowRoot.querySelector("maintenance-board");
    this._emptyCard = this.shadowRoot.getElementById("empty-card");
    this._applyConfig();
  }

  _applyConfig() {
    if (!this._board || !this._hass) return;

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
