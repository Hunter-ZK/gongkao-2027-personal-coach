export const ZEN_TERM_MAP: Record<string, string> = {
  "2027 公考备考工作台": "工作任务与个人笔记", "2027公考备考工作台": "工作任务与个人笔记", "公考备考工作台": "工作台与个人笔记",
  "公考": "综合考核", "备考": "专项推进", "行测体系": "系统架构与分析", "行测": "系统分析", "申论体系": "综合报告写作", "申论": "综合报告",
  "错题本": "缺陷与质量日志", "错题复训": "缺陷复验与重构", "错题": "缺陷记录", "训练记录": "执行与测试记录", "全量题库": "全量案例库", "题库": "案例库",
  "备考规划": "里程碑规划", "能力趋势": "交付效率趋势", "AI 方法教练": "AI 流程顾问", "AI 教练": "AI 顾问", "广东省考": "Q1 业务专项", "国考副省级": "Q4 重点项目",
  "刷题训练": "演练测试", "真题训练": "案例实战", "知识恢复": "规范温习", "模考测试": "全链路压测", "总结复盘": "项目复盘", "做题": "演算", "答题": "推演"
};
export function tZen(text:string,isZen:boolean):string { if(!isZen)return text; let result=text; for(const [key,val] of Object.entries(ZEN_TERM_MAP)) result=result.replaceAll(key,val); return result; }
