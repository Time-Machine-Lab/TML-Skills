import argparse
import os
from pathlib import Path


CONTEXT_TEMPLATE = """请在本文件补充你的业务约束与发布偏好。\n\n建议包含：\n1) 目标受众（例如：学生党/程序员/新手副业）\n2) 价格策略（底价、是否可小刀、是否包邮）\n3) 禁用词或敏感点\n4) 你希望的语气（专业/可信/简洁/急出）\n5) 其他平台复用要求（如小红书/朋友圈同源信息）\n"""

PRODUCT_TEMPLATE = """# 产品介绍文档（可直接粘贴你的现有文档）\n\n产品名称: \n产品类型: 实物/虚拟\n目标人群: \n核心功能: \n核心卖点: \n交付方式: \n适用场景: \n信任背书: \n价格信息: \n风险与边界: \n\n# 可选补充\n- 常见问题\n- 用户反馈\n- 成交案例\n"""

SIMILAR_TEMPLATE = """# 竞品帖子补充（可选）\n\n将你手动收集的闲鱼同类帖子粘贴在此（标题、价格、卖点、评论反馈）。\n脚本会把这些内容与自动检索结果合并，提升文案贴合度。\n"""


def ensure_file(path: Path, content: str) -> None:
    if not path.exists():
        path.write_text(content, encoding="utf-8")


def init_workspace(workspace: Path) -> None:
    input_dir = workspace / "input"
    output_dir = workspace / "output"
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    ensure_file(input_dir / "context.txt", CONTEXT_TEMPLATE)
    ensure_file(input_dir / "product_brief.md", PRODUCT_TEMPLATE)
    ensure_file(input_dir / "similar_posts.txt", SIMILAR_TEMPLATE)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize a Xianyu post generation workspace")
    parser.add_argument("workspace", help="Workspace path to initialize")
    args = parser.parse_args()

    ws = Path(os.path.abspath(args.workspace))
    init_workspace(ws)
    print(f"Initialized workspace: {ws}")
    print(f"Input folder: {ws / 'input'}")
    print(f"Output folder: {ws / 'output'}")
