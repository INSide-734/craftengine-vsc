# 📝 Changelog

All notable changes to the CraftEngine VS Code extension will be documented in this file.

Follow [Keep a Changelog](http://keepachangelog.com/) recommendations for structuring this file.

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