# 手工与自动验收

## 从零启动
1. 删除 `.venv/` 与 `data/study.db`。
2. macOS/Linux 执行 `bash start.sh`；Windows 执行 `start.bat`。
3. 浏览器应自动打开 `http://127.0.0.1:8000`，`/health` 返回 `ok`。
4. 逐一点击 12 个导航入口，确认无 500。

## 计时
开始计时，运行一段时间后点击暂停；刷新页面，确认仍为暂停；等待 2 分钟后继续并结束。数据库 `study_session.paused_sec` 应约为 120，`duration_sec` 不含暂停。关闭标签页后重新打开，同一台电脑由 SQLite + localStorage 恢复未结束计时。

## PDF 导入
上传有文本层 PDF；所有题先保持 `verified=0`。人工校对题干、模块、答案后确认；只有全部确认后才能 commit。重复上传同一 SHA256 文件应被拒绝。

## 错题闭环
导入至少一题错误，确认 `mistake.cause_primary` 初始为空；补充错因后进入错误模式统计。复训提交后确认 `review_attempt` 写入及 `next_review_at` 更新。

## 内容
执行 `python tools/content_lint.py content/nodes --cross-check`。只有全绿节点才允许在 seed 中标记为 `已建设`。

## 未在自动环境中冒充通过的项目
- Windows 实机中文控制台与浏览器显示；
- macOS 实机自动打开浏览器；
- 1440×900 最终目视首屏；
- 真实 `快速智能练习.pdf` fixture 若未放入 `tests/fixtures/`，对应解析断言必须 skip 而不是伪造通过。
