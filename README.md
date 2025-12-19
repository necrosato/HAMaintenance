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
- A Lovelace dashboard

---

## Installation

### 1. Clone the integration

From your Home Assistant config directory:

```bash
cd /config/custom_components
git clone <YOUR_REPO_URL> maintenance
````

Resulting structure:

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
```

---

## Expose the dashboard UI (symlink into `/config/www`)

Home Assistant serves files in `/config/www` under `/local/`.

Lovelace custom cards must be loaded from `/local/`.

### 2. Create a symbolic link

```bash
mkdir -p /config/www
ln -sf /config/custom_components/maintenance/www/maintenance-board.js /config/www/maintenance-board.js
```

Verify it works by opening:

```
http://<home-assistant-host>:8123/local/maintenance-board.js
```

You should see JavaScript source code, not a 404.

If your environment does not support symlinks, copy instead:

```bash
cp /config/custom_components/maintenance/www/maintenance-board.js /config/www/maintenance-board.js
```

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

---

## Add the Lovelace Resource

1. Settings → Dashboards → Resources
2. Add Resource
3. URL: `/local/maintenance-board.js`
4. Resource type: JavaScript Module
5. Save
6. Hard refresh your browser (Ctrl+Shift+R)

---

## Create the Dashboard View

Edit your dashboard and open the Raw Configuration Editor.

Add a view like this:

```yaml
views:
  - title: Maintenance
    icon: mdi:tools
    panel: true
    cards:
      - type: custom:maintenance-board
        entity: sensor.maintenance_tasks
        user_entity: select.maintenance_user
```

Notes:

* Replace `sensor.maintenance_tasks` if your sensor name differs.
* `user_entity` is optional but recommended for multi-user locking.

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

The JavaScript card is not loaded.

Check:

1. `/config/www/maintenance-board.js` exists (or symlink exists)
2. `http://<ha>/local/maintenance-board.js` loads
3. Resource is added as JavaScript Module
4. Hard refresh browser

---

### “Service maintenance.add_task not found”

The integration did not load correctly.

Check:

* Settings → System → Logs
* Look for errors from `custom_components/maintenance`
* Ensure Home Assistant was restarted after installation

---

### 404 at `/local/maintenance-board.js`

The symlink or copy is incorrect.

Fix:

```bash
ln -sf /config/custom_components/maintenance/www/maintenance-board.js /config/www/maintenance-board.js
```

---

## Development Notes

* Backend code: `custom_components/maintenance/`
* Dashboard UI: `custom_components/maintenance/www/maintenance-board.js`
* Lovelace loads the UI from `/config/www` via `/local/`

Typical dev loop:

1. Edit Python → Restart Home Assistant
2. Edit JS → Hard refresh browser

---

## Status

This integration is under active development.
APIs and UI are expected to evolve, but data storage is forward-compatible.

```
