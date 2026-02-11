/**
 * Plugin Hot-Reload
 *
 * Watches for file changes in external plugins and reloads them without restarting the app.
 * Uses the Rust file watcher backend to detect changes in ~/.treeline/plugins/.
 */

import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { registry } from "../sdk/registry";
import { themeManager } from "../sdk/theme";
import { getDisabledPlugins } from "../sdk/settings";
import type { Plugin, PluginContext } from "../sdk/types";
import type { ExternalPluginInfo } from "./types";

// Active plugin instances for deactivation during reload
const activePlugins = new Map<string, Plugin>();

// Event listener cleanup
let unlisten: UnlistenFn | null = null;

/**
 * Track an active plugin instance so we can call deactivate() on reload.
 * Called from initializePlugins() after a plugin is activated.
 */
export function trackActivePlugin(pluginId: string, plugin: Plugin): void {
  activePlugins.set(pluginId, plugin);
}

/**
 * Start hot-reload: watch the plugins directory and listen for change events.
 */
export async function startHotReload(): Promise<void> {
  // Start the file watcher on the Rust side
  await invoke("watch_plugins_dir");

  // Listen for change events from the backend
  unlisten = await listen<string>("plugin-file-changed", async (event) => {
    const pluginId = event.payload;
    console.log(`[hot-reload] Detected change in plugin: ${pluginId}`);

    try {
      await reloadPlugin(pluginId);
    } catch (error) {
      console.error(`[hot-reload] Failed to reload plugin ${pluginId}:`, error);
    }
  });

  console.log("[hot-reload] Plugin hot-reload started");
}

/**
 * Stop hot-reload: stop the file watcher and remove event listener.
 */
export async function stopHotReload(): Promise<void> {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }

  try {
    await invoke("unwatch_plugins_dir");
  } catch (error) {
    console.error("[hot-reload] Failed to stop file watcher:", error);
  }

  console.log("[hot-reload] Plugin hot-reload stopped");
}

/**
 * Reload a single external plugin by ID.
 */
async function reloadPlugin(pluginId: string): Promise<void> {
  // Skip disabled plugins
  const disabledPlugins = await getDisabledPlugins();
  if (disabledPlugins.includes(pluginId)) {
    console.log(`[hot-reload] Skipping disabled plugin: ${pluginId}`);
    return;
  }

  // 1. Remember open tabs for this plugin so we can restore them after reload
  const pluginViewIds = registry.getViewIdsForPlugin(pluginId);
  const openTabViewIds = registry.tabs
    .filter((t) => pluginViewIds.has(t.viewId))
    .map((t) => ({ viewId: t.viewId, wasActive: t.id === registry.activeTabId }));

  // 2. Call deactivate() on the old plugin instance if it exists
  const oldPlugin = activePlugins.get(pluginId);
  if (oldPlugin?.deactivate) {
    try {
      await oldPlugin.deactivate();
    } catch (error) {
      console.warn(`[hot-reload] deactivate() failed for ${pluginId}:`, error);
    }
  }

  // 3. Unregister everything the plugin has registered
  registry.unregisterPlugin(pluginId);
  activePlugins.delete(pluginId);

  // 4. Re-discover plugins to get fresh manifest from disk
  const discovered = await invoke<ExternalPluginInfo[]>("discover_plugins");
  const pluginInfo = discovered.find((p) => p.manifest.id === pluginId);

  if (!pluginInfo) {
    // Plugin was deleted - it's already unregistered, nothing more to do
    console.log(`[hot-reload] Plugin ${pluginId} removed (no longer on disk)`);
    return;
  }

  // 5. Re-import the JS module with cache-busting query parameter
  const pluginsDir = await invoke<string>("get_plugins_dir");
  const pluginPath = `${pluginsDir}/${pluginInfo.manifest.id}/${pluginInfo.manifest.main}`;
  const assetUrl = convertFileSrc(pluginPath);
  const cacheBustedUrl = `${assetUrl}?t=${Date.now()}`;

  let module: any;
  try {
    module = await import(/* @vite-ignore */ cacheBustedUrl);
  } catch (error) {
    console.error(`[hot-reload] Failed to import ${pluginId}:`, error);
    return;
  }

  if (!module.plugin) {
    console.error(`[hot-reload] Plugin ${pluginId} does not export 'plugin'`);
    return;
  }

  const plugin: Plugin = module.plugin;

  // NOTE: Migrations are intentionally skipped during hot-reload. Running them on every
  // file save would be destructive — a half-typed migration would execute and be recorded
  // as completed, with no rollback mechanism. Developers should restart the app to run
  // new migrations.

  // 6. Register permissions from the fresh manifest
  const permissions = pluginInfo.manifest.permissions ?? {};
  const tablePermissions = {
    read: permissions.read ?? permissions.tables?.read,
    write: permissions.write ?? permissions.tables?.write,
    create: permissions.create ?? permissions.tables?.create,
    schemaName: permissions.schemaName,
  };
  registry.setPluginPermissions(pluginId, tablePermissions);

  // 7. Create a fresh PluginContext and activate
  const context: PluginContext = {
    registerSidebarSection: registry.registerSidebarSection.bind(registry),
    registerSidebarItem: (item) =>
      registry.registerSidebarItem({ ...item, sectionId: "plugins" }),
    registerView: (view) => registry.registerView(view, pluginId),
    registerCommand: registry.registerCommand.bind(registry),
    registerStatusBarItem: registry.registerStatusBarItem.bind(registry),
    openView: registry.openView.bind(registry),
    executeCommand: registry.executeCommand.bind(registry),
    db: {} as any,
    theme: themeManager,
  };

  await plugin.activate(context);
  activePlugins.set(pluginId, plugin);

  // 8. Restore tabs that were open before the reload (if the view IDs still exist)
  let restoredActive = false;
  for (const { viewId, wasActive } of openTabViewIds) {
    if (registry.hasView(viewId)) {
      registry.openView(viewId);
      if (wasActive) restoredActive = true;
    }
  }
  // If the previously active tab was restored, make sure it's still active
  // (openView already sets it as active, so this handles the common case)
  if (restoredActive) {
    const restoredTab = registry.tabs.find((t) =>
      openTabViewIds.some((o) => o.wasActive && o.viewId === t.viewId)
    );
    if (restoredTab) {
      registry.setActiveTab(restoredTab.id);
    }
  }

  console.log(`[hot-reload] Reloaded plugin: ${plugin.manifest.name} (${pluginId})`);
}
