# 2027 公考个人备考工作台

> **前端工作台：[`docs/index.html`](docs/index.html)**  
> **Markdown 运行记录：[`workbench/dashboard.md`](workbench/dashboard.md)**

这是 2027 广东省考 + 国考的长期个人备考仓库。当前已从“Markdown 导航页”升级为：

**前端工作台 + 行测知识库 + 做题记录 + 错题本 + 方法论 + 阶段计划 + 每日监督 + 名师/社区研究 + 申论积累。**

## 目标优先级

1. 广东省考：省直 / 深圳市直综合管理职位；
2. 国考：中央机关及其省级直属机构综合管理类。

## 当前阶段

**Phase 0A-R｜行测系统快速恢复**

Day 1 已完成两组快速练习：共30题、24对、约41分钟。当前不直接用小样本预测整卷成绩，而是先完成完整行测知识框架恢复，再进行分模块计时和广东90分钟整卷基线。

## 前端系统

`docs/` 是当前前端版本：

- `index.html`：完整工作台界面；
- `styles.css`：响应式布局；
- `data.js`：训练、错题、计划、研究与实战方法卡；
- `app.js`：导航、筛选、搜索、详情展示等交互。

当前界面已覆盖：

- 总览 KPI 与模块表现；
- 两次训练趋势；
- 可搜索/筛选的行测方法卡；
- 方法卡触发场景、步骤、边界、误用、个人验证；
- 训练记录；
- 错题/错误模式；
- 阶段路线与首轮恢复进度；
- 名师/机构/学员复盘/GitHub Skill 研究中心。

> GitHub 连接器当前没有仓库 Pages 设置权限，因此代码已就位，但仓库如需生成 GitHub Pages 在线地址，需要账户侧把 Pages 来源切到该静态站点/Actions。前端本身不依赖框架，可直接本地打开或用任意静态服务器运行。

## 行测知识库 v2

新增：

- [`notes/xingce/10-行测实战方法库-v2.md`](notes/xingce/10-行测实战方法库-v2.md)：经多源检索、数学/逻辑校验后的实战方法库；
- [`references/xingce-web-synthesis-2026-09-13.md`](references/xingce-web-synthesis-2026-09-13.md)：外部来源与最终采用/拒绝结论的分离记录。

方法不再只保存“公式/口诀”，而是统一记录：

`触发场景 → 操作步骤 → 适用边界 → 常见误用 → 个人验证状态`

明确拒绝直接写入个人稳定方法的内容包括：答案分布蒙题、万能固定顺序、转折后必重点、意图题必选对策、加强削弱万能强度排序等。

## Markdown 工作区

- [`workbench/dashboard.md`](workbench/dashboard.md)：运行状态摘要；
- [`workbench/notes-dashboard.md`](workbench/notes-dashboard.md)：笔记修订；
- [`workbench/xingce-recovery-dashboard.md`](workbench/xingce-recovery-dashboard.md)：快速恢复训练；
- [`workbench/training-dashboard.md`](workbench/training-dashboard.md)：做题历史；
- [`workbench/mistake-dashboard.md`](workbench/mistake-dashboard.md)：错题与错误模式；
- [`workbench/plan-dashboard.md`](workbench/plan-dashboard.md)：阶段/周/日计划；
- [`workbench/research-dashboard.md`](workbench/research-dashboard.md)：名师、学员笔记和GitHub Skill研究。

## 数据底座

- `data/training-log.csv`：训练主表；
- `data/question-log.csv`：逐题记录；
- `data/error-patterns.csv`：错误模式；
- `data/methods.csv`：候选/稳定方法；
- `data/daily-progress.csv`：每日完成度；
- `data/research-log.csv`：外部研究；
- `records/`：每次训练完整档案。

## 使用方式

用户只需要：

1. 做完题后上传截图 / PDF / 成绩页；
2. 学完一个模块时告诉 AI；
3. 一天结束说“收工”。

AI负责：

`读取 → 核验 → 入库 → 复盘 → 错误模式 → 笔记修订 → 方法论 → 前端数据 → 下一步计划`
