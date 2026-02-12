---
name: plugin-dev
description: Help develop a Treeline plugin (create, build, test, publish)
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

# Treeline Plugin Development

You are helping a developer build a Treeline plugin. Treeline is a local-first personal finance desktop app (Tauri + Svelte). Plugins extend the app with new views and commands.

## Architecture

- Plugins are single ES module bundles (`index.js`) + `manifest.json`
- Each plugin bundles its own Svelte 5 runtime (no shared runtime)
- Plugins run in the app's webview, not sandboxed
- Installed to `~/.treeline/plugins/<id>/`
- Types come from `@treeline-money/plugin-sdk` (npm package)

## Plugin Structure

```
my-plugin/
├── manifest.json      # ID, name, version, permissions
├── src/
│   ├── index.ts       # Entry point - exports `plugin` object
│   └── *View.svelte   # Svelte 5 components (use $props, $state)
├── vite.config.ts     # Build config (auto-handles dev/prod output)
├── package.json
└── dist/
    └── index.js       # Built bundle (generated)
```

## Creating a New Plugin

```bash
tl plugin new my-plugin
cd my-plugin
npm install
```

This creates a fully working template with customized IDs and names.

## Dev Workflow (Hot-Reload)

```bash
# One-time: install to register the plugin with the app
npm run build
tl plugin install .

# Enable hot-reload in Treeline: Settings > Plugin Hot-Reload > On

# Start dev mode - builds directly to ~/.treeline/plugins/<id>/
npm run dev
```

In watch mode (`npm run dev`), vite builds directly to the installed plugin directory. With hot-reload enabled in Treeline, the app picks up changes automatically — no restart needed.

**Note:** Migrations are skipped during hot-reload. Restart the app after adding new migrations.

## Key Files

### manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "What it does",
  "author": "Your Name",
  "main": "index.js",
  "permissions": {
    "read": ["transactions", "accounts"],
    "schemaName": "plugin_my_plugin"
  }
}
```

### src/index.ts (Entry Point)

```typescript
import type { Plugin, PluginContext, PluginSDK } from "@treeline-money/plugin-sdk";
import MyView from "./MyView.svelte";
import { mount, unmount } from "svelte";

export const plugin: Plugin = {
  manifest: {
    id: "my-plugin",
    name: "My Plugin",
    version: "0.1.0",
    description: "...",
    author: "...",
    permissions: {
      read: ["transactions", "accounts"],
      schemaName: "plugin_my_plugin",
    },
  },

  activate(context: PluginContext) {
    context.registerView({
      id: "my-plugin-view",
      name: "My Plugin",
      icon: "zap",
      mount: (target: HTMLElement, props: { sdk: PluginSDK }) => {
        const instance = mount(MyView, { target, props });
        return () => unmount(instance);
      },
    });

    context.registerSidebarItem({
      sectionId: "main",
      id: "my-plugin",
      label: "My Plugin",
      icon: "zap",
      viewId: "my-plugin-view",
    });
  },

  deactivate() {
    // Cleanup (optional)
  },
};
```

### Svelte View Component

```svelte
<script lang="ts">
  import type { PluginSDK } from "@treeline-money/plugin-sdk";

  interface Props {
    sdk: PluginSDK;
  }
  let { sdk }: Props = $props();

  let data = $state([]);

  sdk.onDataRefresh(() => loadData());

  async function loadData() {
    data = await sdk.query("SELECT * FROM transactions ORDER BY posted_date DESC LIMIT 10");
  }
