# Security

## 安全模型

Codex Skin Launcher 通过 Chrome DevTools Protocol 向本机 Codex 页面注入样式。启动器启动 Codex 时会开启调试端口 `127.0.0.1:9333`，该地址只接受本机连接。

调试端口具有控制页面的能力。不要运行来源不明的软件，也不要把监听地址改成 `0.0.0.0`、局域网地址或公网地址。退出启动器只会停止样式注入器；调试端口会保持到该 Codex 进程退出，因此不使用时请同时退出 Codex。

## 本地数据

- 背景图经过本地压缩后保存，不会上传。
- 配置和日志位于 `~/Library/Application Support/Codex Skin Launcher/`。
- 项目不会读取 Codex 对话内容，也不会修改 Codex 安装包。

## 发布包

GitHub Release 中的应用使用临时签名，没有 Apple Developer ID 公证。对安全要求较高的用户应审阅源码并自行构建。

## 报告问题

请通过 GitHub Security Advisory 私下报告安全问题，不要在公开 Issue 中提交凭据、个人数据或可利用细节。
