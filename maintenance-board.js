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
          :host { display:block; }
          .card { padding: 12px; }
          .top { display:flex; gap:8px; align-items:center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 10px; }
          .leftTop { display:flex; gap:8px; align-items:center; flex-wrap: wrap; }
          .pill { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--divider-color); font-size: 12px; }
          .row { display:flex; flex-direction:column; gap:8px; padding: 10px 0; border-top: 1px solid var(--divider-color); }
          .row:first-of-type { border-top: none; }
          .head { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
          .title { font-weight: 600; line-height: 1.2; }
          .meta { font-size: 12px; opacity: .88; display:flex; gap:8px; flex-wrap: wrap; margin-top: 4px; }
          .right { text-align:right; font-size: 12px; opacity: .9; min-width: 110px; }
          .btns { display:flex; gap:8px; }
          .icons { display:flex; gap:8px; justify-content:flex-end; margin-top: 6px; }
          button {
            border: 1px solid var(--divider-color);
            background: var(--card-background-color);
            color: var(--primary-text-color);
            border-radius: 12px;
            padding: 10px 10px;
            font-size: 13px;
            cursor: pointer;
            flex: 1;
          }
          button.smallBtn {
            flex: 0 0 auto;
            padding: 8px 10px;
            font-size: 12px;
            border-radius: 10px;
          }
          button:disabled { opacity:.45; cursor:not-allowed; }
          .danger { border-color: var(--error-color); }
          .ok { border-color: var(--success-color); }
          .small { font-size: 11px; opacity: .75; margin-top: 4px; }
          .note { font-size: 12px; opacity:.85; white-space: pre-wrap; margin-top: 6px; }

          /* Modal */
          .backdrop {
            position: fixed; inset: 0;
            background: rgba(0,0,0,.35);
            display: none;
            align-items: center; justify-content: center;
            z-index: 9999;
          }
          .backdrop.open { display: flex; }
          .modal {
            width: min(560px, calc(100vw - 24px));
            max-height: calc(100vh - 24px);
            overflow: auto;
            background: var(--card-background-color);
            color: var(--primary-text-color);
            border: 1px solid var(--divider-color);
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,.35);
            padding: 14px;
          }
          .modalHeader { display:flex; justify-content: space-between; align-items:center; gap:10px; margin-bottom: 8px; }
          .modalTitle { font-weight: 700; }
          .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .grid1 { display:grid; grid-template-columns: 1fr; gap: 10px; }
          label { font-size: 12px; opacity: .9; display:block; margin-bottom: 4px; }
          input, textarea, select {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid var(--divider-color);
            background: var(--card-background-color);
            color: var(--primary-text-color);
            border-radius: 12px;
            padding: 10px;
            font-size: 14px;
            outline: none;
          }
          textarea { min-height: 80px; resize: vertical; }
          .modalActions { display:flex; gap:10px; margin-top: 12px; }
          .modalActions button { flex: 1; }
          .ghost { opacity:.9; }
          .hint { font-size: 12px; opacity: .75; margin-top: 6px; }
          .warn { color: var(--error-color); font-size: 12px; margin-top: 6px; }
        </style>

        <ha-card>
          <div class="card">
            <div class="top">
              <div class="leftTop">
                <div class="pill" id="count"></div>
                <div class="pill" id="filter"></div>
              </div>
              <div class="leftTop">
                <button class="smallBtn" id="addBtn">➕ Add Task</button>
              </div>
            </div>

            <div id="list"></div>
          </div>
        </ha-card>

        <div class="backdrop" id="backdrop" role="dialog" aria-modal="true">
          <div class="modal">
            <div class="modalHeader">
              <div class="modalTitle" id="modalTitle">Add Task</div>
              <button class="smallBtn" id="closeModal">✕</button>
            </div>

            <div class="grid1">
              <div>
                <label>Title</label>
                <input id="f_title" placeholder="e.g. Mini-split – Clean filters" />
              </div>
            </div>

            <div class="grid">
              <div>
                <label>Zone</label>
                <select id="f_zone"></select>
                <div class="hint">Pick a zone, or choose “Add new zone…”</div>
              </div>

              <div>
                <label>New zone (only if adding)</label>
                <input id="f_zone_new" placeholder="e.g. Studio" disabled />
              </div>
            </div>

            <div class="grid">
              <div>
                <label>Frequency (days)</label>
                <input id="f_freq" type="number" min="0" step="1" placeholder="e.g. 30" />
              </div>
              <div>
                <label>Estimate (minutes)</label>
                <input id="f_est" type="number" min="0" step="1" placeholder="e.g. 15" />
              </div>
            </div>

            <div class="grid1">
              <div>
                <label>Last done (date)</label>
                <input id="f_last_done" type="date" />
                <div class="hint">Due auto-calculates from Last done + Frequency.</div>
              </div>
            </div>

            <div class="grid1">
              <div>
                <label>Notes</label>
                <textarea id="f_notes" placeholder="Optional notes…"></textarea>
              </div>
            </div>

            <div class="warn" id="modalError" style="display:none;"></div>

            <div class="modalActions">
              <button class="ghost" id="cancelBtn">Cancel</button>
              <button class="ok" id="saveBtn">Save</button>
            </div>

          </div>
        </div>
      `;
    }

    // One-time wiring
    this._root.getElementById("addBtn").onclick = () => this._openAdd();
    this._root.getElementById("closeModal").onclick = () => this._closeModal();
    this._root.getElementById("cancelBtn").onclick = () => this._closeModal();

    const backdrop = this._root.getElementById("backdrop");
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) this._closeModal();
    });

    this._root.getElementById("f_zone").onchange = () => this._onZoneChange();
    this._root.getElementById("saveBtn").onclick = () => this._saveTask();
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
    return cfg.user || "unknown";
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
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
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
    this._root.getElementById("backdrop").classList.add("open");
    this._root.getElementById("modalTitle").textContent = isEdit ? "Edit Task" : "Add Task";

    const zoneSel = this._root.getElementById("f_zone");
    const zoneNew = this._root.getElementById("f_zone_new");
    zoneSel.innerHTML = "";

    // Dropdown + "Add new zone…"
    const allZones = (zones || []).filter(z => z && z !== "Unsorted");
    const unique = Array.from(new Set(allZones)).sort((a,b)=>a.localeCompare(b));
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

    // Fill form for edit
    const t = this._editing;

    this._root.getElementById("f_title").value = t ? (t.title || "") : "";
    this._root.getElementById("f_freq").value = t ? (t.freq_days ?? "") : "";
    this._root.getElementById("f_est").value = t ? (t.est_min ?? "") : "";
    this._root.getElementById("f_notes").value = t ? (t.notes || "") : "";

    const defaultZone = t?.zone || "House";
    if (opts.includes(defaultZone)) zoneSel.value = defaultZone;
    else if (defaultZone && defaultZone !== "Unsorted") {
      // allow editing unknown zone
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

    // Dates (we store ISO; date input wants YYYY-MM-DD)
    const lastDone = t?.last_done ? String(t.last_done).slice(0, 10) : "";
    this._root.getElementById("f_last_done").value = lastDone;

    this._setModalError("");
    setTimeout(() => this._root.getElementById("f_title").focus(), 10);
  }

  _closeModal() {
    this._modalOpen = false;
    this._root.getElementById("backdrop").classList.remove("open");
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

    // Send ISO datetime at midnight UTC, which HA cv.datetime accepts
    const last_done = last_done_date ? `${last_done_date}T00:00:00Z` : null;

    return { title, zone, freq_days, est_min, notes, last_done };
  }

  async _saveTask() {
    const { title, zone, freq_days, est_min, notes, last_done } = this._readModalForm();
    const isEdit = !!this._editing;
    const user = this._getUser();

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
    payload.user = user;
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
    const { ok } = await this._call("maintenance", "delete_task", { task_id: task.id, user });
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

    const { ok } = await this._call("maintenance", "reset_task", { task_id: task.id, user });
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
    await this._call("maintenance", svc, { task_id: task.id, user });
  }

  async _complete(task) {
    const user = this._getUser();
    const locked = task.locked_by;
    if (locked && locked !== user) {
      this._notify(`Task is locked by ${locked}`);
      return;
    }
    await this._call("maintenance", "complete_task", { task_id: task.id, user });
  }

  _updateLiveDurations(tasks) {
    if (!this._durationEls || this._durationEls.size === 0) return;
    tasks.forEach(t => {
      const key = this._escape(t.id);
      const el = this._durationEls.get(key);
      if (el) el.textContent = this._fmtDuration(this._liveTotalSec(t));
    });
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

    const html = tasks.map(t => {
      const daysLeft = t.days_left;
      const dueTxt = (daysLeft === null || daysLeft === undefined)
        ? "no due"
        : (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`);

      const locked = t.locked_by;
      const status = t.status || "idle";
      const isLockedByOther = locked && locked !== user;

      const canStartPause = (!locked || locked === user);
      const startPauseLabel = (status === "running") ? "Pause" : (status === "paused" ? "Resume" : "Start");
      const totalSec = this._liveTotalSec(t);
      const durTxt = this._fmtDuration(totalSec);
      const lastDone = this._fmtDate(t.last_done) || "never";
      const startedAt = (status === "running" && t.started_at) ? this._fmtDateTimeLocal(t.started_at) : "";

      const borderClass = (daysLeft !== null && daysLeft !== undefined && daysLeft < 0) ? "danger" : "ok";
      const lockTxt = locked ? `locked by ${locked}` : "unlocked";
      const est = t.est_min ? `${t.est_min}m est` : "";
      const avg = t.avg_min ? `${t.avg_min}m avg` : "";
      const freq = t.freq_days ? `every ${t.freq_days}d` : "";

      const note = (t.notes || "").trim();

      return `
        <div class="row">
          <div class="head">
            <div>
              <div class="title">${this._escape(`[${t.zone}] ${t.title}`)}</div>
              <div class="meta">
                <span class="pill ${borderClass}">${this._escape(dueTxt)}</span>
                ${freq ? `<span class="pill">${this._escape(freq)}</span>` : ""}
                ${est ? `<span class="pill">${this._escape(est)}</span>` : ""}
                ${avg ? `<span class="pill">${this._escape(avg)}</span>` : ""}
                <span class="pill">${this._escape(status)}</span>
                <span class="pill">${this._escape(lockTxt)}</span>
                <span class="pill">Last done: ${this._escape(lastDone)}</span>
              </div>
              ${note ? `<div class="note">${this._escape(note)}</div>` : ""}
            </div>

            <div class="right">
              <div class="duration" data-duration="${this._escape(t.id)}">${this._escape(durTxt)}</div>
              ${startedAt ? `<div class="small">Started: ${this._escape(startedAt)}</div>` : ""}
              <div class="icons">
                <button class="smallBtn" data-edit="${this._escape(t.id)}" ${isLockedByOther ? "disabled" : ""}>✏️</button>
                <button class="smallBtn" data-reset="${this._escape(t.id)}" ${isLockedByOther ? "disabled" : ""}>♻️</button>
                <button class="smallBtn danger" data-del="${this._escape(t.id)}" ${isLockedByOther ? "disabled" : ""}>🗑️</button>
              </div>
            </div>
          </div>

          <div class="btns">
            <button data-sp="${this._escape(t.id)}" ${canStartPause ? "" : "disabled"}>
              ${this._escape(startPauseLabel)}
            </button>
            <button class="danger" data-c="${this._escape(t.id)}" ${isLockedByOther ? "disabled" : ""}>
              Complete
            </button>
          </div>
        </div>
      `;
    }).join("");

    listEl.innerHTML = html;
    this._renderedKey = stateKey;

    this._durationEls = new Map();
    listEl.querySelectorAll(".duration").forEach(el => {
      const id = el.getAttribute("data-duration");
      if (id) this._durationEls.set(id, el);
    });

    const byId = new Map(tasks.map(t => [t.id, t]));

    listEl.querySelectorAll("button[data-sp]").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-sp");
        const task = byId.get(id);
        if (task) await this._toggleStartPause(task);
      };
    });

    listEl.querySelectorAll("button[data-c]").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-c");
        const task = byId.get(id);
        if (task) await this._complete(task);
      };
    });

    listEl.querySelectorAll("button[data-edit]").forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-edit");
        const task = byId.get(id);
        if (task) this._openEdit(task);
      };
    });

    listEl.querySelectorAll("button[data-reset]").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-reset");
        const task = byId.get(id);
        if (task) await this._resetTask(task);
      };
    });

    listEl.querySelectorAll("button[data-del]").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-del");
        const task = byId.get(id);
        if (task) await this._deleteTask(task);
      };
    });
  }
}

customElements.define("maintenance-board", MaintenanceBoardCard);

