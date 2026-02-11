<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { PluginSDK } from "@treeline-money/plugin-sdk";

  // Props passed by Treeline when mounting the view
  interface Props {
    sdk: PluginSDK;
  }
  let { sdk }: Props = $props();

  // State
  let accountCount = $state(0);
  let transactionCount = $state(0);
  let monthlySpending = $state(0);
  let isLoading = $state(true);

  // Unsubscribe function for data refresh
  let unsubscribe: (() => void) | null = null;

  onMount(async () => {
    // Subscribe to data refresh events
    unsubscribe = sdk.onDataRefresh(() => {
      loadData();
    });

    // Load initial data
    await loadData();
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  async function loadData() {
    isLoading = true;
    try {
      // Use sdk.query() to fetch data
      const accounts = await sdk.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM accounts"
      );
      accountCount = accounts[0]?.count ?? 0;

      const transactions = await sdk.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM transactions"
      );
      transactionCount = transactions[0]?.count ?? 0;

      const spending = await sdk.query<{ total: number }>(
        "SELECT COALESCE(SUM(-amount), 0) as total FROM transactions WHERE amount < 0 AND posted_date >= DATE_TRUNC('month', CURRENT_DATE)"
      );
      monthlySpending = spending[0]?.total ?? 0;
    } catch (e) {
      sdk.toast.error("Failed to load data", e instanceof Error ? e.message : String(e));
    } finally {
      isLoading = false;
    }
  }

  function showToastDemo() {
    sdk.toast.success("Hello from plugin!", "Toast notifications work great");
  }

  function openQueryView() {
    // Navigate to another view
    sdk.openView("query", {
      initialQuery: "SELECT * FROM transactions LIMIT 10"
    });
  }
</script>

<!-- Use .tl-view for the root container - inherits app theme automatically -->
<div class="tl-view">
  <div class="tl-header">
    <div class="tl-header-left">
      <h1 class="tl-title">Hello World Plugin</h1>
      <p class="tl-subtitle">
        This plugin demonstrates the Treeline Plugin SDK.
      </p>
    </div>
  </div>

  <div class="tl-content">
    <!-- Use .tl-cards / .tl-card for stat cards -->
    <div class="tl-cards">
      <div class="tl-card">
        <span class="tl-card-label">Accounts</span>
        <span class="tl-card-value">{isLoading ? "..." : accountCount}</span>
      </div>
      <div class="tl-card">
        <span class="tl-card-label">Transactions</span>
        <span class="tl-card-value">{isLoading ? "..." : transactionCount}</span>
      </div>
      <div class="tl-card">
        <span class="tl-card-label">Spending This Month</span>
        <span class="tl-card-value">{isLoading ? "..." : sdk.currency.format(monthlySpending)}</span>
      </div>
    </div>

    <div class="actions">
      <button class="tl-btn tl-btn-primary" onclick={showToastDemo}>
        Show Toast
      </button>
      <button class="tl-btn tl-btn-secondary" onclick={openQueryView}>
        Open Query View
      </button>
      <button class="tl-btn tl-btn-secondary" onclick={loadData}>
        Refresh Data
      </button>
    </div>

    <div class="info-section">
      <h2 class="tl-title">SDK Features</h2>
      <ul>
        <li><code>sdk.query(sql)</code> - Read data from the database</li>
        <li><code>sdk.execute(sql)</code> - Write to your plugin's tables</li>
        <li><code>sdk.toast.success/error/info()</code> - Show notifications</li>
        <li><code>sdk.openView(viewId, props)</code> - Navigate to views</li>
        <li><code>sdk.onDataRefresh(callback)</code> - React to data changes</li>
        <li><code>sdk.currency.format(amount)</code> - Format as currency</li>
        <li><code>sdk.settings.get/set()</code> - Persist plugin settings</li>
      </ul>
    </div>
  </div>
</div>

<style>
  /* Actions row */
  .actions {
    display: flex;
    gap: var(--spacing-md, 12px);
    margin-bottom: var(--spacing-lg, 16px);
  }

  /* Info callout section */
  .info-section {
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md, 6px);
    padding: var(--spacing-lg, 16px);
  }

  code {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 13px;
    background: var(--code-bg, var(--bg-tertiary));
    padding: 2px 6px;
    border-radius: var(--radius-sm, 4px);
  }

  ul {
    margin: var(--spacing-sm, 8px) 0 0;
    padding-left: 20px;
  }

  li {
    margin-bottom: var(--spacing-sm, 8px);
    font-size: 13px;
    color: var(--text-secondary);
  }
</style>
