# 2027 公考个人备考工作台

> **主入口：[`workbench/dashboard.md`](workbench/dashboard.md)**

这是 2027 广东省考 + 国考的长期个人备考仓库。它不是资料存档目录，而是持续运行的：

**知识库 + 做题记录 + 错题本 + 方法论 + 阶段计划 + 每日监督 + 名师/社区研究 + 申论积累。**

## 目标优先级

1. 广东省考：省直 / 深圳市直综合管理职位；
2. 国考：中央机关及其省级直属机构综合管理类。

## 当前阶段

**Phase 0A-R｜行测系统快速恢复**

Day 1 已完成两组快速练习：共30题、24对、约41分钟。当前不直接用小样本预测整卷成绩，而是先完成完整行测知识框架恢复，再进行分模块计时和广东90分钟整卷基线。

## 六个工作区

- [`workbench/dashboard.md`](workbench/dashboard.md)：**主 Dashboard**，打开仓库优先看这里；
- [`workbench/notes-dashboard.md`](workbench/notes-dashboard.md)：完整行测笔记与笔记修订；
- [`workbench/xingce-recovery-dashboard.md`](workbench/xingce-recovery-dashboard.md)：快速恢复训练；
- [`workbench/training-dashboard.md`](workbench/training-dashboard.md)：做题历史、正确率、速度；
- [`workbench/mistake-dashboard.md`](workbench/mistake-dashboard.md)：错题本、错误模式和修复；
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

## 知识底座

`notes/xingce/` 已建立：资料分析、判断推理、言语理解、数量关系、政治理论/常识、广东科学推理完整恢复笔记。

笔记来源包括：用户旧笔记、公开名师课程、学员结构化笔记、模考复盘和高质量GitHub Skill。外部技巧只作为候选，最终由个人真题数据验证。

## 使用方式

用户只需要：

1. 做完题后上传截图 / PDF / 成绩页；
2. 学完一个模块时告诉 AI；
3. 一天结束说“收工”。

AI负责：

`读取 → 核验 → 入库 → 复盘 → 错误模式 → 笔记修订 → 方法论 → Dashboard → 下一步计划`
