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

Plugins inherit the app's theme automatically via CSS variables. **Never hardcode colors.** Use the app's `.tl-` prefixed CSS classes and CSS variables.

### Layout Pattern

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

### Available CSS Classes

| Class | Purpose |
|-------|---------|
| `.tl-view` | Root container (full height, inherits theme) |
| `.tl-header` | Header bar with border |
| `.tl-header-left` / `.tl-header-right` | Header sections |
| `.tl-title` | Section title (16px, semibold) |
| `.tl-subtitle` | Muted subtitle (13px) |
| `.tl-content` | Scrollable content area |
| `.tl-cards` | Grid of stat cards |
| `.tl-card` | Individual card |
| `.tl-card-label` | Card label (uppercase, small) |
| `.tl-card-value` | Card value (24px, bold) |
| `.tl-btn` | Base button class |
| `.tl-btn-primary` | Primary action button (accent color) |
| `.tl-btn-secondary` | Secondary button (subtle) |
| `.tl-btn-danger` | Destructive action button |
| `.tl-btn-text` | Minimal text button |
| `.tl-table` | Data table |
| `.tl-input` | Text input |
| `.tl-select` | Dropdown select |
| `.tl-badge` | Status badge |
| `.tl-empty` | Empty state container |
| `.tl-loading` / `.tl-spinner` | Loading state |
| `.tl-mono` | Monospace text |
| `.tl-muted` | Muted text color |
| `.tl-positive` / `.tl-negative` | Income/expense colors |

### CSS Variables (for custom styles)

```css
/* Backgrounds */
var(--bg-primary)       /* Main background */
var(--bg-secondary)     /* Cards, sections */
var(--bg-tertiary)      /* Subtle backgrounds */

/* Text */
var(--text-primary)     /* Main text */
var(--text-secondary)   /* Secondary text */
var(--text-muted)       /* Labels, hints */

/* Borders */
var(--border-primary)   /* Standard borders */

/* Accents */
var(--accent-primary)   /* Primary accent (green) */
var(--accent-success)   /* Success state */
var(--accent-warning)   /* Warning state */
var(--accent-danger)    /* Error/danger state */

/* Semantic */
var(--color-positive)   /* Income/positive */
var(--color-negative)   /* Expense/negative */

/* Other */
var(--code-bg)          /* Code block background */
var(--font-sans)        /* System font */
var(--font-mono)        /* Monospace font */
var(--spacing-xs/sm/md/lg/xl)  /* 4/8/12/16/24px */
var(--radius-sm/md/lg)  /* 4/6/8px */
```

### Styling Rules

- **DO** use `.tl-*` classes for standard UI elements
- **DO** use CSS variables for any custom styles
- **DO NOT** hardcode colors (no `#ffffff`, `#1a1a1a`, etc.)
- **DO NOT** manually track theme with `sdk.theme.subscribe()` for styling — CSS variables handle it automatically
- **DO NOT** use `.dark` class toggles — the app's theme system sets variables on the root

Theme tracking via `sdk.theme.current()` is still useful for non-CSS purposes (e.g., chart library themes, canvas rendering).

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
