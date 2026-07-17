# Codex Skin Launcher / Codex 换肤启动器

[![macOS](https://img.shields.io/badge/macOS-13%2B-black?logo=apple)](https://github.com/Tangc/codex-skin-launcher/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Tangc/codex-skin-launcher)](https://github.com/Tangc/codex-skin-launcher/releases/latest)

一个原生 macOS 启动器，为 Codex 桌面客户端增加背景图片、透明面板和完整的颜色/字体自定义。双击后会自动启动 Codex 并应用上次保存的皮肤，不需要打开终端或手动粘贴 CSS。

> 这是社区项目，不是 OpenAI 官方产品。它依赖 Codex 桌面客户端的内部页面结构，Codex 更新后可能需要同步适配。

![Codex 换肤启动器界面](assets/launcher.png)

## 功能

- 自动启动或重启 Codex
- 选择本地背景图，支持铺满或完整显示
- 调整背景色、文字色和强调色
- 调整遮罩、面板透明度、模糊、亮度和饱和度
- 设置 UI 字体和代码字体
- 配置自动保存，修改后实时生效
- 新窗口和页面刷新后自动重新注入
- 一键关闭皮肤并恢复 Codex 原始外观

## 安装

### 下载构建版本

1. 在 [Releases](https://github.com/Tangc/codex-skin-launcher/releases/latest) 下载最新的 `CodexSkinLauncher-macos-arm64.zip`。
2. 解压后双击 `Codex换肤启动器.app`。
3. Codex 会自动重启，并应用上次保存的皮肤。

当前 Release 为 Apple Silicon 构建，使用临时签名，没有 Apple Developer ID 公证。如果 macOS 阻止运行，建议按下方说明从源码构建，不建议使用命令绕过系统安全检查。

### 从源码构建

要求：

- macOS 13 或更高版本
- 已安装 Codex 桌面客户端（默认位于 `/Applications/ChatGPT.app`）
- Xcode Command Line Tools：`xcode-select --install`

```bash
git clone https://github.com/Tangc/codex-skin-launcher.git
cd codex-skin-launcher
./scripts/build.sh
open dist/Codex换肤启动器.app
```

构建脚本会针对当前 Mac 架构生成应用和 ZIP，产物位于 `dist/`。

## 使用说明

1. 打开启动器后，Codex 会自动启动或重启。
2. 选择背景图、颜色和字体，效果会实时应用。
3. 保持启动器运行，以便为新窗口和刷新后的页面继续注入皮肤。
4. 关闭“启用皮肤”即可恢复 Codex 原始外观。

启动器会自动重启已经打开的 Codex，因此会结束 Codex 中正在运行的任务。请先等待当前任务完成。

配置保存在：

```text
~/Library/Application Support/Codex Skin Launcher/
```

## 工作原理

启动器会以仅限本机访问的调试端口启动 Codex：

```text
127.0.0.1:9333
```

随后通过 Chrome DevTools Protocol 为 Codex 页面创建独立样式表，并持续监控新窗口、页面刷新和配置变化。背景图会在本地压缩后转换为 Data URL，不会上传到网络。

它不会修改 Codex 的 `app.asar`、应用签名或安装目录。退出启动器后，皮肤注入器会停止；但 Codex 的调试端口会保持到该 Codex 进程退出，因此不使用时请同时退出 Codex。

## 安全边界

- 调试端口只绑定 `127.0.0.1`，不要修改为局域网或公网地址；退出启动器后请同时退出 Codex，以关闭该端口。
- 启动器运行期间，本机其他进程理论上可以访问该调试端口；不要运行来源不明的软件。
- 背景图和配置只保存在本机。
- 发布版没有 Apple Developer ID 公证；可审阅源码并自行构建。

更多信息见 [SECURITY.md](SECURITY.md)。

## 兼容性

- 已在 macOS Apple Silicon 上验证。
- 已验证 Codex `26.715.21316`。
- Codex 内部 CSS Token 或窗口结构变化时，可能需要更新注入样式。

## 卸载

删除 `Codex换肤启动器.app`，并按需删除：

```text
~/Library/Application Support/Codex Skin Launcher/
```

## 开源协议

[MIT](LICENSE)
