<div align="center">

# CraftEngine for VS Code

**Intelligent YAML template development support for [CraftEngine](https://xiao-momi.github.io/craft-engine-wiki/)**

[![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D1.103.0-blue?style=for-the-badge&logo=visualstudiocode)](https://code.visualstudio.com/)
[![License](https://img.shields.io/github/license/INSide-734/craftengine-vsc?style=for-the-badge)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/INSide-734/craftengine-vsc/build-and-release.yml?branch=master&style=for-the-badge)](https://github.com/INSide-734/craftengine-vsc/actions)
[![Release](https://img.shields.io/github/v/release/INSide-734/craftengine-vsc?style=for-the-badge)](https://github.com/INSide-734/craftengine-vsc/releases)

Schema-driven completion · Real-time diagnostics · Go-to-definition · Item model preview

<!-- TODO: Add screenshot or GIF demo here -->
<!-- ![Demo](media/demo.gif) -->

</div>

---

## Features

### 🎯 Smart Completion

- **Template auto-completion** — suggests available templates when typing `template:`
- **Parameter IntelliSense** — displays required parameters and type information for each template
- **Snippet generation** — generates template snippets with tab-stop placeholders
- **Schema-driven delegates** — context-aware completion for template names, parameters, translation keys, file paths, item IDs, category references, and version conditions
- **MiniMessage rich text** — completion for 40+ MiniMessage tags including colors, formatting, click/hover actions, and keybinds

### 🔍 Code Navigation & Hover

- **Hover documentation** — hover over a template name to see its parameters and docs
- **Go-to-definition** — `Ctrl+Click` on a template name to jump to its definition
- **Reference finding** — find all usages of templates and translation keys across the workspace
- **Smart boundary detection** — accurately identifies template name boundaries to avoid false triggers

### 📊 Real-time Diagnostics

- **Missing parameter detection** — errors when required template parameters are missing
- **Optional parameter warnings** — reminders for parameters using default values
- **Schema validation** — JSON Schema-based YAML validation (with Red Hat YAML extension)
- **Category & item ID validation** — validates Minecraft item references against built-in database
- **Translation key validation** — cross-workspace translation key reference checking
- **MiniMessage format validation** — validates rich text color, click/hover action, and formatting tags

### 🔄 Workspace Intelligence

- **Real-time file watching** — automatically scans and indexes YAML files in the workspace
- **Incremental cache updates** — smart cache invalidation on file changes
- **Schema hot reload** — live reload when workspace schema files are modified
- **Template expansion** — expands templates before validation to prevent false positives

### 🖼️ Item Model Preview

- **3D model preview** — preview Minecraft item models directly in the editor
- **Resource pack support** — load custom resource packs for accurate model rendering
- **Context menu integration** — right-click on item IDs to preview models

## Installation

### From Marketplace

Search for **CraftEngine** in the VS Code Extensions panel, or run:

```
ext install craftengine.craftengine-vsc
```

### Manual Install

1. Download the latest `.vsix` file from [GitHub Releases](https://github.com/INSide-734/craftengine-vsc/releases)
2. In VS Code, open the Command Palette (`Ctrl+Shift+P`) and run **Extensions: Install from VSIX...**
3. Select the downloaded `.vsix` file

### Recommended Extension

For full schema validation support, install the [Red Hat YAML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) extension. CraftEngine will prompt you to install it automatically if missing.

> All other features (completion, diagnostics, hover, navigation) work without it.

## Quick Start

1. Open a workspace containing CraftEngine YAML files
2. Start typing `template:` in any `.yml` / `.yaml` file — completions appear automatically
3. Select a template to generate a snippet with parameter placeholders, then `Tab` through them

```yaml
items:
  my_item:
    template: namespace:template/name
    arguments:
      parameter1: value1
      parameter2: value2
```

Hover over template names for documentation. `Ctrl+Click` to jump to definitions.

## Configuration

All settings are under the `craftengine.*` namespace. Open **Settings** (`Ctrl+,`) and search for `craftengine`.

### General

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `files.exclude` | string | `**/node_modules/**` | Glob pattern to exclude from template scanning |
| `templates.autoCompletion` | boolean | `true` | Enable automatic template completion |
| `templates.paths` | string[] | `["templates/**/*.yml", "templates/**/*.yaml"]` | Glob patterns for template files |

### Schema

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `validation.level` | string | `"loose"` | Validation level: `strict`, `loose`, or `off` |
| `validation.templateExpansion` | boolean | `true` | Expand templates before validation to prevent false positives |
| `schema.deployToWorkspace` | boolean | `true` | Deploy schemas to `.craftengine/schemas/` for customization |
| `schema.autoUpdateOnVersionChange` | boolean | `true` | Auto-update workspace schemas on extension update |
| `schema.hotReload` | boolean | `true` | Live reload on workspace schema file changes |

### Completion

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `schema.customCompletion.enabled` | boolean | `true` | Enable schema-driven custom completion |
| `schema.customCompletion.debug` | boolean | `false` | Show debug logs for schema-driven completion |
| `schema.customCompletion.fallback` | string | `"default"` | Fallback when schema unavailable: `default`, `none`, `schema` |
| `completion.schemaKeys.maxEnumDisplay` | number | `20` | Max enum values shown in completion docs |

### Diagnostics

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `diagnostics.enabled` | boolean | `true` | Enable template validation diagnostics |
| `diagnostics.schemaValidation` | boolean | `true` | Enable schema-based YAML validation |

### Preview

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `preview.resourcePacks` | string[] | `[]` | Paths to Minecraft resource packs for model preview |
| `preview.useInternalResources` | boolean | `true` | Use built-in Minecraft resources as fallback |
| `preview.renderSize` | number | `256` | Preview image size in pixels (64–1024) |

### Logging

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `logging.level` | string | `"INFO"` | Log level: `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL` |
| `logging.debugMode` | boolean | `false` | Enhanced logging in debug console |
| `logging.fileEnabled` | boolean | `false` | Enable file logging for troubleshooting |
| `performance.monitoring` | boolean | `false` | Enable performance monitoring (dev only) |

## Commands

Open the Command Palette (`Ctrl+Shift+P`) and type `CraftEngine`:

| Command | Description |
|---------|-------------|
| Insert CraftEngine Template Snippet | Insert a template code snippet at cursor |
| Rebuild Template Cache | Manually rebuild the template cache |
| Debug Template Cache | Inspect current template cache state |
| Check Red Hat YAML Extension Status | Verify YAML extension availability |
| Get Extension Statistics | Retrieve extension performance stats |
| Show Extension Statistics | Display stats in a readable panel |
| Reload Minecraft Builtin Items | Refresh the built-in item database |
| Deploy Schema to Workspace | Copy schemas to `.craftengine/schemas/` |
| Reset Workspace Schema | Restore schemas to extension defaults |
| Reload Schema from Workspace | Reload customized workspace schemas |
| Preview Item Model | Preview a Minecraft item model (also in context menu) |

## Architecture

The extension follows a 5-layer clean architecture:

```
Presentation → Application → Domain → Core ← Infrastructure
```

```
src/
├── core/              # Interfaces, types, constants, errors
├── domain/            # Business logic, entities, services
├── application/       # Use case orchestration
├── infrastructure/    # DI, logging, events, YAML parsing, config
├── presentation/      # VS Code providers, commands, strategies
└── test/              # Unit, integration, E2E, benchmarks
```

## Troubleshooting

### Schema validation is disabled

1. Run **CraftEngine: Check Red Hat YAML Extension Status** from the Command Palette
2. Install the [Red Hat YAML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) extension if missing
3. Restart VS Code
4. Reopen your YAML file — you should see "Schema validation enabled"

### Templates not appearing in completion

1. Ensure your template files match the configured `craftengine.templates.paths` patterns
2. Run **CraftEngine: Rebuild Template Cache**
3. Check the output panel for any scanning errors

### Diagnostics not updating

Diagnostics refresh on file save with a 500ms debounce. Save the file and wait briefly.

## Contributing

```bash
# Clone and install
git clone https://github.com/INSide-734/craftengine-vsc.git
cd craftengine-vsc
pnpm install

# Build
pnpm run compile

# Run tests
pnpm test                    # All tests
pnpm run test:unit           # Unit tests only
pnpm run test:integration    # Integration tests only
pnpm run test:e2e            # E2E tests (requires VS Code)
pnpm run test:coverage       # With coverage report

# Lint
pnpm run lint

# Package
pnpm run package
```

Debug the extension by pressing `F5` in VS Code (uses the "Launch Extension" configuration).

## Resources

- [CraftEngine Documentation](https://xiao-momi.github.io/craft-engine-wiki/)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [YAML Language Support](https://code.visualstudio.com/docs/languages/yaml)

## License

[Apache-2.0](LICENSE)
