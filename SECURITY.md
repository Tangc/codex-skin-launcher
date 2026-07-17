# Security

## 安全模型

Codex Skin Launcher 通过 Chrome DevTools Protocol 向本机 Codex 页面注入样式和布局脚本。启动器启动 Codex 时会开启调试端口 `127.0.0.1:9333`，该地址只接受本机连接。

调试端口具有控制页面的能力。不要运行来源不明的软件，也不要把监听地址改成 `0.0.0.0`、局域网地址或公网地址。退出启动器只会停止样式注入器；调试端口会保持到该 Codex 进程退出，因此不使用时请同时退出 Codex。

## 本地数据

- 背景图经过本地压缩后保存，不会上传。
- macOS 配置和日志位于 `~/Library/Application Support/Codex Skin Launcher/`。
- Windows 配置和背景图位于 `%LOCALAPPDATA%\Codex Skin Launcher\`。
- macOS 实时额度功能通过 Codex App Server 的本机 `stdio` 通道读取额度百分比、窗口和重置时间，不新增监听端口；登录凭证由 Codex 自己管理，不会传给注入页面或写入启动器日志。
- 项目不会上传或保存 Codex 对话内容，也不会修改 Codex 安装包。布局与筛选脚本只在页面内读取页面标题、路径、可见项目/任务名称、运行状态元素和按钮标签，用于显示任务信息、实时筛选及转发顶部快捷操作；这些数据不会写入配置或日志。

## 发布包

GitHub Release 中的 macOS 应用使用临时签名，没有 Apple Developer ID 公证；Windows EXE 当前也没有代码签名。Windows Defender SmartScreen 或 macOS Gatekeeper 可能给出来源提示。对安全要求较高的用户应审阅源码并自行构建。

## 报告问题

请通过 GitHub Security Advisory 私下报告安全问题，不要在公开 Issue 中提交凭据、个人数据或可利用细节。
