from __future__ import annotations

import json

import services.gongkao_skill as skill


def test_skill_sources_are_registered():
    sources = skill.load_sources()
    assert len(sources) >= 13
    repos = {x["repo"] for x in sources}
    assert "tyf152119-web/wangyou-honglingjin-perspective" in repos
    assert "WangJunqing-coder/huasheng13-skill" in repos
    assert "Suny0u17g/xiaop-data-analysis-skill" in repos


def test_secret_config_never_returns_key(tmp_path, monkeypatch):
    path = tmp_path / "secrets.json"
    monkeypatch.setattr(skill, "SECRETS_PATH", path)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    public = skill.save_secret_config(api_key="sk-test-secret", model="deepseek-v4-flash", thinking=False)
    assert public["configured"] is True
    assert "api_key" not in public
    assert "sk-test-secret" not in json.dumps(public)
    assert json.loads(path.read_text(encoding="utf-8"))["api_key"] == "sk-test-secret"


def test_system_prompt_retrieves_local_material():
    prompt, refs = skill.build_system_prompt("资料分析基期量怎么做")
    assert "本轮回答纪律" in prompt
    assert refs
    assert any("ABRX" in x["text"] or "基期" in x["text"] or "资料" in x["title"] for x in refs)


def test_coach_retrieval_uses_source_grounded_79_method_catalog():
    refs = skill.retrieve_context("415份数法如何求基期量", limit=5)
    assert any("415份数法" in x["title"] for x in refs)
    method_refs = [x for x in refs if x["kind"] == "method" and "415份数法" in x["title"]]
    assert method_refs
    assert all(x["source"] == "content/methods/source/*.json" for x in method_refs)
    assert "A:X:B" in method_refs[0]["text"] or "份数" in method_refs[0]["text"]


def test_coach_can_retrieve_cross_module_methods():
    cases = {
        "六面体怎么排除": "六面体",
        "工程问题最小公倍数怎么赋值": "工程问题",
        "逻辑填空怎么抓对应": "逻辑填空",
    }
    for query, expected in cases.items():
        refs = skill.retrieve_context(query, limit=6)
        assert any(expected in x["title"] for x in refs), (query, [x["title"] for x in refs])
