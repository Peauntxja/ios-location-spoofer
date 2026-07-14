# Scriptable 完整配置生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scriptable 首次保存用户完整 Shadowrocket 配置，后续每次定位查询自动生成带新参数的完整配置文件并导出。

**Architecture:** 仅修改 `scriptable/gen-location.js`。完整配置模板保存在 Scriptable iCloud 私有目录；脚本替换时间戳和唯一的 `argument=` 参数，避免证书进入仓库。

**Tech Stack:** JavaScript、Scriptable FileManager、DocumentPicker

---

### Task 1: 保存配置模板

**Files:**
- Modify: `scriptable/gen-location.js`

- [ ] 增加模板文件路径、模板校验和首次从文档选择器导入逻辑。
- [ ] 校验模板包含 `[Script]`、`argument=` 和 `[MITM]`，无效时终止并提示。

### Task 2: 生成并导出完整配置

**Files:**
- Modify: `scriptable/gen-location.js`

- [ ] 使用现有 `buildArgument()` 结果替换模板中的 `argument=` 值。
- [ ] 更新首行 Shadowrocket 时间戳，写入 `location-spoofer.conf`。
- [ ] 查询成功后通过 `DocumentPicker.export()` 导出完整配置。
- [ ] 更新结果页提示，移除手动替换参数步骤。

### Task 3: 验证

**Files:**
- Verify: `scriptable/gen-location.js`

- [ ] 运行 `node --check scriptable/gen-location.js`，预期无语法错误。
- [ ] 检查 Git diff，确认没有 CA 密码或 P12 内容进入仓库。
