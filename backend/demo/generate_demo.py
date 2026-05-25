"""Generate a synthetic demo dataset (TaskFlow SaaS task manager).

5,000 users, ~80,000 events, 60-day window.
6 baked-in patterns for AI insights to surface.

Run: python -m backend.demo.generate_demo
Output: backend/demo/demo_dataset.csv
"""

import csv
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
SEED = 42
rng = np.random.default_rng(SEED)

OUTPUT_DIR = Path(__file__).parent
START = datetime(2024, 3, 1)
PERIOD = 60
N_USERS = 5_000
ANOMALY_DAY_IDX = 34  # 0-based (35th day) — DAU drops ~30%

CHANNELS = ["Organic", "Google Ads", "Product Hunt", "Referral"]
CHAN_W = [0.30, 0.30, 0.20, 0.20]

PLATFORMS = ["Web", "iOS", "Android"]
PLAT_W = [0.50, 0.30, 0.20]

BEHAV_LABELS = ["churned", "casual", "regular", "power"]

# Behavioral type weights by channel — Pattern 1: Google Ads → mostly churned
BEHAV_W: dict[str, list[float]] = {
    "Google Ads":   [0.65, 0.25, 0.08, 0.02],
    "Organic":      [0.20, 0.32, 0.35, 0.13],
    "Product Hunt": [0.22, 0.34, 0.33, 0.11],
    "Referral":     [0.15, 0.28, 0.42, 0.15],
}

# D7 retention probability per (channel, platform) — Patterns 1 & 4
D7_P: dict[tuple[str, str], float] = {
    ("Google Ads",   "Web"):     0.15,
    ("Google Ads",   "iOS"):     0.12,
    ("Google Ads",   "Android"): 0.08,
    ("Organic",      "Web"):     0.38,
    ("Organic",      "iOS"):     0.30,
    ("Organic",      "Android"): 0.19,
    ("Product Hunt", "Web"):     0.35,
    ("Product Hunt", "iOS"):     0.27,
    ("Product Hunt", "Android"): 0.17,
    ("Referral",     "Web"):     0.40,
    ("Referral",     "iOS"):     0.32,
    ("Referral",     "Android"): 0.22,
}

# Funnel + feature event probabilities by behavior.
# task_created = P(user ever creates a task); controls funnel to ~45% of all users.
# task_completed = P(completed | task_created); controls funnel to ~35% of all users.
# Calibrated for mix: ~27% churned, ~35% casual, ~28% regular, ~10% power.
EVENT_P: dict[str, dict[str, float]] = {
    "churned": dict(
        project_created=0.30, task_created=0.10, task_completed=0.50,
        team_invited=0.04, integration_connected=0.02, export_data=0.01,
    ),
    "casual": dict(
        project_created=0.80, task_created=0.35, task_completed=0.60,
        team_invited=0.14, integration_connected=0.10, export_data=0.07,
    ),
    "regular": dict(
        project_created=0.95, task_created=0.72, task_completed=0.80,
        team_invited=0.28, integration_connected=0.18, export_data=0.15,
    ),
    "power": dict(
        project_created=0.99, task_created=0.99, task_completed=0.99,
        team_invited=0.82, integration_connected=0.92, export_data=0.72,
    ),
}

