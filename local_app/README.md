# 本地公考备考系统

## 启动

### Windows

在 `local_app` 目录双击 `start.bat`，或命令行执行：

```bat
start.bat
```

### macOS / Linux

```bash
cd local_app
bash start.sh
```

首次启动会自动创建 `.venv` 并安装依赖：Flask、pypdf、Markdown。之后启动复用环境。

服务地址：`http://127.0.0.1:8765`

## 当前功能

- 数据驾驶舱
- 学习计时与每日有效学习统计
- 6 大行测专题 × 50 个目录节点
- **来源优先的行测学习页**：你的旧笔记精华 → 推荐主方法 → 速解 → 边界/易错 → 名师综合 → 闭卷复盘
- 错题复训答题界面
- PDF 上传与本地解析
- 训练记录 / 错题本 SQLite 入库
- 复训答案和耗时记录
- 两周系统恢复与后续阶段规划

## 行测内容为什么与旧版本不同

旧版本最大的错误是“有50页目录，但很多页面只是把同一套模板换标题”，这不算可学习内容。

当前内容引擎已经拆成：

```text
knowledge_catalog.py        # 300个目录节点
knowledge_source_core.py    # 从用户原始旧笔记重新核对出的核心原文精华
knowledge_curated_extra.py  # 高频题型逐页独立精编
knowledge_rich.py           # 来源匹配、Markdown渲染、名师综合
knowledge_enriched.py       # 最终合并层
knowledge_seed.py           # app.py兼容入口
```

目前优先把资料、判断、言语、数量中真正高频的节点做深，而不是继续增加“假页数”。详细内容审计见 `CONTENT_AUDIT.md`。

## 本地数据

运行后自动生成：

```text
data/
├── study.db
└── uploads/
```

## PDF 解析说明

当前版本优先解析有文字层的训练 PDF。解析器会尝试提取题号、A-D 选项、正确答案、用户答案与模块，并给每题计算置信度。低置信结果不会伪装成高可信结果；后续继续用真实粉笔 PDF 校准格式适配器。

## PRD

见 `PRD.md`。
