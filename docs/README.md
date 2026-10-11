# 文档（`docs/`）

本目录放 `iskill-headroom-workbuddy2api` 的**调研与设计文档**——仅供阅读，不是运行时依赖，删掉不影响脚本。

| 文档 | 说明 |
|---|---|
| [`token-savings-research.md`](token-savings-research.md) | **省 Token 方案调研**：headroom 官方文档要点、四本账单价口径、本机 `/stats` 实测、开源横向对比、按 ROI 排序的杠杆、自研形态 A/B/C |

> ⚠️ **别把这个目录当落地页的发布源。** `iskill-promo-page` 的 `init.mjs --out docs`
> 会往这里铺站点（对非空目录默认拒写，加 `--force` 就会和调研文档混在一起，并随 Pages 一起公开）。
> 本仓库发布落地页请用 `promo-page/` + GitHub Actions 工作流。

## 本技能的定位

调研结论是 **本链路真正的杠杆是上游缓存命中率（命中 vs 未命中 ≈ 1 : 12），压缩只占 1% 量级**。
据此本技能定位为**双价值**，一句话：

> **hub 让内置模型「用得上」，headroom 让它「跑得远」。**

| 价值 | 组件 | 一句话 |
|---|---|---|
| 能用 | workbuddy2api-hub | 私有协议转 OpenAI + 看板 OAuth 加账号 + 多账号双区域调度 + 每日保活 |
| 耐用 | Headroom | 冻结前缀守住上游缓存（命中 = 未命中的 2%）+ 只压最新增量 → 会话跑得更远 |

