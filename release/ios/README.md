# StayUp课表 iOS Release

版本：1.2.0

这是 iOS PWA 分发包。解压后可用本地静态服务预览；部署到 HTTPS 站点后，使用 Safari 打开并选择“添加到主屏幕”即可安装。

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
2. iPhone Safari 打开站点。
3. 分享按钮选择“添加到主屏幕”。

## 原生 IPA 说明

iOS 原生 IPA 必须在 macOS + Xcode 环境中构建，并且正式分发需要 Apple Developer 证书。当前 Windows 环境不能直接产出 IPA。
