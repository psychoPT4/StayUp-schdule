# StayUp课表 Android Release

版本：1.2.0

这是 Android PWA 分发包。解压后可用本地静态服务预览；部署到 HTTPS 站点后，使用 Chrome 打开并选择“添加到主屏幕”即可获得接近原生 App 的启动体验。

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
