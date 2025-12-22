class MaintenanceBoardCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) throw new Error("maintenance-board: entity is required");
    this._config = config;
    this._lastRender = 0;
    this._editing = null;
    this._modalOpen = false;
    this._renderedKey = null;
    this._durationEls = new Map();

    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._root.innerHTML = `
        <style>
          :host {
            display: block;
            color: var(--primary-text-color);
          }
          .board {
            display: block;
          }
          .board-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 12px;
          }
          .header-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
          }
          .chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 12px;
            background: var(--chip-background-color, rgba(127,127,127,0.15));
            color: var(--primary-text-color);
            border: 1px solid var(--divider-color);
            white-space: nowrap;
          }
          .chip.overdue {
            color: var(--error-color);
            border-color: var(--error-color);
          }
          .chip.running {
            color: var(--success-color);
            border-color: var(--success-color);
          }
          .chip.soft {
            opacity: 0.85;
          }
          .task-card {
            background: var(--card-background-color, var(--ha-card-background, var(--primary-background-color)));
            border-radius: var(--ha-card-border-radius, 12px);
            box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,.08));
            border: 1px solid var(--divider-color);
            padding: 12px 16px;
            margin-bottom: 12px;
            box-sizing: border-box;
          }
          .task-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
          }
          .task-title {
            font-weight: 700;
            font-size: 16px;
            margin-bottom: 6px;
            word-break: break-word;
          }
          .task-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 8px;
          }
          .task-note {
            font-size: 13px;
            line-height: 1.4;
            opacity: 0.9;
            margin-bottom: 8px;
            white-space: pre-wrap;
          }
          .task-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
          }
          .duration-block {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 140px;
          }
          .duration {
            font-weight: 700;
            font-size: 15px;
          }
          .meta-text {
            font-size: 12px;
            opacity: 0.85;
          }
          .task-actions {
            display: flex;
            gap: 6px;
            align-items: center;
            flex-wrap: wrap;
          }
          .inline-actions {
            display: flex;
            gap: 6px;
          }
          mwc-button[disabled] {
            opacity: 0.5;
            pointer-events: none;
          }
          mwc-button.primary-btn {
            --mdc-theme-primary: var(--primary-color);
          }
          mwc-button.danger-btn {
            --mdc-theme-primary: var(--error-color);
          }
          ha-icon-button {
            --mdc-icon-size: 20px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 1px solid var(--divider-color);
          }
          .empty-state {
            text-align: center;
            color: var(--secondary-text-color);
            padding: 16px;
          }
          .dialog-content {
            padding: 0 8px 8px;
            box-sizing: border-box;
            color: var(--primary-text-color);
          }
          .dialog-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .dialog-grid.single {
            grid-template-columns: 1fr;
          }
          .field-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .field-label {
            font-size: 12px;
            opacity: 0.9;
          }
          .text-input,
          select,
          textarea {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid var(--divider-color);
            background: var(--card-background-color, var(--primary-background-color));
            color: var(--primary-text-color);
            border-radius: 8px;
            padding: 10px;
            font-size: 14px;
            outline: none;
          }
          textarea {
            resize: vertical;
            min-height: 80px;
          }
          ha-dialog {
            --dialog-surface-position: relative;
            --dialog-content-padding: 0;
            --dialog-background-color: var(--card-background-color, var(--primary-background-color));
            --dialog-surface-color: var(--primary-text-color);
            --dialog-title-font-weight: 700;
          }
          .error-text {
            color: var(--error-color);
            font-size: 12px;
            margin-top: 6px;
          }
          @media (max-width: 640px) {
            .task-header { flex-direction: column; align-items: flex-start; }
            .task-footer { flex-direction: column; align-items: flex-start; }
            .duration-block { width: 100%; }
            .task-actions { width: 100%; justify-content: flex-start; }
          }
        </style>

        <div class="board">
          <div class="board-header">
            <div class="header-meta">
              <span class="chip soft" id="count"></span>
              <span class="chip soft" id="filter"></span>
            </div>
            <mwc-button raised dense id="addBtn">➕ Add Task</mwc-button>
          </div>
          <div id="list"></div>
        </div>

        <ha-dialog id="taskDialog" scrimClickAction="close" escapeKeyAction="close">
          <div slot="heading" id="modalTitle">Add Task</div>
          <div class="dialog-content">
            <div class="dialog-grid single">
              <div class="field-group">
                <span class="field-label">Title</span>
                <ha-textfield id="f_title" class="text-input" placeholder="e.g. Mini-split – Clean filters"></ha-textfield>
              </div>
            </div>

            <div class="dialog-grid">
              <div class="field-group">
                <span class="field-label">Zone</span>
                <select id="f_zone" class="text-input"></select>
                <ha-textfield id="f_zone_new" class="text-input" placeholder="New zone" disabled></ha-textfield>
              </div>
              <div class="field-group">
                <span class="field-label">Notes</span>
                <textarea id="f_notes" placeholder="Optional notes…"></textarea>
              </div>
            </div>

            <div class="dialog-grid">
              <div class="field-group">
                <span class="field-label">Frequency (days)</span>
                <ha-textfield id="f_freq" class="text-input" type="number" min="0" step="1" placeholder="e.g. 30"></ha-textfield>
              </div>
              <div class="field-group">
                <span class="field-label">Estimate (minutes)</span>
                <ha-textfield id="f_est" class="text-input" type="number" min="0" step="1" placeholder="e.g. 15"></ha-textfield>
              </div>
            </div>

            <div class="dialog-grid single">
              <div class="field-group">
                <span class="field-label">Last done (date)</span>
                <ha-textfield id="f_last_done" class="text-input" type="date"></ha-textfield>
                <div class="meta-text">Due auto-calculates from Last done + Frequency.</div>
              </div>
            </div>

            <div class="error-text" id="modalError" style="display:none;"></div>
          </div>
          <mwc-button slot="secondaryAction" dialogAction="cancel" id="cancelBtn">Cancel</mwc-button>
          <mwc-button slot="primaryAction" id="saveBtn" class="primary-btn">Save</mwc-button>
        </ha-dialog>
      `;
    }

    // One-time wiring
    this._root.getElementById("addBtn").onclick = () => this._openAdd();
    this._root.getElementById("cancelBtn").onclick = () => this._closeModal();
    this._root.getElementById("saveBtn").onclick = () => this._saveTask();
    this._root.getElementById("f_zone").onchange = () => this._onZoneChange();
    this._dialog = this._root.getElementById("taskDialog");
    this._dialog.addEventListener("closed", () => {
      this._modalOpen = false;
      this._editing = null;
      this._setModalError("");
    });
  }

  set hass(hass) {
    this._hass = hass;
    this._scheduleRender();
  }

  connectedCallback() {
    this._tick = setInterval(() => this._scheduleRender(true), 1000);
    window.addEventListener("keydown", this._onKeyDown);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    window.removeEventListener("keydown", this._onKeyDown);
  }

  _onKeyDown = (e) => {
    if (e.key === "Escape" && this._modalOpen) this._closeModal();
  };

  _scheduleRender(force = false) {
    const now = Date.now();
    if (!force && now - this._lastRender < 200) return;
    this._lastRender = now;
    this._render();
  }

  _notify(message) {
    try {
      const ev = new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true });
      this.dispatchEvent(ev);
    } catch (_) {}
  }

  _getUser() {
    const cfg = this._config || {};
    if (cfg.user_entity) {
      const st = this._hass.states[cfg.user_entity];
      if (st && st.state && st.state !== "unknown" && st.state !== "unavailable") return st.state;
    }
    if (cfg.user) return cfg.user;

    const hassUser = this._hass?.user;
    if (hassUser) return hassUser.name || hassUser.id || "unknown";

    return "unknown";
  }

  _fmtDuration(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  _fmtDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${d.getUTCDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  _fmtDateTimeLocal(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    const h = `${d.getHours()}`.padStart(2, "0");
    const min = `${d.getMinutes()}`.padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}`;
  }

  _liveTotalSec(t) {
    const now = Date.now();
    let total = (t.accum_sec || 0);
    if (t.status === "running" && t.started_at) {
      const started = Date.parse(t.started_at);
      if (!Number.isNaN(started)) total += Math.max(0, Math.floor((now - started) / 1000));
    }
    return total;
  }

  async _call(domain, service, data, opts = {}) {
    try {
      await this._hass.callService(domain, service, data);
      return { ok: true };
    } catch (e) {
      const msg = e?.message || String(e);
      if (opts?.onError) opts.onError(msg);
      else this._notify(msg);
      return { ok: false, message: msg };
    }
  }

  _escape(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _getTasksState() {
    const entId = this._config.entity;
    const st = this._hass.states[entId];
    const attrs = st?.attributes || {};
    const tasks = Array.isArray(attrs.tasks) ? attrs.tasks : [];
    const zones = Array.isArray(attrs.zones) ? attrs.zones : [];
    return { st, tasks, zones };
  }

  _openAdd() {
    this._editing = null;
    this._openModal();
  }

  _openEdit(task) {
    if (task?.locked_by && task.locked_by !== this._getUser()) {
      this._notify(`Task is locked by ${task.locked_by}`);
      return;
    }
    this._editing = task;
    this._openModal();
  }

  _openModal() {
    const { zones } = this._getTasksState();
    const isEdit = !!this._editing;

    this._modalOpen = true;
    const dialog = this._dialog;
    dialog.open = true;
    this._root.getElementById("modalTitle").textContent = isEdit ? "Edit Task" : "Add Task";

    const zoneSel = this._root.getElementById("f_zone");
    const zoneNew = this._root.getElementById("f_zone_new");
    zoneSel.innerHTML = "";

    const allZones = (zones || []).filter((z) => z && z !== "Unsorted");
    const unique = Array.from(new Set(allZones)).sort((a, b) => a.localeCompare(b));
    const base = ["House", "Studio", "ADU", "Carport", "Pumphouse", "Shed", "Property"];
    const opts = base.concat(unique).filter((v, i, arr) => arr.indexOf(v) === i);

    for (const z of opts) {
      const o = document.createElement("option");
      o.value = z;
      o.textContent = z;
      zoneSel.appendChild(o);
    }
    const addNew = document.createElement("option");
    addNew.value = "__new__";
    addNew.textContent = "➕ Add new zone…";
    zoneSel.appendChild(addNew);

    const t = this._editing;

    this._root.getElementById("f_title").value = t ? (t.title || "") : "";
    this._root.getElementById("f_freq").value = t ? (t.freq_days ?? "") : "";
    this._root.getElementById("f_est").value = t ? (t.est_min ?? "") : "";
    this._root.getElementById("f_notes").value = t ? (t.notes || "") : "";

    const defaultZone = t?.zone || "House";
    if (opts.includes(defaultZone)) zoneSel.value = defaultZone;
    else if (defaultZone && defaultZone !== "Unsorted") {
      const o = document.createElement("option");
      o.value = defaultZone;
      o.textContent = defaultZone;
      zoneSel.insertBefore(o, zoneSel.firstChild);
      zoneSel.value = defaultZone;
    } else {
      zoneSel.value = "House";
    }

    zoneNew.value = "";
    zoneNew.disabled = true;

    const lastDone = t?.last_done ? String(t.last_done).slice(0, 10) : "";
    this._root.getElementById("f_last_done").value = lastDone;

    this._setModalError("");
    setTimeout(() => this._root.getElementById("f_title").focus(), 10);
  }

  _closeModal() {
    this._modalOpen = false;
    const dialog = this._dialog;
    if (dialog) {
      if (typeof dialog.close === "function") dialog.close();
      dialog.open = false;
    }
    this._editing = null;
    this._setModalError("");
  }

  _onZoneChange() {
    const zoneSel = this._root.getElementById("f_zone");
    const zoneNew = this._root.getElementById("f_zone_new");
    if (zoneSel.value === "__new__") {
      zoneNew.disabled = false;
      zoneNew.focus();
    } else {
      zoneNew.disabled = true;
      zoneNew.value = "";
    }
  }

  _setModalError(msg) {
    const el = this._root.getElementById("modalError");
    if (!msg) {
      el.style.display = "none";
      el.textContent = "";
    } else {
      el.style.display = "block";
      el.textContent = msg;
    }
  }

  _readModalForm() {
    const title = this._root.getElementById("f_title").value.trim();
    const zoneSel = this._root.getElementById("f_zone").value;
    const zoneNew = this._root.getElementById("f_zone_new").value.trim();
    const zone = (zoneSel === "__new__") ? zoneNew : zoneSel;

    const freqStr = this._root.getElementById("f_freq").value.trim();
    const estStr = this._root.getElementById("f_est").value.trim();
    const notes = this._root.getElementById("f_notes").value;

    const freq_days = freqStr === "" ? 0 : Number(freqStr);
    const est_min = estStr === "" ? 0 : Number(estStr);

    const last_done_date = this._root.getElementById("f_last_done").value.trim();

    let last_done = null;
    if (last_done_date) {
      const localMidnight = new Date(`${last_done_date}T00:00:00`);
      if (!Number.isNaN(localMidnight.getTime())) {
        last_done = localMidnight.toISOString();
      }
    }

    return { title, zone, freq_days, est_min, notes, last_done };
  }

  async _saveTask() {
    const { title, zone, freq_days, est_min, notes, last_done } = this._readModalForm();
    const isEdit = !!this._editing;

    if (!title) return this._setModalError("Title is required.");
    if (!zone) return this._setModalError("Zone is required (or enter a new zone).");
    if (!Number.isFinite(freq_days) || freq_days < 0) return this._setModalError("Frequency must be a number (0 or greater).");
    if (!Number.isFinite(est_min) || est_min < 0) return this._setModalError("Estimate must be a number (0 or greater).");

    const payload = {
      title,
      zone,
      freq_days: Math.floor(freq_days),
      est_min: Math.floor(est_min),
      notes,
    };
    if (last_done) payload.last_done = last_done;

    if (!isEdit) {
      const res = await this._call("maintenance", "add_task", payload, { onError: (msg) => this._setModalError(msg) });
      if (!res?.ok) return;
      this._setModalError("");
      this._notify("Task added.");
      this._closeModal();
      return;
    }

    payload.task_id = this._editing.id;
    const res = await this._call("maintenance", "update_task", payload, { onError: (msg) => this._setModalError(msg) });
    if (!res?.ok) return;
    this._setModalError("");
    this._notify("Task updated.");
    this._closeModal();
  }

  async _deleteTask(task) {
    const user = this._getUser();
    const locked = task.locked_by;
    if (locked && locked !== user) {
      this._notify(`Task is locked by ${locked}`);
      return;
    }
    const yes = confirm(`Delete task?\n\n[${task.zone}] ${task.title}\n\nThis cannot be undone.`);
    if (!yes) return;
    const { ok } = await this._call("maintenance", "delete_task", { task_id: task.id });
    if (ok) this._notify("Task deleted.");
  }

  async _resetTask(task) {
    const user = this._getUser();
    const locked = task.locked_by;
    if (locked && locked !== user) {
      this._notify(`Task is locked by ${locked}`);
      return;
    }

    const yes = confirm(`Reset task history?\n\n[${task.zone}] ${task.title}\n\nThis clears averages and timers but keeps last done + frequency.`);
    if (!yes) return;

    const { ok } = await this._call("maintenance", "reset_task", { task_id: task.id });
    if (ok) this._notify("Task reset.");
  }

  async _toggleStartPause(task) {
    const user = this._getUser();
    const locked = task.locked_by;
    if (locked && locked !== user) {
      this._notify(`Task is locked by ${locked}`);
      return;
    }
    const svc = (task.status === "running") ? "pause_task" : "start_task";
    await this._call("maintenance", svc, { task_id: task.id });
  }

  async _complete(task) {
    const user = this._getUser();
    const locked = task.locked_by;
    if (locked && locked !== user) {
      this._notify(`Task is locked by ${locked}`);
      return;
    }
    await this._call("maintenance", "complete_task", { task_id: task.id });
  }

  _updateLiveDurations(tasks) {
    if (!this._durationEls || this._durationEls.size === 0) return;
    tasks.forEach((t) => {
      const key = this._escape(t.id);
      const el = this._durationEls.get(key);
      if (el) el.textContent = this._fmtDuration(this._liveTotalSec(t));
    });
  }

  _buildChip(label, extraClass = "") {
    return `<span class="chip ${extraClass}">${label}</span>`;
  }

  _render() {
    if (!this._hass || !this._config) return;

    const { st, tasks } = this._getTasksState();
    const countEl = this._root.getElementById("count");
    const filterEl = this._root.getElementById("filter");
    const listEl = this._root.getElementById("list");

    if (!st) {
      countEl.textContent = `Missing entity: ${this._config.entity}`;
      filterEl.textContent = "";
      listEl.innerHTML = "";
      this._durationEls = new Map();
      this._renderedKey = null;
      return;
    }

    const user = this._getUser();
    countEl.textContent = `${tasks.length} task(s)`;
    filterEl.textContent = `User: ${user}`;

    const stateKey = JSON.stringify(tasks || []);
    const canReuse = this._renderedKey === stateKey && this._durationEls.size > 0;
    if (canReuse) {
      this._updateLiveDurations(tasks);
      return;
    }

    const html = (tasks.length === 0)
      ? `<div class="task-card empty-state">No tasks yet. Click Add Task.</div>`
      : tasks.map((t) => {
        const daysLeft = t.days_left;
        const dueTxt = (daysLeft === null || daysLeft === undefined)
          ? "No due date"
          : (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`);

        const locked = t.locked_by;
        const status = t.status || "idle";
        const isLockedByOther = locked && locked !== user;

        const canStartPause = (!locked || locked === user);
        const startPauseLabel = (status === "running") ? "Pause" : (status === "paused" ? "Resume" : "Start");
        const totalSec = this._liveTotalSec(t);
        const durTxt = this._fmtDuration(totalSec);
        const lastDone = this._fmtDate(t.last_done) || "never";
        const lastDoneBy = (t.last_done_by || "").trim();
        const lastDoneLabel = lastDone === "never"
          ? "Last done: never"
          : (lastDoneBy ? `Last done: ${lastDone} by ${lastDoneBy}` : `Last done: ${lastDone}`);
        const startedAt = (status === "running" && t.started_at) ? this._fmtDateTimeLocal(t.started_at) : "";

        const dueClass = (daysLeft !== null && daysLeft !== undefined && daysLeft < 0) ? "overdue" : "";
        const statusClass = status === "running" ? "running" : "";

        const freq = t.freq_days ? `Every ${t.freq_days}d` : "";
        const est = t.est_min ? `${t.est_min}m est` : "";
        const hasAvg = t.avg_min !== undefined && t.avg_min !== null;
        const avg = hasAvg ? `${t.avg_min}m avg` : "";
        const note = (t.notes || "").trim();

        const zoneChip = t.zone ? this._buildChip(this._escape(t.zone)) : "";
        const statusChip = this._buildChip(this._escape(status === "idle" ? "Idle" : status.charAt(0).toUpperCase() + status.slice(1)), statusClass);
        const dueChip = this._buildChip(this._escape(dueTxt), dueClass);
        const lockChip = locked ? this._buildChip(`Locked by ${this._escape(locked)}`, "overdue") : "";
        const lastDoneChip = this._buildChip(this._escape(lastDoneLabel));
        const freqChip = freq ? this._buildChip(this._escape(freq)) : "";
        const estChip = est ? this._buildChip(this._escape(est)) : "";
        const avgChip = avg ? this._buildChip(this._escape(avg)) : "";

        const disableAll = isLockedByOther;

        return `
          <div class="task-card">
            <div class="task-header">
              <div>
                <div class="task-title">${this._escape(t.title)}</div>
                <div class="task-meta">
                  ${zoneChip}
                  ${statusChip}
                  ${dueChip}
                  ${lockChip}
                  ${lastDoneChip}
                  ${freqChip}
                  ${estChip}
                  ${avgChip}
                </div>
                ${note ? `<div class="task-note">${this._escape(note)}</div>` : ""}
              </div>
              <div class="task-actions">
                <div class="inline-actions">
                  <ha-icon-button icon="mdi:pencil" aria-label="Edit" data-edit="${this._escape(t.id)}" ${disableAll ? "disabled" : ""}></ha-icon-button>
                  <ha-icon-button icon="mdi:backup-restore" aria-label="Reset" data-reset="${this._escape(t.id)}" ${disableAll ? "disabled" : ""}></ha-icon-button>
                  <ha-icon-button icon="mdi:delete" aria-label="Delete" data-del="${this._escape(t.id)}" ${disableAll ? "disabled" : ""}></ha-icon-button>
                </div>
              </div>
            </div>

            <div class="task-footer">
              <div class="duration-block">
                <div class="duration" data-duration="${this._escape(t.id)}">${this._escape(durTxt)}</div>
                ${startedAt ? `<div class="meta-text">Started: ${this._escape(startedAt)}</div>` : ""}
              </div>
              <div class="task-actions">
                <mwc-button dense outlined class="primary-btn" data-sp="${this._escape(t.id)}" ${canStartPause ? "" : "disabled"}>${this._escape(startPauseLabel)}</mwc-button>
                <mwc-button dense raised class="danger-btn" data-c="${this._escape(t.id)}" ${disableAll ? "disabled" : ""}>Complete</mwc-button>
              </div>
            </div>
          </div>
        `;
      }).join("");

    listEl.innerHTML = html;
    this._renderedKey = stateKey;

    this._durationEls = new Map();
    listEl.querySelectorAll(".duration").forEach((el) => {
      const id = el.getAttribute("data-duration");
      if (id) this._durationEls.set(id, el);
    });

    const byId = new Map(tasks.map((t) => [t.id, t]));

    listEl.querySelectorAll("mwc-button[data-sp]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-sp");
        const task = byId.get(id);
        if (task) await this._toggleStartPause(task);
      };
    });

    listEl.querySelectorAll("mwc-button[data-c]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-c");
        const task = byId.get(id);
        if (task) await this._complete(task);
      };
    });

    listEl.querySelectorAll("ha-icon-button[data-edit]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-edit");
        const task = byId.get(id);
        if (task) this._openEdit(task);
      };
    });

    listEl.querySelectorAll("ha-icon-button[data-reset]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-reset");
        const task = byId.get(id);
        if (task) await this._resetTask(task);
      };
    });

    listEl.querySelectorAll("ha-icon-button[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-del");
        const task = byId.get(id);
        if (task) await this._deleteTask(task);
      };
    });
  }
}

customElements.define("maintenance-board", MaintenanceBoardCard);