</script>
```

## SDK Quick Reference

| Method | What it does |
|--------|--------------|
| `sdk.query(sql, params?)` | Read data (returns array of objects) |
| `sdk.execute(sql, params?)` | Write to your plugin's tables only |
| `sdk.toast.success/error/info/warning(msg, desc?)` | Show notifications |
| `sdk.openView(viewId, props?)` | Navigate to another view |
| `sdk.onDataRefresh(callback)` | React when data changes (sync/import) |
| `sdk.emitDataRefresh()` | Notify other views that data changed |
| `sdk.updateBadge(count)` | Set badge count on sidebar item |
| `sdk.theme.current()` | Get "light" or "dark" |
| `sdk.theme.subscribe(callback)` | React to theme changes |
| `sdk.settings.get/set()` | Persist plugin settings |
| `sdk.state.read/write()` | Ephemeral runtime state |
| `sdk.modKey` | "Cmd" on Mac, "Ctrl" on Windows |
| `sdk.currency.format(amount)` | Format as currency (e.g., "$1,234.56") |
| `sdk.currency.formatCompact(amount)` | Compact format (e.g., "$1.2M") |

## Database Schema Reference

**CRITICAL: These are the ONLY tables available to plugins. There are no `budgets`, `categories`, `tags`, `users`, or other tables. Do not invent or assume tables that are not listed here.** If the plugin needs additional data, create tables in the plugin's own schema via migrations.

Plugins query these views (not the underlying `sys_*` tables). Declare needed views in `permissions.read`.

### `transactions` view

| Column | Type | Description |
|--------|------|-------------|
| `transaction_id` | VARCHAR | Unique identifier |
| `account_id` | VARCHAR | Foreign key to accounts |
| `amount` | DECIMAL(15,2) | Transaction amount (negative = expense, positive = income) |
| `description` | VARCHAR | Transaction description |
| `transaction_date` | DATE | Date of transaction |
| `posted_date` | DATE | Date posted to account |
| `tags` | VARCHAR[] | Array of tag strings |
| `parent_transaction_id` | VARCHAR | Parent if this is a split child |
| `tags_auto_applied` | BOOLEAN | Were tags auto-applied by rules? |
| `source` | VARCHAR | Origin: 'simplefin', 'csv_import', 'split', 'manual', etc. |
| `account_name` | VARCHAR | Account display name (joined) |
| `account_type` | VARCHAR | Account type (joined) |
| `currency` | VARCHAR | ISO 4217 currency code (joined) |
| `institution_name` | VARCHAR | Bank/provider name (joined) |

**Important:** There is NO `id` column. Use `transaction_id` as the primary key.

### `accounts` view

| Column | Type | Description |
|--------|------|-------------|
| `account_id` | VARCHAR | Unique identifier |
| `name` | VARCHAR | Account display name |
| `nickname` | VARCHAR | Optional nickname |
| `account_type` | VARCHAR | Type: depository, investment, credit, loan, etc. |
| `currency` | VARCHAR | ISO 4217 currency code |
| `balance` | DECIMAL(15,2) | Latest known balance (from provider sync) |
| `institution_name` | VARCHAR | Bank/provider name |
| `classification` | VARCHAR | 'asset' or 'liability' |
| `is_manual` | BOOLEAN | True if manually created |
| `created_at` | TIMESTAMP | When account was added |
| `updated_at` | TIMESTAMP | Last modification time |

**Important:** There is NO `id` column. Use `account_id` as the primary key. The `balance` column comes from provider sync and may not reflect calculated balances.

### `balance_snapshots` view

| Column | Type | Description |
|--------|------|-------------|
| `snapshot_id` | VARCHAR | Unique identifier |
| `account_id` | VARCHAR | Foreign key to accounts |
| `balance` | DECIMAL(15,2) | Balance at snapshot time |
| `snapshot_time` | TIMESTAMP | When this balance was recorded |
| `source` | VARCHAR | Origin: 'sync', 'manual', 'backfill' |
| `account_name` | VARCHAR | Account display name (joined) |
| `institution_name` | VARCHAR | Bank/provider name (joined) |

### Common Query Examples

```sql
-- Recent transactions
SELECT description, amount, posted_date, account_name
FROM transactions ORDER BY posted_date DESC LIMIT 20

-- Monthly spending by account
SELECT account_name, SUM(-amount) as spent
FROM transactions
WHERE amount < 0 AND posted_date >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY account_name ORDER BY spent DESC

-- Transaction count per tag
SELECT UNNEST(tags) as tag, COUNT(*) as cnt
FROM transactions GROUP BY tag ORDER BY cnt DESC

