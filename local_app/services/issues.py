from __future__ import annotations

from db import query, query_one


def _issue(rule_id: str, score: int, text: str, evidence: str, action_url: str, severity: str) -> dict:
    """Return the documented issue contract plus temporary display aliases."""
    return {
        'rule_id': rule_id,
        'score': score,
        'text': text,
        'evidence': evidence,
        'action_url': action_url,
        # Compatibility aliases for the current dashboard renderer.
        'severity': severity,
        'title': text,
        'detail': evidence,
        'href': action_url,
    }


def top_issues(limit: int = 5) -> list[dict]:
    out: list[dict] = []
    patterns = query(
        """SELECT * FROM error_pattern
           WHERE status IN ('稳定错误模式','修复中')
           ORDER BY occurrences DESC
           LIMIT 3"""
    )
    for pattern in patterns:
        out.append(
            _issue(
                rule_id=f"error-pattern:{pattern['id']}",
                score=min(100, 70 + int(pattern['occurrences'] or 0) * 5),
                text=f"{pattern['module']}·{pattern['cause_primary']}反复出现",
                evidence=(
                    f"错误模式已出现 {pattern['occurrences']} 次，"
                    f"覆盖 {pattern['distinct_trainings']} 次训练；依据 error_pattern #{pattern['id']}。"
                ),
                action_url='/mistakes',
                severity='high',
            )
        )

    zeros = query(
        """SELECT k.slug,k.title,json_extract(k.module_names,'$.guangdong') module
           FROM knowledge_node k
           LEFT JOIN node_mastery n ON n.node_slug=k.slug
           WHERE k.subject='xingce'
             AND k.priority_batch<=2
             AND COALESCE(n.sample_n,0)=0
           LIMIT 2"""
    )
    for node in zeros:
        out.append(
            _issue(
                rule_id=f"knowledge-no-sample:{node['slug']}",
                score=55,
                text=f"{node['title']}尚无有效样本",
                evidence='该节点有效训练样本数为 0，当前不能据此判断是否掌握。',
                action_url=f"/knowledge?node={node['slug']}",
                severity='medium',
            )
        )

    shenlun = query_one(
        """SELECT COALESCE(SUM(duration_sec),0) s
           FROM study_session
           WHERE subject='shenlun'
             AND date(study_date)>=date('now','-6 day')"""
    )
    if shenlun and shenlun['s'] < 3 * 3600:
        hours = shenlun['s'] / 3600
        out.append(
            _issue(
                rule_id='shenlun-weekly-time-low',
                score=50,
                text='申论本周投入偏低',
                evidence=f'近 7 天有效申论时长 {hours:.1f}h；当前路线基线约 5.5h/周。',
                action_url='/shenlun',
                severity='medium',
            )
        )
    return out[:limit]
