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
  let theme = $state(sdk.theme.current());

  sdk.theme.subscribe(t => theme = t);
  sdk.onDataRefresh(() => loadData());

  async function loadData() {
    data = await sdk.query("SELECT * FROM transactions LIMIT 10");
  }
</script>
```

## SDK Quick Reference

| Method | What it does |
|--------|--------------|
| `sdk.query(sql)` | Read data (SELECT queries) |
| `sdk.execute(sql)` | Write to your plugin's tables only |
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

## Database Permissions

- **Read declared tables:** List tables in `manifest.json` → `permissions.read`
- **Write to own schema:** Plugins automatically have write access to `plugin_{id}.*`
- **Schema naming:** Each plugin gets a schema like `plugin_my_plugin` (underscores replace hyphens)
- **Create schema first:** `await sdk.execute('CREATE SCHEMA IF NOT EXISTS plugin_my_plugin')`

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

Use Lucide icon names: `target`, `repeat`, `shield`, `wallet`, `credit-card`, `chart`, `tag`, `database`, `zap`, `calendar`, `file-text`, `settings`, `gift`, `piggy-bank`, `activity`

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

### Dark mode support
```svelte
<div class="container" class:dark={theme === "dark"}>
```

### Format currency
```typescript
const formatted = sdk.currency.format(1234.56); // "$1,234.56"
```

## Don'ts

- Don't write to tables not in your permissions (will throw)
- Don't forget dark mode support
- Don't bundle heavy dependencies (keep plugins lightweight)
- Don't use `sdk.execute()` for SELECT queries (use `sdk.query()`)
- Don't use shared Svelte — each plugin bundles its own runtime