-- Latest balance per account
SELECT account_id, account_name, balance, snapshot_time
FROM balance_snapshots
WHERE (account_id, snapshot_time) IN (
  SELECT account_id, MAX(snapshot_time) FROM balance_snapshots GROUP BY account_id
)

-- Account summary
SELECT name, account_type, classification, institution_name
FROM accounts ORDER BY name
```

## Database Permissions

- **Read declared tables:** List tables in `manifest.json` → `permissions.read`
- **Write to own schema:** Plugins automatically have write access to `plugin_{id}.*`
- **Schema naming:** Each plugin gets a schema like `plugin_my_plugin` (underscores replace hyphens)
- **Create schema first:** `await sdk.execute('CREATE SCHEMA IF NOT EXISTS plugin_my_plugin')`

## Styling

Plugins inherit the app's theme automatically via CSS variables. **Never hardcode colors.** Use `.tl-` prefixed CSS classes and CSS variables for everything.

### Design Philosophy

- **Horizontal lines only** — tables use horizontal row separators, never vertical column borders
- **Minimal chrome** — no heavy borders, shadows, or decorative elements. Content-focused.
- **Density** — compact 13px base font, tight spacing. Finance UIs show lots of data.
- **Monospace for numbers** — all monetary amounts and numeric data use monospace font for alignment
- **No inline styles** — always use `<style>` blocks or `.tl-*` classes. Inline `style=` attributes may not render reliably in the plugin webview context.

### Page Layout

Every plugin view should use this structure:

```svelte
<div class="tl-view">
  <div class="tl-header">
    <div class="tl-header-left">
      <h1 class="tl-title">My Plugin</h1>
      <p class="tl-subtitle">Description here</p>
    </div>
    <div class="tl-header-right">
      <button class="tl-btn tl-btn-primary">Action</button>
    </div>
  </div>
  <div class="tl-content">
    <!-- Your content here -->
  </div>
