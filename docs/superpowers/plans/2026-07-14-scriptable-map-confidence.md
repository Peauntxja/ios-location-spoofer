# Scriptable 地图与候选体验优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复结果页地图空白，并增强国内模糊地址纠错和候选确认体验。

**Architecture:** 仅修改 `scriptable/gen-location.js`。复用现有高德 Key、候选评分和逆地理结果；国内地图使用 GCJ-02，输入提示仅在无结果或低置信度时调用。

**Tech Stack:** JavaScript、Scriptable WebView、Amap Web Service API

---

### Task 1: 修复地图与增加跳转

- [ ] 将失效的 OSM 静态地图替换为高德静态地图。
- [ ] 国内使用候选的 GCJ-02 坐标生成地图和高德跳转链接。
- [ ] 结果页增加“在高德地图打开”按钮。

### Task 2: 增加低置信度确认

- [ ] 低置信度候选展示完整逆地理地址。
- [ ] 用户确认后才采用低置信度候选。
- [ ] 仅在高置信度且第一名分数明显领先时自动采用。

### Task 3: 增加输入提示纠错

- [ ] 无候选或初排第一名为低置信度时调用高德输入提示。
- [ ] 合并有坐标的纠错候选，去重后执行现有逆地理复核与评分。

### Task 4: 验证

- [ ] 验证高德静态地图返回 PNG。
- [ ] 验证详细门址排序、模糊地址纠错和自动选择条件。
- [ ] 运行 JavaScript 语法、格式与 Lint 检查。