# Extra task/task_completed session counts (min, max)
SESSIONS: dict[str, tuple[int, int]] = {
    "churned": (0, 1),
    "casual":  (1, 5),
    "regular": (5, 12),
    "power":   (15, 40),
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _pick(options: list, weights: list, n: int | None = None):
    idx = rng.choice(len(options), size=n, p=weights)
    if n is None:
        return options[int(idx)]
    return [options[int(i)] for i in idx]


def _rh(lo: int = 8, hi: int = 22) -> int:
    return int(rng.integers(lo, hi))


def _ri(lo: int, hi: int) -> int:
    """Random int in [lo, hi)."""
    if lo >= hi:
        return lo
    return int(rng.integers(lo, hi))


# ── Event generation per user ──────────────────────────────────────────────────

def _user_events(u: dict) -> list[dict]:
    uid = u["user_id"]
    ch, pl, plan = u["channel"], u["platform"], u["plan"]
    reg_day, behav = u["reg_day"], u["behavior"]
    r_d7, r_d14, r_d30 = u["retained_d7"], u["retained_d14"], u["retained_d30"]

    signup_dt = START + timedelta(days=reg_day, hours=_rh(), minutes=_ri(0, 59))
    period_end = START + timedelta(days=PERIOD)

    def row(event_name: str, dt: datetime, task_count: int | str = "", project_id: str = ""):
        if dt >= period_end:
            return None
        return {
            "user_id": uid,
            "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"),
            "event_name": event_name,
            "platform": pl,
            "channel": ch,
            "plan": plan,
            "task_count": str(task_count) if task_count != "" else "",
            "project_id": project_id,
        }

    evts: list[dict] = []

    def add(event_name, dt, **kw):
        r = row(event_name, dt, **kw)
        if r:
            evts.append(r)
        return r is not None

    probs = EVENT_P[behav].copy()

    # Pattern 1: Google Ads → low first-session engagement
    if ch == "Google Ads":
        probs["project_created"] = min(probs["project_created"], 0.42)
        probs["task_created"] = min(probs["task_created"], 0.25)

    # Pattern 4: Android → less team collaboration
    if pl == "Android":
        probs["team_invited"] *= 0.38

    pid = f"p_{_ri(1000, 9999)}"

    # signup (always)
    add("signup", signup_dt)

    # project_created
    unlocked_task = False  # tracks whether user reached task_created stage
    if rng.random() < probs["project_created"]:
        if ch == "Google Ads":
            # Delayed: 1–7 days after signup (no first-session value)
            pc_dt = signup_dt + timedelta(days=_ri(1, 8), hours=_rh())
        else:
            # Within first session: 20–90 min
            pc_dt = signup_dt + timedelta(minutes=_ri(20, 90))
        add("project_created", pc_dt, project_id=pid)

        # task_created follows project_created (P controls ~45% of ALL users)
        if rng.random() < probs["task_created"]:
            tc_dt = pc_dt + timedelta(hours=_ri(1, 12))
            add("task_created", tc_dt, task_count=1, project_id=pid)
            unlocked_task = True

            # task_completed: P(completed | task_created), controls ~35% of ALL users
            if rng.random() < probs["task_completed"]:
                tco_dt = tc_dt + timedelta(hours=_ri(2, 36))
                add("task_completed", tco_dt, task_count=1, project_id=pid)

    # team_invited (Pattern 5: drives subscription conversion)
    did_invite = rng.random() < probs["team_invited"]
    if did_invite:
        max_offset = max(2, PERIOD - reg_day - 2)
        ti_dt = signup_dt + timedelta(days=_ri(1, min(10, max_offset) + 1), hours=_rh())
        add("team_invited", ti_dt)

    # integration_connected (Pattern 2: power users connect within first 3 days)
    if rng.random() < probs["integration_connected"]:
        if behav == "power" and rng.random() < 0.90:
            ic_dt = signup_dt + timedelta(hours=_ri(2, 72))
        else:
            max_offset = max(2, PERIOD - reg_day - 2)
            ic_dt = signup_dt + timedelta(days=_ri(1, min(8, max_offset) + 1), hours=_rh())
        add("integration_connected", ic_dt)

    # export_data
    if rng.random() < probs["export_data"]:
        max_offset = max(4, PERIOD - reg_day - 2)
        ed_dt = signup_dt + timedelta(days=_ri(3, min(20, max_offset) + 1), hours=_rh())
        add("export_data", ed_dt)

    # subscription_started (Pattern 5: team_invited → 22% vs 3%)
    if plan == "free":
        sub_p = 0.22 if did_invite else 0.03
        if behav == "power":
            sub_p = min(0.65, sub_p * 3.0)
        elif behav == "regular":
            sub_p = min(0.18, sub_p * 1.5)
        if rng.random() < sub_p:
            max_offset = max(6, PERIOD - reg_day - 2)
            ss_dt = signup_dt + timedelta(days=_ri(5, min(28, max_offset) + 1), hours=_rh())
            add("subscription_started", ss_dt)

    # Retention-anchored events (Patterns 1 & 4: controls exact D7/D14/D30)
    base = signup_dt.replace(second=0, microsecond=0)
    if r_d7:
        d7 = base.replace(hour=_rh(), minute=_ri(0, 59)) + timedelta(days=7)
        add("task_created", d7, task_count=_ri(1, 6), project_id=pid)
    if r_d14:
        d14 = base.replace(hour=_rh(), minute=_ri(0, 59)) + timedelta(days=14)
        add("task_created", d14, task_count=_ri(1, 10), project_id=pid)
    if r_d30:
        d30 = base.replace(hour=_rh(), minute=_ri(0, 59)) + timedelta(days=30)
        add("task_created", d30, task_count=_ri(1, 15), project_id=pid)

    # Extra task sessions — only for users who unlocked task_created in the funnel.
    # This keeps task_created/task_completed funnel rates at targets (~45%/~35%).
    if unlocked_task:
        lo, hi = SESSIONS[behav]
        n_sessions = _ri(lo, hi + 1)
        sess_dt = signup_dt + timedelta(days=_ri(1, 3), hours=_rh())
        gap_ranges = {
            "churned": (24, 120), "casual": (12, 60),
            "regular": (8, 36), "power": (5, 20),
        }
        for _ in range(n_sessions):
            if sess_dt >= period_end:
                break
            task_num = _ri(1, 25)
            add("task_created", sess_dt, task_count=task_num, project_id=pid)
            if rng.random() < 0.80:
                done_dt = sess_dt + timedelta(hours=_ri(1, 20))
                add("task_completed", done_dt, task_count=task_num, project_id=pid)
            lo_g, hi_g = gap_ranges[behav]
            sess_dt += timedelta(hours=_ri(lo_g, hi_g))

    # Post-process: remove events on retention check days for non-retained users.
    # This ensures D7/D14/D30 retention rates match the targets by preventing
    # random sessions from inflating retention counts.
    from datetime import timedelta as _td
    sig_d = signup_dt.date()

    def day_str(n: int) -> str:
        return (sig_d + _td(days=n)).strftime("%Y-%m-%d")

    result = list(evts)
    if not r_d7 and reg_day + 7 < PERIOD:
        d7s = day_str(7)
        result = [e for e in result if not e["timestamp"].startswith(d7s)]
    if not r_d14 and reg_day + 14 < PERIOD:
        d14s = day_str(14)
        result = [e for e in result if not e["timestamp"].startswith(d14s)]
    if not r_d30 and reg_day + 30 < PERIOD:
        d30s = day_str(30)
        result = [e for e in result if not e["timestamp"].startswith(d30s)]

    return result