</div>
```

### Complete Table Example

```svelte
<div class="tl-table-container">
  <table class="tl-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Account</th>
        <th style:text-align="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      {#each transactions as t}
        <tr>
          <td class="tl-cell-date">{t.posted_date}</td>
          <td>{t.description}</td>
          <td class="tl-muted">{t.account_name}</td>
          <td class={t.amount >= 0 ? "tl-cell-positive" : "tl-cell-negative"}>
            {sdk.currency.format(t.amount)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

### All Available CSS Classes

**Layout:**

| Class | Purpose |
|-------|---------|
| `.tl-view` | Root container (full height, themed background and text) |
| `.tl-header` | Header bar with bottom border, secondary background |
| `.tl-header-left` / `.tl-header-right` | Flex sections within header |
| `.tl-title` | Section title (16px, semibold) |
| `.tl-subtitle` | Muted subtitle text (13px) |
| `.tl-content` | Scrollable content area with padding |

**Cards:**

| Class | Purpose |
|-------|---------|
| `.tl-cards` | Grid container (auto-fit, min 150px columns) |
| `.tl-card` | Individual card (secondary bg, border, rounded) |
| `.tl-card-label` | Uppercase label (11px, muted) |
| `.tl-card-value` | Large value (24px, bold) |
| `.tl-card-value-sm` | Smaller value variant (18px) |

**Tables:**

| Class | Purpose |
|-------|---------|
| `.tl-table-container` | Scrollable wrapper for wide tables |
| `.tl-table` | Table element (full width, 13px, collapsed borders) |
| `.tl-sortable` | On `<th>` — clickable sort header |
| `.tl-sorted` | On `<th>` — accent-colored active sort |
| `.tl-cell-date` | Muted, 12px date text |
| `.tl-cell-mono` | Monospace text |
| `.tl-cell-number` | Right-aligned monospace (for numeric columns) |
| `.tl-cell-positive` | Green monospace (income/positive amounts) |
| `.tl-cell-negative` | Red monospace (expense/negative amounts) |
| `.tl-cell-actions` | Right-aligned flex container for row action buttons |
| `.tl-selected` | On `<tr>` — active/highlighted row |
| `.tl-muted` (on `<tr>`) | Dimmed row (opacity 0.5) |

**Buttons:**

| Class | Purpose |
|-------|---------|
| `.tl-btn` | Base button (required, combine with variant) |
| `.tl-btn-primary` | Accent-colored action button |
| `.tl-btn-secondary` | Subtle button with border |
| `.tl-btn-danger` | Red destructive button |
| `.tl-btn-text` | Minimal text-only button |
| `.tl-btn-icon` | Square 28px icon-only button |

**Forms:**

| Class | Purpose |
|-------|---------|
| `.tl-input` | Text input (themed, focus ring) |
| `.tl-select` | Dropdown select (themed, custom arrow) |
| `.tl-checkbox` | Checkbox + label wrapper |
| `.tl-label` | Form field label (12px, secondary) |
| `.tl-form-group` | Vertical group with spacing |

**Badges:**

| Class | Purpose |
|-------|---------|
| `.tl-badge` | Base badge (accent color) |
| `.tl-badge-success` / `-warning` / `-danger` / `-muted` | Color variants |

**States:**

| Class | Purpose |
|-------|---------|
| `.tl-empty` | Centered empty state container |
| `.tl-empty-icon` | Large faded icon (48px) |
| `.tl-empty-title` | Empty state heading |
| `.tl-empty-message` | Empty state description (max 400px) |
| `.tl-loading` | Centered loading container |
| `.tl-spinner` | Animated spinning circle |

**Utilities:**

| Class | Purpose |
|-------|---------|
| `.tl-mono` | Monospace font |
| `.tl-muted` | Muted text color |
| `.tl-positive` / `.tl-negative` | Semantic income/expense colors |
| `.tl-text-sm` | 12px text |
| `.tl-text-xs` | 11px text |
| `.tl-font-semibold` | Font weight 600 |
| `.tl-truncate` | Ellipsis overflow |
| `.tl-gap-sm` / `.tl-gap-md` | Flex/grid gap (8px / 12px) |
| `.tl-mt-md` / `.tl-mb-md` | Margin top/bottom (12px) |

### CSS Variables (for custom styles)

When `.tl-*` classes don't cover your use case, use CSS variables in a `<style>` block:

```svelte
<style>
  .my-section-header {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: var(--spacing-lg) 0 var(--spacing-sm);
  }

  .my-highlight-row {
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
  }
</style>
```

**Available variables:**

```
--bg-primary / --bg-secondary / --bg-tertiary   Backgrounds
--text-primary / --text-secondary / --text-muted Text colors
--border-primary / --border-secondary            Borders
--accent-primary / --accent-success / --accent-warning / --accent-danger
--color-positive / --color-negative              Semantic colors
--code-bg                                        Code background
--font-sans / --font-mono                        Font families
--spacing-xs (4) / -sm (8) / -md (12) / -lg (16) / -xl (24)
--radius-sm (4) / -md (6) / -lg (8)             Border radii
--shadow-sm / --shadow-md / --shadow-lg          Box shadows
```

### Chart.js Integration

Charts need special handling for theme and sizing:

```svelte
<script lang="ts">
  import { Chart } from "chart.js/auto";
  import { onMount, onDestroy } from "svelte";

  let canvas: HTMLCanvasElement;
  let chart: Chart;

  function getChartColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      text: style.getPropertyValue("--text-primary").trim(),
      muted: style.getPropertyValue("--text-muted").trim(),
      border: style.getPropertyValue("--border-primary").trim(),
      accent: style.getPropertyValue("--accent-primary").trim(),
      positive: style.getPropertyValue("--color-positive").trim(),
      negative: style.getPropertyValue("--color-negative").trim(),
    };
  }

  function createChart() {
    const colors = getChartColors();
    chart = new Chart(canvas, {
      type: "bar",
      data: { /* ... */ },
      options: {
        animation: false,           // Prevents jank during hot-reload
        responsive: true,
        maintainAspectRatio: false,  // Required — use container height
        scales: {
          x: { ticks: { color: colors.muted }, grid: { color: colors.border } },
          y: { ticks: { color: colors.muted }, grid: { color: colors.border } },
        },
      },
    });
  }

  onMount(() => createChart());
  onDestroy(() => chart?.destroy());

  // Re-create chart on theme change
  sdk.theme.subscribe(() => {
    chart?.destroy();
    createChart();
  });
</script>

<!-- IMPORTANT: Fixed-height container prevents infinite expansion -->
<div style:height="300px">
  <canvas bind:this={canvas}></canvas>
</div>
```

**Chart.js gotchas:**
- **Must use a fixed-height container** — without it, `responsive: true` causes infinite growth
- **Set `animation: false`** — prevents jank during hot-reload rebuilds
- **Set `maintainAspectRatio: false`** — lets the container control dimensions
- **Read CSS variables with `getComputedStyle`** for theme-aware colors
- **Re-create on theme change** — Chart.js doesn't support live color updates; destroy and re-create

### Styling Rules

- **DO** use `.tl-*` classes for all standard UI elements
- **DO** use CSS variables in `<style>` blocks for custom styles
- **DO** use `.tl-cell-positive` / `.tl-cell-negative` for money columns in tables
- **DO NOT** hardcode colors (no `#ffffff`, `#1a1a1a`, etc.)
- **DO NOT** use inline `style="..."` attributes — they may not render; use `<style>` blocks instead
- **DO NOT** add vertical borders to tables — the design uses horizontal separators only
- **DO NOT** manually track theme with `sdk.theme.subscribe()` for CSS styling — CSS variables handle it
- **DO NOT** use `.dark` class toggles — the theme system sets variables on the root

`sdk.theme.current()` is still needed for non-CSS purposes (Chart.js colors, canvas rendering, etc.).

## Migrations (Optional)

```typescript
export const plugin: Plugin = {
  manifest: { ... },
  migrations: [
    {
      version: 1,
      name: "create_data_table",
      up: `
        CREATE SCHEMA IF NOT EXISTS plugin_my_plugin;
        CREATE TABLE plugin_my_plugin.data (
          id VARCHAR PRIMARY KEY,
          value INTEGER
        )
      `,
    },
  ],
  activate(context) { ... },
};
```

Migrations run automatically on app startup, tracked in `plugin_{id}.schema_migrations`.

## Icons

Use Lucide icon names: `target`, `repeat`, `shield`, `wallet`, `credit-card`, `chart-line`, `tag`, `database`, `zap`, `calendar`, `file-text`, `settings`, `gift`, `piggy-bank`, `activity`

## Publishing

```bash
# 1. Create a GitHub release
./scripts/release.sh 0.1.0

# 2. Submit to community plugins - PR to treeline repo adding to plugins.json:
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "What it does",
  "author": "Your Name",
  "repo": "https://github.com/you/my-plugin"
}
```

## Common Patterns

### Loading state
```typescript
let isLoading = $state(true);
try {
  const data = await sdk.query("SELECT ...");
} finally {
  isLoading = false;
}
```

### Format currency
```typescript
const formatted = sdk.currency.format(1234.56); // "$1,234.56"
```

### Parameterized queries
```typescript
const results = await sdk.query(
  "SELECT * FROM transactions WHERE amount > ? AND account_name = ?",
  [100, "Checking"]
);
```

## Don'ts

- Don't write to tables not in your permissions (will throw)
- Don't hardcode colors — use CSS variables and `.tl-*` classes
- Don't manually toggle `.dark` class — CSS variables handle theming
- Don't bundle heavy dependencies (keep plugins lightweight)
- Don't use `sdk.execute()` for SELECT queries (use `sdk.query()`)
- Don't use shared Svelte — each plugin bundles its own runtime
- Don't use `id` as a column name — transactions use `transaction_id`, accounts use `account_id`
- Don't assume tables exist beyond `transactions`, `accounts`, and `balance_snapshots` — there are no `budgets`, `categories`, `tags`, or `users` tables
