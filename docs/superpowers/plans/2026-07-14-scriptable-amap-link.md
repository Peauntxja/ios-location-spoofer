# Scriptable 高德跳转修复 Implementation Plan

**Goal:** 稳定从结果页打开高德地图 App。

### Task 1: 修复跳转

- [ ] 将网页中转链接替换为高德官方 `iosamap://viewMap`。
- [ ] 在 WebView 中截获该 Scheme，并通过 `Safari.open()` 打开。

### Task 2: 验证

- [ ] 验证生成链接使用 GCJ-02 和 `dev=0`。
- [ ] 运行 JavaScript 语法、格式与 Lint 检查。