# ── Main generation ────────────────────────────────────────────────────────────

def generate_all() -> list[dict]:
    channels = _pick(CHANNELS, CHAN_W, n=N_USERS)
    platforms = _pick(PLATFORMS, PLAT_W, n=N_USERS)
    reg_days = rng.integers(0, PERIOD - 10, size=N_USERS)

    all_events: list[dict] = []

    for i in range(N_USERS):
        ch = channels[i]
        pl = platforms[i]
        reg_day = int(reg_days[i])

        behav = _pick(BEHAV_LABELS, BEHAV_W[ch])
        # Android: nudge some regular → casual (lower retention)
        if pl == "Android" and behav == "regular" and rng.random() < 0.22:
            behav = "casual"

        paid_p = {"churned": 0.0, "casual": 0.02, "regular": 0.10, "power": 0.55}[behav]
        plan = "paid" if rng.random() < paid_p else "free"

        d7_p = D7_P.get((ch, pl), 0.25)
        r_d7 = (reg_day + 7 < PERIOD) and bool(rng.random() < d7_p)
        r_d14 = r_d7 and (reg_day + 14 < PERIOD) and bool(rng.random() < 0.72)
        r_d30 = r_d14 and (reg_day + 30 < PERIOD) and bool(rng.random() < 0.60)

        user = {
            "user_id": f"u_{i + 1:05d}",
            "channel": ch, "platform": pl, "plan": plan,
            "behavior": behav, "reg_day": reg_day,
            "retained_d7": r_d7, "retained_d14": r_d14, "retained_d30": r_d30,
        }
        all_events.extend(_user_events(user))

    # Pattern 6: Day 35 anomaly — remove 30% of events
    anomaly_prefix = (START + timedelta(days=ANOMALY_DAY_IDX)).strftime("%Y-%m-%d")
    normal = [e for e in all_events if not e["timestamp"].startswith(anomaly_prefix)]
    anomaly = [e for e in all_events if e["timestamp"].startswith(anomaly_prefix)]
    keep = rng.random(len(anomaly)) > 0.30
    all_events = normal + [e for e, k in zip(anomaly, keep) if k]

    all_events.sort(key=lambda e: e["timestamp"])
    return all_events


