#!/usr/bin/env python3
"""
One-time migration script for community plugin tables.

Migrates old sys_plugin_* tables to new schema-qualified names:
- sys_plugin_cashflow_items -> plugin_cashflow.scheduled
- sys_plugin_goals -> plugin_goals.goals
- sys_plugin_subscriptions -> plugin_subscriptions.subscriptions
- sys_plugin_emergency_fund_config -> plugin_emergency_fund.config
- sys_plugin_emergency_fund_snapshots -> plugin_emergency_fund.snapshots

Usage:
    # For demo database (unencrypted):
    uv run python scripts/migrate_community_plugins.py --demo

    # For real database (encrypted):
    TL_DB_PASSWORD=yourpassword uv run python scripts/migrate_community_plugins.py
"""

import argparse
import os
import sys
from pathlib import Path

import duckdb

# Migration definitions: (old_table, new_schema, new_table)
MIGRATIONS = [
    ("sys_plugin_cashflow_items", "plugin_cashflow", "scheduled"),
    ("sys_plugin_goals", "plugin_goals", "goals"),
    ("sys_plugin_subscriptions", "plugin_subscriptions", "subscriptions"),
    ("sys_plugin_emergency_fund_config", "plugin_emergency_fund", "config"),
    ("sys_plugin_emergency_fund_snapshots", "plugin_emergency_fund", "snapshots"),
]


def get_connection(demo: bool = False):
    """Get a DuckDB connection."""
    treeline_dir = Path.home() / ".treeline"

    if demo:
        db_path = treeline_dir / "demo.duckdb"
        return duckdb.connect(str(db_path))
    else:
        db_path = treeline_dir / "treeline.duckdb"
        password = os.environ.get("TL_DB_PASSWORD")

        if not password:
            print("Error: TL_DB_PASSWORD environment variable required for encrypted database")
            sys.exit(1)

        # Derive encryption key using same method as CLI
        import hashlib
        import base64
        import json

        encryption_path = treeline_dir / "encryption.json"
        if not encryption_path.exists():
            print("Error: encryption.json not found - database may not be encrypted")
            sys.exit(1)

        with open(encryption_path) as f:
            metadata = json.load(f)

        salt = base64.b64decode(metadata["salt"])

        # Use argon2 to derive key (same as CLI)
        try:
            import argon2
            from argon2.low_level import hash_secret_raw, Type

            params = metadata.get("argon2_params", {})
            key = hash_secret_raw(
                secret=password.encode(),
                salt=salt,
                time_cost=params.get("time_cost", 3),
                memory_cost=params.get("memory_cost", 65536),
                parallelism=params.get("parallelism", 4),
                hash_len=params.get("hash_len", 32),
                type=Type.ID,
            )
            key_hex = key.hex()
        except ImportError:
            print("Error: argon2-cffi package required for encrypted database")
            sys.exit(1)

        # Connect with encryption (in-memory connection, attach encrypted DB)
        conn = duckdb.connect(":memory:")
        conn.execute(f"ATTACH '{db_path}' AS main_db (ENCRYPTION_KEY '{key_hex}')")
        conn.execute("USE main_db")
        return conn


def table_exists(conn, table_name: str) -> bool:
    """Check if a table exists in the main schema."""
    result = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ? AND table_schema = 'main'",
        [table_name]
    ).fetchone()
    return result[0] > 0


def schema_table_exists(conn, schema: str, table: str) -> bool:
    """Check if a table exists in a specific schema."""
    result = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ? AND table_schema = ?",
        [table, schema]
    ).fetchone()
    return result[0] > 0


def migrate_table(conn, old_table: str, new_schema: str, new_table: str) -> bool:
    """Migrate a single table to a new schema."""

    # Check if old table exists
    if not table_exists(conn, old_table):
        print(f"  ⊘ {old_table} does not exist, skipping")
        return False

    # Check if already migrated
    if schema_table_exists(conn, new_schema, new_table):
        print(f"  ⊘ {new_schema}.{new_table} already exists, skipping")
        return False

    print(f"  → Migrating {old_table} to {new_schema}.{new_table}...")

    # Create schema if needed
    conn.execute(f"CREATE SCHEMA IF NOT EXISTS {new_schema}")

    # Create new table with data
    conn.execute(f"CREATE TABLE {new_schema}.{new_table} AS SELECT * FROM {old_table}")

    # Drop old table
    conn.execute(f"DROP TABLE {old_table}")

    print(f"  ✓ Migrated {old_table} to {new_schema}.{new_table}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Migrate community plugin tables")
    parser.add_argument("--demo", action="store_true", help="Use demo database")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
    args = parser.parse_args()

    print(f"\nCommunity Plugin Table Migration")
    print(f"{'='*40}")
    print(f"Database: {'demo.duckdb' if args.demo else 'treeline.duckdb'}")
    if args.dry_run:
        print("Mode: DRY RUN (no changes will be made)\n")
    else:
        print()

    conn = get_connection(demo=args.demo)

    migrated = 0
    skipped = 0

    for old_table, new_schema, new_table in MIGRATIONS:
        if args.dry_run:
            if table_exists(conn, old_table):
                if schema_table_exists(conn, new_schema, new_table):
                    print(f"  ⊘ {old_table} → {new_schema}.{new_table} (already exists)")
                    skipped += 1
                else:
                    print(f"  → Would migrate {old_table} → {new_schema}.{new_table}")
                    migrated += 1
            else:
                print(f"  ⊘ {old_table} does not exist")
                skipped += 1
        else:
            if migrate_table(conn, old_table, new_schema, new_table):
                migrated += 1
            else:
                skipped += 1

    print(f"\n{'='*40}")
    print(f"Migrated: {migrated}, Skipped: {skipped}")

    conn.close()


if __name__ == "__main__":
    main()
