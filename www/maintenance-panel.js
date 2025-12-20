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
        }
        .page {
          margin: 0 auto;
          padding: 16px;
          box-sizing: border-box;
          max-width: 1400px;
        }
        .empty {
          padding: 16px;
          border-radius: 12px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          border: 1px solid var(--divider-color);
          box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,0.15));
        }
      </style>
      <div class="page">
        <maintenance-board style="display:none;"></maintenance-board>
        <div id="empty" class="empty" hidden>No Maintenance tasks sensor found. Add the integration first, then reload.</div>
      </div>
    `;

    this._board = this.shadowRoot.querySelector("maintenance-board");
    this._empty = this.shadowRoot.getElementById("empty");
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
    if (!this._empty) return;
    this._empty.hidden = false;
    if (this._board) this._board.style.display = "none";
  }

  _hideMissing() {
    if (!this._empty) return;
    this._empty.hidden = true;
    if (this._board) this._board.style.display = "block";
  }
}

if (!customElements.get("maintenance-panel")) {
  customElements.define("maintenance-panel", MaintenancePanel);
}
window.customPanel = true;
