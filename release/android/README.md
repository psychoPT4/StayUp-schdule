# StayUp课表 Android Release

版本：1.3.0

这是 Android PWA 分发包。仓库还配置了 GitHub Actions，会在 tag 发布时自动构建可安装的 `StayUp-schedule-debug.apk`，可直接下载到 Android 手机测试。

## 发布内容

- `index.html`
- `styles.css`
- `manifest.webmanifest`
- `assets/icon.svg`
- `src/app.mjs`
- `src/parser.mjs`
- `server.mjs`

## 安装方式

1. 把分发包内容部署到 HTTPS 静态站点。
2. Android Chrome 打开站点。
3. 菜单选择“添加到主屏幕”。

## 原生 APK 说明

当前开发机没有 Java、Gradle 或 Android SDK，不能在本机直接构建 APK。后续可用 Capacitor 或 Trusted Web Activity 生成 APK/AAB。
