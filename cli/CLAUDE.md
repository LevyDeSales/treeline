# CLI Development Guidelines

## Code Style

### Python
- Use ruff for code formatting: `uvx ruff format cli/`
- ALWAYS use Python type hints

## Architecture

### Principles

**Local-first:**
The app is local-first, meaning all major operations occur on the user's machine, not on the server. The server is used minimally - primarily for authentication and database backups.

**AI native:**
The app is AI native, meaning AI is a first-class citizen in the experience. Treeline is inspired heavily by tools such as Claude Code.

**Hexagonal architecture:**
Hexagonal architecture is how code is structured in this project. Domain classes should be self-contained, and abstraction design is paramount to maintaining the integrity of the codebase. For example:
```python
# BAD abstraction - leaks technology choice (SimpleFIN)
class DataProvider(ABC):
    def get_simplefin_transactions(self, start_date, end_date, simplefin_access_url):
        pass

# GOOD abstraction - technology-agnostic
class DataProvider(ABC):
    def get_transactions(self, start_date: str, end_date: str, provider_options: Dict[str, Any]):
        pass
```

Another example of the boundary between the CLI layer and the service layer:
```python
# BAD - business logic in CLI handler
def some_cli_command_handler():
    service = SyncService()
    transactions = service.sync_transactions()
    transactions = remove_duplicates(transactions)  # BAD: belongs in sync logic!

# GOOD - CLI only handles I/O
def some_cli_command_handler():
    service = SyncService()
    transactions = service.sync_transactions()  # deduplication lives in service
```

### Critical Architecture Rules

**Domain Models:**
- ALL domain models MUST be defined in `src/treeline/domain.py`
- Domain models should NEVER be defined in commands, CLI, or infrastructure layers
- If you're creating a new entity (Account, Transaction, etc.), it goes in `domain.py`

**Layer Responsibilities:**
- **CLI/Commands** (`cli.py`): Parse input, call services, display results. No business logic, no file I/O, no database access.
- **Services** (`app/service.py`): Business logic only. Use abstractions for all external concerns.
- **Abstractions** (`abstractions/`): Define interfaces (ABCs). No implementation details.
- **Infrastructure** (`infra/`): Implement abstractions. All technology-specific code lives here.

**CLI Architecture Rules:**
- The CLI (`src/treeline/cli.py`) MUST be a thin presentation layer
- The CLI MUST ONLY interact with services from `app/service.py`
- The CLI MUST NEVER directly call repositories, providers, or any other abstractions
- All business logic MUST live in the service layer, NOT in the CLI

### Directory Structure
```
src/treeline/
    cli.py          # Typer CLI entry point w/ all commands
    domain.py       # Domain classes (Account, Transaction, etc.)
    abstractions/   # All "ports" (interfaces/ABCs)
    app/            # Core business logic
        service.py  # Business logic classes
        container.py # DI container for resolving deps
    infra/          # "Adapter" implementations
                    # One file per underlying technology or API
```

### Database Schema
See `src/treeline/infra/migrations` for up-to-date schema definition.

## Testing

### Philosophy
- **Prefer smoke tests over unit tests** for CLI commands
- Smoke tests run actual CLI commands via subprocess in demo mode - see `tests/smoke/`
- Unit tests are good for edge cases that are hard to hit via CLI (e.g., malformed CSV formats, unusual date parsing)
- Simple smoke tests are preferred over complex unit tests that require maintenance
- Run tests before doing a git commit, unless explicitly asked not to

### Running Tests
```bash
# Smoke tests (preferred for CLI features)
cd cli && uv run pytest tests/smoke -v

# Unit tests (for edge cases and complex parsing logic)
cd cli && uv run pytest tests/unit -v

# All tests
cd cli && uv run pytest tests/ -v
```

## Running the CLI
```bash
cd cli && uv run tl --help
```
