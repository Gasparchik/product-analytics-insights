# TaskFlow Demo Dataset

Synthetic SaaS dataset for **TaskFlow** — a team task manager with Free/Paid plans.

**5,000 users · ~70,000 events · 60-day window (2024-03-01 to 2024-04-30)**

Generated with a fixed random seed (42) — fully reproducible.

---

## Dataset Schema

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | string | Unique user identifier (`u_00001`…`u_05000`) |
| `timestamp` | datetime | Event timestamp (`YYYY-MM-DD HH:MM:SS`) |
| `event_name` | string | One of 8 event types below |
| `platform` | string | `Web`, `iOS`, or `Android` |
| `channel` | string | Acquisition channel |
| `plan` | string | `free` or `paid` |
| `task_count` | int | Number of tasks (for task events) |
| `project_id` | string | Project identifier |

**Events:** `signup`, `project_created`, `task_created`, `task_completed`, `team_invited`, `integration_connected`, `export_data`, `subscription_started`

**Channels:** Organic (30%), Google Ads (30%), Product Hunt (20%), Referral (20%)

**Platforms:** Web (50%), iOS (30%), Android (20%)

---

## Baked-in Patterns

### Pattern 1 — Google Ads Retention Drop
- Google Ads drives ~30% of signups but has **D7 retention of ~12%** vs ~32% for other channels
- Root cause in data: Google Ads users don't reach `project_created` within their first session (delayed by 1–7 days vs 20–90 min for others), so they never experience the core value
- **AI should surface:** low retention for Google Ads channel + compare segments by channel

### Pattern 2 — Power Users + Integrations
- Top ~10% of users (power users) generate ~55% of all events
- **90% of power users** connect `integration_connected` within the first 3 days vs ~15% of others
- **AI should surface:** integration_connected as the strongest early retention signal + find_correlations

### Pattern 3 — Signup → First Value Funnel Drop
- Funnel from signup: **signup → 65% project_created → 45% task_created → 35% task_completed**
- Largest absolute drop is between signup and project_created (35% of new users never create a project)
- **AI should surface:** funnel analysis with the signup → project_created gap as the key leak

### Pattern 4 — Platform Retention Gap
- D7 retention by platform: **Web 35%, iOS 28%, Android 18%**
- Android users also use `team_invited` at only ~38% the rate of other platforms (collaboration feature underperforms on mobile)
- **AI should surface:** Android retention gap + suggest investigating mobile onboarding

### Pattern 5 — team_invited as Monetization Signal
- Overall paid conversion from free plan: **~8%**
- Users who triggered `team_invited`: **22% paid conversion**
- Users who never invited teammates: **3% paid conversion**
- **AI should surface:** team_invited as the leading indicator for subscription + correlation analysis

### Pattern 6 — Day 35 Anomaly
- On the 35th day of the observation period (2024-04-04), **DAU drops ~30%** below the trend line
- All event types are equally affected (not a specific feature issue)
- **AI should surface:** unusual DAU dip visible on the daily active users chart

---

## Generation Notes

- Behavioral types: `power` (~10%), `regular` (~30%), `casual` (~30%), `churned` (~30%)
- Google Ads channel overweights churned/casual users, driving the retention gap
- Retention on exactly D7/D14/D30 is explicitly seeded per user to match target rates
- Day 35 anomaly applied post-generation by removing 30% of that day's events
- `team_invited → subscription_started` relationship is probabilistic: 22% vs 3% base conversion rate
