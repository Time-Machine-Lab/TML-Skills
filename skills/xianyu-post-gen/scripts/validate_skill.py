import json
import os
import subprocess
import sys
from typing import List


def _base_dir() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _require_files(paths: List[str]) -> List[str]:
    missing = []
    for rel in paths:
        if not os.path.exists(os.path.join(_base_dir(), rel)):
            missing.append(rel)
    return missing


def _check_reference_tables() -> List[str]:
    problems = []
    ref_dir = os.path.join(_base_dir(), "references")
    for name in os.listdir(ref_dir):
        if not name.startswith("reference_major_") or not name.endswith(".md"):
            continue
        path = os.path.join(ref_dir, name)
        with open(path, "r", encoding="utf-8") as f:
            txt = f.read()
        if "| 标题 | 价格 | 想要人数 | 发布时间 |" not in txt:
            problems.append(f"{name}: missing top table header")
    return problems


def _run_smoke_test() -> str:
    script = os.path.join(_base_dir(), "scripts", "generate_post.py")
    cmd = [
        sys.executable,
        script,
        "商品名称: iPhone 13\n成色: 95新\n售价: 2999\n转手原因: 换新机\n亮点: 电池健康90%以上；功能正常",
        "--json",
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True, encoding="utf-8")
        payload = json.loads(out)
    except Exception as exc:  # noqa: BLE001
        return f"smoke test failed: {exc}"

    if not payload.get("variations"):
        return "smoke test failed: empty variations"
    first = payload["variations"][0]
    if any(ch in (first.get("title", "") + first.get("body", "")) for ch in ["🔥", "❤️", "✅", "⚡"]):
        return "smoke test failed: unicode emoji not sanitized"
    return ""


def main() -> int:
    required = [
        "SKILL.md",
        "assets/styles.json",
        "assets/emojis.json",
        "scripts/init_workspace.py",
        "scripts/run_workspace.py",
        "scripts/generate_post.py",
        "scripts/search_references.py",
        "scripts/xianyu_live_search.py",
        "references/REFERENCE_CATALOG.md",
    ]
    missing = _require_files(required)
    if missing:
        print("Missing files:")
        for item in missing:
            print(f"- {item}")
        return 1

    ref_problems = _check_reference_tables()
    if ref_problems:
        print("Reference format issues:")
        for item in ref_problems:
            print(f"- {item}")
        return 1

    smoke_error = _run_smoke_test()
    if smoke_error:
        print(smoke_error)
        return 1

    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
