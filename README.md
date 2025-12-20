# Maintenance – Home Assistant Custom Integration + Dashboard

A maintenance task system for Home Assistant with a purpose-built dashboard UI.

Key features:
- Tasks sorted by due / days-left (overdue first)
- Inline controls per task: Start / Pause (duration accumulator) and Complete
- Add / Edit / Delete tasks directly from the dashboard
- Recurring tasks reschedule based on when they are actually completed
- Optional manual Last Done and Due Date fields
- No Home Assistant Todo UI, no Actions UI, no YAML editing for users

This is intended to be usable by non–Home Assistant power users.

---

## Requirements

- Home Assistant Core 2025.x (tested on Container install)
- Access to `/config`
- Ability to restart Home Assistant

---

## Installation

### 1. Clone the integration

From your Home Assistant config directory:

```bash
cd /config/custom_components
git clone <YOUR_REPO_URL> maintenance
````

Resulting structure (files are served directly by the integration; no `/config/www` steps needed):

```
/config/custom_components/maintenance/
  manifest.json
  __init__.py
  const.py
  services.py
  storage.py
  sensor.py
  www/
    maintenance-board.js
    maintenance-panel.js
```

The integration serves `/api/maintenance/static/maintenance-board.js` and registers a sidebar panel automatically.

---

## Restart Home Assistant

Restart is required after installing or modifying a custom integration:

Settings → System → Restart

---

## Add the Integration

1. Settings → Devices & Services → Integrations
2. Add Integration
3. Search for “Maintenance”
4. Add it

After setup, you should see:

* A sensor exposing tasks (for example: `sensor.maintenance_tasks`)
* Services under the `maintenance.*` domain
* A **Maintenance** item in the sidebar that opens the dashboard UI with no extra configuration

---

## Panel usage

Click **Maintenance** in the sidebar to open the UI. The integration attempts to auto-discover the tasks sensor and optional user select entity; if it cannot find a tasks sensor it will show a friendly message instead of breaking the page.

Development tip: the static files are served with caching disabled, but browsers may still cache aggressively. If you update `maintenance-board.js` or `maintenance-panel.js`, perform a hard refresh (Ctrl+Shift+R or ⌘+Shift+R) to reload the latest code.

---

## Using the Maintenance Board

### Add a task

* Open the Maintenance dashboard
* Click “Add Task”
* Fill in:

  * Title
  * Zone (or add a new one)
  * Frequency (days)
  * Estimate (minutes)
  * Optional: Last Done date
  * Optional: Due date
  * Notes
* Save

If Last Done is set and Due Date is left blank, Due Date is calculated automatically.

---

### Start / Pause

* Start begins time accumulation
* Pause stops accumulation
* Tasks can remain paused indefinitely

---

### Complete

* Can be clicked from any state (idle / running / paused)
* Completion:

  * Sets `last_done = now`
  * Sets `due = now + frequency`
  * Clears locks and timers
  * Returns task to idle
  * Task re-sorts based on new due date

---

### Edit / Delete

* ✏️ Edit updates task metadata
* 🗑️ Delete permanently removes the task

---

## Troubleshooting

### “Custom element not found: maintenance-board”

The JavaScript module did not load. Check:

1. Visit `https://<ha-host>/api/maintenance/static/maintenance-board.js` (you should see source, not a 404).
2. Verify the **Maintenance** sidebar item appears (if not, restart Home Assistant).
3. Hard refresh your browser.

---

### “Service maintenance.add_task not found”

The integration did not load correctly.

Check:

* Settings → System → Logs
* Look for errors from `custom_components/maintenance`
* Ensure Home Assistant was restarted after installation

---

## Development Notes

* Backend code: `custom_components/maintenance/`
* Dashboard UI: `custom_components/maintenance/www/maintenance-board.js`
* Sidebar panel wrapper: `custom_components/maintenance/www/maintenance-panel.js`
* Static assets are served from `/api/maintenance/static/`

Typical dev loop:

1. Edit Python → Restart Home Assistant
2. Edit JS → Hard refresh browser

---

## Status

This integration is under active development.
APIs and UI are expected to evolve, but data storage is forward-compatible.
