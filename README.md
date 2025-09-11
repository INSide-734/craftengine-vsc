# CraftEngine VS Code 扩展

一个功能强大的 VS Code 扩展，为 CraftEngine 提供完整的 YAML 模板开发支持。通过智能补全、实时诊断、代码导航等功能，大幅提升 CraftEngine 模板的开发效率。

## ✨ 核心功能

### 🎯 智能代码补全
- **模板自动补全**：在 YAML 文件中输入 `template:` 时提供可用的模板建议
- **参数智能提示**：显示每个模板所需的参数和类型信息
- **代码片段生成**：自动生成带有占位符的模板代码片段，支持 Tab 键快速跳转

### 🔍 代码导航与提示
- **悬停提示**：将光标指向模板名称时显示详细的参数信息和文档
- **定义跳转**：按住 Ctrl+左键点击模板名称可跳转到模板定义位置
- **智能识别**：精确识别模板名称边界，避免误触发

### 📊 实时诊断与验证
- **参数缺失诊断**：当使用模板但缺少必需参数时，显示错误提示
- **可选参数警告**：提醒用户未覆盖的默认值参数
- **Schema 验证**：为 YAML 文件提供动态生成的 JSON Schema（需要 Red Hat YAML 扩展）
- **实时错误检查**：文档保存时自动检查模板使用错误

### 🔄 文件监控与缓存
- **实时文件监控**：自动扫描工作区中的 YAML 文件并更新模板缓存
- **增量更新**：文件变化时智能更新缓存，提升性能
- **缓存管理**：提供手动重建缓存和调试缓存的命令

## 📦 安装要求

- **VS Code** 1.103.0 或更高版本
- **推荐依赖**：Red Hat YAML 扩展（用于 Schema 验证功能）

### Red Hat YAML 扩展安装

为了获得完整的 YAML 验证功能，建议安装 Red Hat YAML 扩展：

1. **自动安装**：扩展会在检测到缺少依赖时提示安装
2. **手动安装**：
   - 打开 VS Code 扩展面板（Ctrl+Shift+X）
   - 搜索 "Red Hat YAML"
   - 安装 "YAML" 扩展（由 Red Hat 发布）
3. **命令安装**：运行命令 `CraftEngine: Check Red Hat YAML Extension Status` 检查状态

> **注意**：即使未安装 Red Hat YAML 扩展，CraftEngine 扩展的其他功能（补全、诊断、悬停提示等）仍可正常使用。

## ⚙️ 扩展配置

扩展提供以下可配置选项：

| 配置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `craftengine.files.exclude` | string | `**/node_modules/**` | 排除文件扫描的 glob 模式 |
| `craftengine.parser.templateKey` | string | `templates` | YAML 文件中定义模板的顶级键 |

### 配置示例

```json
{
  "craftengine.files.exclude": "**/node_modules/**,**/build/**,**/dist/**",
  "craftengine.parser.templateKey": "templates"
}
```

## 🚀 可用命令

扩展提供以下命令，可通过命令面板（Ctrl+Shift+P）访问：

- **CraftEngine: Insert Template Snippet** - 插入模板代码片段
- **CraftEngine: Rebuild Template Cache** - 手动重建模板缓存
- **CraftEngine: Debug Template Cache** - 调试模板缓存状态
- **CraftEngine: Check Red Hat YAML Extension Status** - 检查 Red Hat YAML 扩展状态

## 📖 使用指南

### 基本使用流程

1. **输入模板**：在 YAML 文件中输入 `template:` 
2. **选择模板**：扩展会自动提供可用的模板建议
3. **生成代码片段**：选择一个模板后，会自动生成带有参数占位符的代码片段
4. **填写参数**：使用 Tab 键在参数之间跳转并填写值

### 高级功能使用

- **悬停提示**：将光标悬停在模板名称上可查看详细的参数信息
- **定义跳转**：按住 Ctrl+左键点击模板名称可跳转到模板定义位置
- **实时诊断**：保存文件时自动检查参数缺失和错误

### 诊断功能示例

扩展会自动检测以下问题：

```yaml
# ❌ 错误：缺少必需参数
items:
  broken_item:
    template: namespace:template/name
    arguments:
      parameter1: value1
      # 缺少 parameter2，会显示错误

# ⚠️ 警告：未覆盖默认值
items:
  warning_item:
    template: namespace:template/name
    arguments:
      parameter1: value1
      # parameter2 使用默认值，会显示警告
```

## ⚠️ 故障排除

### Schema 验证功能问题

如果遇到 "Schema 验证功能将被禁用" 的提示，请按以下步骤解决：

1. **检查 Red Hat YAML 扩展状态**：
   - 运行命令 `CraftEngine: Check Red Hat YAML Extension Status`
   - 或手动检查扩展面板中是否安装了 "YAML" 扩展（Red Hat 发布）

2. **安装 Red Hat YAML 扩展**：
   - 如果未安装，扩展会自动提示安装选项
   - 或手动在扩展面板搜索 "Red Hat YAML" 并安装

3. **重启 VS Code**：
   - 安装完成后重启 VS Code 以确保扩展正确激活

4. **验证功能**：
   - 重新打开 YAML 文件
   - 检查是否出现 "Schema 验证功能已启用！" 的提示

### 其他常见问题

- **扩展兼容性**：扩展会自动处理 YAML 扩展 API 的兼容性问题
- **功能降级**：即使 Schema 验证不可用，其他功能（补全、诊断、悬停提示等）仍可正常使用

#### 🔧 技术改进
- 修复了 YAML 扩展 API 兼容性问题
- 添加了优雅的错误处理机制
- 实现了高效的模板缓存系统

## 🛠️ 开发指南

### 本地开发

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd craftengine-vsc
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **编译项目**
   ```bash
   npm run compile
   ```

4. **运行测试**
   ```bash
   npm test
   ```

5. **打包扩展**
   ```bash
   npm run package
   ```

### 🚀 自动构建和发布

本项目使用 GitHub Actions 进行自动构建、测试和发布，并提供美化的 Release 发布说明。

**快速发布流程：**
1. 更新版本号：`npm version patch`
2. 推送标签：`git push origin master --tags`
3. 创建 GitHub Release
4. 自动构建并上传 `.vsix` 文件到 GitHub Release
5. 自动生成美化的发布说明

**美化发布说明特性：**
- 🎨 使用 emoji 图标增强视觉效果
- 📋 完整的功能分类和描述
- 🔗 自动生成相关链接
- 📦 详细的安装和升级说明
- 📚 完整的使用指南

详细说明请查看：
- [GitHub Actions 文档](docs/github-actions.md)
- [发布说明美化指南](docs/release-notes-guide.md)

### 开发环境要求

- Node.js 18+ 
- TypeScript 5.9+
- VS Code 1.103.0+

### 项目结构

```
src/
├── core/           # 核心功能模块
├── features/       # 功能提供者
├── vscode/         # VS Code 集成
├── utils/          # 工具函数
└── types/          # 类型定义
```

## 📚 相关资源

- [VS Code 扩展开发指南](https://code.visualstudio.com/api/references/extension-guidelines)
- [VS Code 扩展 API](https://code.visualstudio.com/api)
- [YAML 语言支持](https://code.visualstudio.com/docs/languages/yaml)
- [CraftEngine 官方文档](https://xiao-momi.github.io/craft-engine-wiki/)

## 📄 许可证

本项目采用 Apache-2.0 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个扩展！

---

**CraftEngine VS Code 扩展** - 让 CraftEngine 模板开发更加高效！ 🚀
