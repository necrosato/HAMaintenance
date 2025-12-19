# AGENTS.md — Maintenance (Home Assistant Custom Integration)

## Purpose

This repository implements a **custom Home Assistant integration + custom dashboard UI**
for managing recurring home maintenance tasks.

This project explicitly **does NOT** use:
- Home Assistant Todo UI
- Home Assistant Actions / Scripts UI
- Helpers for task storage

The goal is a **single, purpose-built maintenance dashboard** that non–Home Assistant power users can use comfortably.

Home Assistant is treated as the **runtime and persistence layer**, not the primary UI.

---

## High-Level Architecture

### Backend (Python)
Location: `custom_components/maintenance/`

Responsibilities:
- Persist maintenance tasks
- Enforce task lifecycle rules
- Provide services for task mutation
- Expose task state via a sensor entity

Key modules:
- `storage.py` — persistent task storage using `homeassistant.helpers.storage.Store`
- `services.py` — service handlers (add/update/delete/start/pause/complete)
- `sensor.py` — exposes tasks and derived fields (e.g. days_left)
- `__init__.py` — config entry setup and service registration

### Frontend (JavaScript)
Location: `custom_components/maintenance/www/maintenance-board.js`

Responsibilities:
- Render the maintenance dashboard UI
- Add/Edit/Delete tasks
- Start/Pause/Complete tasks
- Enforce UI-side lock rules
- Never require YAML or Actions UI interaction

Loaded via:
- Symlink or copy into `/config/www/maintenance-board.js`
- Added as a Lovelace JavaScript module resource
- Used via `type: custom:maintenance-board`

---

## Core Data Model (Task)

A task has (at minimum):

- `id` (string, stable identifier)
- `title`
- `zone`
- `freq_days` (integer, recurrence in days)
- `est_min` (estimated minutes)
- `avg_min` (running average of actual minutes)
- `n` (number of completions)

Runtime state:
- `status`: `idle | running | paused`
- `locked_by`: username or null
- `started_at`: datetime or null
- `accum_sec`: accumulated seconds

Scheduling:
- `last_done`: datetime or null
- `due`: datetime or null (**derived, never user-edited**)

---

## Scheduling Rules (CRITICAL)

These rules are **intentional** and must not be violated by future changes.

### Due Date Is Always Derived
- `due` is **never** directly editable by users.
- On **create** and **update**:
  - If `last_done` exists and `freq_days > 0`:
    - `due = last_done + freq_days`
  - Otherwise:
    - `due = null`

### Editing == Creation Semantics
- Editing an **idle** task behaves the same as creating it.
- Any edit that changes `last_done` or `freq_days` must recompute `due`.

This guarantees:
- Editing `last_done` into the past immediately updates overdue state
- No stale or inconsistent `days_left`

---

## Task Lifecycle Rules

### Start / Pause
- `start_task`:
  - Locks task to user
  - Sets `status = running`
  - Sets `started_at`
- `pause_task`:
  - Accumulates elapsed time into `accum_sec`
  - Clears `started_at`
  - Sets `status = paused`
- Tasks may remain paused indefinitely

### Complete
- Can be triggered from **any state**
- On complete:
  - Accumulate any running time
  - Compute `spent_min`
  - Update running average (`avg_min`)
  - Increment completion count (`n`)
  - Set `last_done = now`
  - Recompute `due = now + freq_days`
  - Clear lock and runtime state
  - Reset `accum_sec`
  - Set `status = idle`

---

## Locking Rules

- A task may be locked by **only one user at a time**
- A user **cannot**:
  - Edit
  - Delete
  - Start/Pause
if the task is locked by someone else

This must be enforced in:
1. **UI** (disable controls)
2. **Backend services** (reject mutation)

UI enforcement alone is insufficient.

---

## Sensor Responsibilities (`sensor.py`)

The task sensor must:
- Expose all tasks as an attribute list
- Include derived fields per task:
  - `days_left` = floor((due - now) in days)
- Recompute derived fields:
  - On any DB change
  - Periodically (e.g. hourly) so days roll over naturally

The UI relies on `days_left` being correct at all times.

---

## UI Principles (Maintenance Board)

The dashboard UI must:
- Be fully usable without YAML or Actions UI
- Support:
  - Add Task
  - Edit Task
  - Delete Task
  - Start / Pause
  - Complete
- Show at least:
  - Title
  - Zone
  - Due / days left
  - Last done date
  - Status
  - Lock owner
  - Duration accumulator

The UI must **never** ask users to manually manage recurrence math.

---

## Development Constraints

- Prefer clarity over cleverness
- Avoid hidden implicit behavior
- No “magic” fields without clear rules
- Changes must preserve:
  - Data compatibility
  - Scheduling invariants
  - Lock correctness

---

## Non-Goals

This project intentionally does **not** aim to:
- Replace Home Assistant automations
- Sync with external task systems
- Use HA Todo entities as the primary model
- Require MQTT or helpers

---

## Current Status

As of this AGENTS.md:
- Tasks can be created, edited, deleted from the dashboard
- Start/Pause/Complete works
- Due dates recalculate correctly on edit
- Last done is visible in the UI
- Custom dashboard is the primary interaction surface

Future work is expected to iterate on:
- Filtering (by zone, overdue, due soon)
- UX polish
- Multi-user affordances
- Export / backup (optional)

---

## When in Doubt

If an agent must choose between:
- “More flexible but ambiguous”
- “More constrained but predictable”

Choose **predictable**.

