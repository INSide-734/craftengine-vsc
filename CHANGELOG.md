# 📝 Changelog

All notable changes to the CraftEngine VS Code extension will be documented in this file.

Follow [Keep a Changelog](http://keepachangelog.com/) recommendations for structuring this file.

## [0.0.4] - 2026-03-31

### Added

#### Architecture Rewrite
- Complete migration to 5-layer clean architecture: Core → Domain → Application → Infrastructure → Presentation
- Dependency injection system with `ServiceContainer` and `SERVICE_TOKENS` (Symbol-based)
- Event-driven architecture with `EventBus` supporting wildcard subscriptions and Trie-based pattern matching
- Performance monitoring with `PerformanceMonitor` for automatic operation profiling
- Hierarchical logging system with multiple output targets (console, file, OutputChannel)

#### Schema-Driven Completion System
- Strategy-based completion framework with priority system (schemaAware: 90, schemaKey: 85, delegates: 75)
- 7 delegate strategies: templateName, templateParameters, translationKey, filePath, itemId, categoryReference, versionCondition
- Rich text completion with MiniMessage tag support (40+ tags, 18 colors, click/hover actions, keybinds)
- AST-based YAML path parsing with 98% accuracy (improved from 85%)
- LRU caching for 90%+ performance improvement on repeated queries

#### Diagnostic & Code Action Providers
- Category reference validation with go-to-definition and quick fixes
- Item ID validation with Minecraft namespace support and built-in item database
- MiniMessage rich text format validation (colors, click/hover actions, formatting tags)
- Translation key validation with cross-workspace reference finding
- Version condition validation with range and comparison support
- File path validation with existence checking, similar path suggestions, and auto-create
- Extended parameter type validation: `self_increase_int`, `condition`, `when`, `expression`
- Quick fixes: add missing properties, remove unknown properties, fix enum values, swap from/to values

#### Minecraft Model Rendering
- 3D model rendering engine with perspective projection (512x512 internal, 128x128 export)
- Item model resolution with condition, range dispatch, and select evaluators
- Model cache system (ModelCache, ResolvedModelCache, TextureCache)
- Worker pool for multi-threaded parallel rendering
- WebGL-based model preview panel with camera controls
- Pre-bundled Minecraft assets: block models, item models, textures with tint support

#### Data & Schema System
- JSON Schema validation system with `$ref` resolution, circular reference detection, and draft-07 compliance
- External data configuration: completion priorities, extended types, performance/timing config, version conditions
- Minecraft data loading with multi-source fallback (Prismarine, GitHub mirrors)
- Minecraft version service supporting 1.20–1.21.11 (pack formats 15–75)
- MiniMessage data loader with tag definitions, colors, and action completions
- 20 JSON schema files covering items, recipes, loot tables, events, furniture, templates, translations

#### Domain Model
- Template entity with immutable properties, self-validation, and parameter management
- DataStoreService as unified facade implementing template, translation, item, and category repositories
- Specialized stores: TemplateStore, TranslationStore, ItemStore, CategoryStore with indexed queries
- Minecraft item model system with tint sources, condition properties, and registry pattern
- Template expansion with recursive reference resolution, circular reference detection, and parameter substitution

#### CI/CD & Tooling
- Unified build and release workflow (`unified-release.yml`) replacing the old `build-and-release.yml`
- GitHub Actions composite actions: `determine-package-type` and `setup-build-env`
- Platform-specific build scripts (`build-platform.js`, `build-universal.js`)
- Build utilities: dependency analysis (`analyze-dependencies.js`), dependency copy (`copy-dependencies.js`), build verification (`verify-build.js`), cache management (`cache-manager.js`)
- New esbuild configuration (`esbuild.config.mjs`)
- Package manager migration from npm to pnpm
- Build system migration to esbuild with custom build script
- Vitest test framework with VS Code mock, benchmarks, and coverage reporting

#### Commands
- `craftengine.previewModel` / `craftengine.refreshModelPreview`: Model preview panel
- `craftengine.createTemplate` / `craftengine.extractTemplate`: Template creation from selection
- `craftengine.reloadSchemas` / `craftengine.validateDocument`: Schema management
- `craftengine.getStatistics` / `craftengine.showStatistics`: Extension statistics

### Changed
- Migrated from monolithic single-file architecture to 5-layer clean architecture
- Replaced all legacy providers with layered implementations using strategy pattern
- Updated entry point from `extension.js` to `extension-complete.js`
- Decomposed `SchemaService.ts` (864 lines) into 11 modular sub-services with Facade pattern
- Decomposed `ExtensionService` into 8 specialized sub-components
- Extracted `SchemaLoaderService` sub-modules: SchemaEventHandler, SchemaFileManager, SchemaUpdateCoordinator
- Extracted `FileIndexingOrchestrator` sub-modules: FileChangeHandler, FileLockManager, WorkspaceInitializer
- Extracted `NamespaceDiscoveryService` sub-modules: NamespaceCache, NamespaceValidator, ResourceLocationParser
- Extracted `YamlPathParser` sub-modules: AstPathParser, IndentPathParser, PathParserCache
- Extracted `ModelGenerationService` sub-modules: ModelJsonBuilder, ModelPathExtractor, SimplifiedConfigConverter
- Introduced Prettier toolchain with unified code formatting across entire codebase
- Applied type-only imports throughout the codebase for optimized TypeScript compilation
- Extracted new interfaces for enhanced dependency inversion and module decoupling
- Migrated test framework from Mocha to Vitest with comprehensive VS Code API mock
- Migrated package manager from npm to pnpm
- Enhanced `package.json` for marketplace readiness (publisher: `craftengine`)
- Updated extension ID to `craftengine.craftengine-vsc`

### Fixed
- Resolved 11 CodeQL security alerts from PR#1
- Fixed dependency security vulnerabilities
- Fixed vsce package build pipeline issues:
  - Missing vsce package invocation in package script
  - Added @vscode/vsce dependency and fixed package script commands
  - Resolved vsce package and vscode:prepublish infinite recursion
  - Fixed pnpm project vsce package dependency check failures
  - Removed minimatch override to fix vsce package failures
- Fixed Schema Validation CI workflow
- Fixed Benchmark workflow base branch installation failure
- Allowed package job to run on PR events
- Resolved all TypeScript compilation errors and circular dependency issues
- Fixed service registration order and dependency injection lifecycle conflicts
- Fixed YAML path parsing accuracy (85% → 98%) using AST-based approach
- Fixed enum value escaping for special characters (`|`, `,`, `\`, `$`, `}`)
- Fixed LRU cache invalidation on schema reload, preventing memory leaks
- Fixed duplicate completion suggestions with smart key filtering
- Fixed E2E test setup: extension ID, Mocha config, module path resolution, Windows compatibility
- Improved variable naming for better readability

### Tests
- Added unit tests for core, domain, infrastructure, and application layers
- Added SchemaValidator tests
- Added TemplateDiagnosticProvider tests
- Added ConfigurationManager tests
- Added build scripts integration tests (`build-scripts.test.ts`)

### Removed
- Removed legacy architecture: `src/extension.ts`, `src/features/`, `src/utils/`, `src/types/`, `src/vscode/`
- Removed `src/core/TemplateCache.ts` and `src/core/TemplateParser.ts`
- Removed old test suite (`src/test/suite/`)
- Removed `.vscode-test.mjs` and `package-lock.json`
- Removed old `build-and-release.yml` workflow

## [0.0.3] - 2025-9-11

### Added
- **Smart Diagnostic System**: Real-time template usage error detection
  - Detect missing required parameters
  - Detect missing `arguments` section
  - Detect missing specific parameters in `arguments` section
- **Optional Parameter Warnings**: Alert users about unoverridden default value parameters
- **Real-time Error Checking**: Automatic template usage error checking on document save
- Comprehensive error message system with friendly and readable messages
- **Enhanced User Experience**: Improved user notifications for Red Hat YAML extension dependency
- **Smart Installation Prompts**: Automatic detection and installation prompts for missing dependencies
- **Extension Status Checker**: New command to check Red Hat YAML extension status and provide detailed information
- **Better Error Handling**: Enhanced error messages and user-friendly notifications for Schema validation issues
- **Comprehensive Troubleshooting Guide**: Detailed documentation for resolving Schema validation problems

### Changed
- Optimized error message friendliness and readability
- Enhanced diagnostic system performance and accuracy
- Improved template parameter validation logic
- **Dependency Management**: Changed Red Hat YAML extension from "optional" to "recommended" dependency
- **User Notifications**: Replaced console warnings with user-friendly VS Code notifications
- **Documentation**: Enhanced README with detailed installation instructions and troubleshooting steps

### Fixed
- Better handling of edge cases in template parameter detection
- Improved YAML parsing robustness
- **User Experience**: Improved handling of missing Red Hat YAML extension with clear guidance
- **Error Messages**: More informative and actionable error messages for Schema validation issues

## [0.0.2] - 2025-9-6

### Added
- **Hover Provider**: Display detailed parameter information when hovering over template names
- **Definition Provider**: Jump to template definition location with Ctrl+Click
- **Smart Recognition**: Precise template name boundary recognition to avoid false triggers
- Template definition location tracking in parser

### Changed
- Optimized template parser to support recording specific template definition locations
- Improved code navigation accuracy and response speed
- Enhanced template cache management

### Fixed
- Template name recognition accuracy
- Code navigation edge cases

## [0.0.1] - 2025-9-1

### Added
- **Template Auto-completion**: Provide available template suggestions when typing `template:` in YAML files
- **Parameter Smart Hints**: Display required parameters for each template
- **Code Snippet Generation**: Auto-generate template code snippets with parameter placeholders
- **Real-time File Monitoring**: Automatically scan workspace YAML files and update template cache
- **Schema Validation**: Provide dynamically generated JSON Schema for YAML files
- **File System Watcher**: Monitor file changes and update cache incrementally
- **Template Cache Management**: Efficient template caching system with manual rebuild commands

### Changed
- Initial implementation of core template parsing functionality
- Basic VS Code extension integration

### Fixed
- YAML extension API compatibility issues
- Added graceful error handling mechanisms
- Implemented efficient template cache system