# ── File writers ───────────────────────────────────────────────────────────────

FIELDNAMES = ["user_id", "timestamp", "event_name", "platform", "channel", "plan",
              "task_count", "project_id"]


def write_csv(events: list[dict]) -> Path:
    path = OUTPUT_DIR / "demo_dataset.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES)
        w.writeheader()
        w.writerows(events)
    return path


def write_mapping() -> Path:
    mapping = {
        "user_id": "user_id",
        "timestamp": "timestamp",
        "event_name": "event_name",
        "properties": "platform,channel,plan",
        "signup_event": "signup",
        "conversion_event": "subscription_started",
    }
    path = OUTPUT_DIR / "demo_mapping.json"
    path.write_text(json.dumps(mapping, indent=2))
    return path


def write_metadata(n_events: int) -> Path:
    meta = {
        "name": "TaskFlow Demo Dataset",
        "description": "Synthetic SaaS task manager — 5k users, 60-day window, 6 baked-in patterns",
        "users": N_USERS,
        "events": n_events,
        "period_days": PERIOD,
        "start_date": START.isoformat(),
        "seed": SEED,
        "patterns": [
            "Pattern 1 — Google Ads retention: D7 ~12% vs ~32% for other channels",
            "Pattern 2 — Power users + integrations: 90% connect integration in first 3 days vs 15% others",
            "Pattern 3 — Signup funnel: signup → 65% project_created → 45% task_created → 35% task_completed",
            "Pattern 4 — Platform retention: Web 35%, iOS 28%, Android 18% at D7",
            "Pattern 5 — Monetization: team_invited users 22% paid conversion vs 3% without",
            "Pattern 6 — Day 35 anomaly: DAU drops ~30% from trend",
        ],
    }
    path = OUTPUT_DIR / "demo_metadata.json"
    path.write_text(json.dumps(meta, indent=2))
    return path


# ── Entry point ────────────────────────────────────────────────────────────────

def generate():
    logger.info("Generating TaskFlow demo dataset…")
    events = generate_all()

    csv_path = write_csv(events)
    write_mapping()
    write_metadata(len(events))

    users = len({e["user_id"] for e in events})
    signups = sum(1 for e in events if e["event_name"] == "signup")
    by_channel: dict[str, int] = {}
    for e in events:
        if e["event_name"] == "signup":
            by_channel[e["channel"]] = by_channel.get(e["channel"], 0) + 1

    logger.info("  %s users  |  %s events  |  %s signups", f"{users:,}", f"{len(events):,}", f"{signups:,}")
    logger.info("  Channel distribution: %s", by_channel)
    logger.info("  Output: %s", csv_path)
    return csv_path


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    generate()
    logger.info("Done.")
