DOMAIN = "maintenance"

PLATFORMS = ["todo", "select", "button", "sensor"]

STORE_VERSION = 1
STORE_KEY = f"{DOMAIN}_store_v{STORE_VERSION}"

CONF_NAME = "name"
DEFAULT_NAME = "Maintenance"

SERVICE_ADD_TASK = "add_task"
SERVICE_UPDATE_TASK = "update_task"
SERVICE_DELETE_TASK = "delete_task"
SERVICE_START_TASK = "start_task"
SERVICE_PAUSE_TASK = "pause_task"
SERVICE_COMPLETE_TASK = "complete_task"

ATTR_TASK_ID = "task_id"
ATTR_TITLE = "title"
ATTR_ZONE = "zone"
ATTR_FREQ_DAYS = "freq_days"
ATTR_DUE = "due"
ATTR_NOTES = "notes"
ATTR_USER = "user"
ATTR_MANUAL_MIN = "manual_minutes"

STATUS_IDLE = "idle"
STATUS_RUNNING = "running"
STATUS_PAUSED = "paused"

