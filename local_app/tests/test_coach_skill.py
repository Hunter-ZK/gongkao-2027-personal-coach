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
