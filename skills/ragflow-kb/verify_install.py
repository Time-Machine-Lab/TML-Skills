#!/usr/bin/env python3
"""
RAGFlow Skill 安装验证脚本
检查依赖和基本功能
"""

import sys
import os
import json
from pathlib import Path

def check_python_version():
    """检查 Python 版本"""
    print("✓ 检查 Python 版本...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 7:
        print(f"  ✅ Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print(f"  ❌ Python 版本过低: {version.major}.{version.minor}")
        return False


def check_dependencies():
    """检查依赖"""
    print("\n✓ 检查依赖...")
    try:
        import requests
        print(f"  ✅ requests {requests.__version__}")
        return True
    except ImportError:
        print("  ❌ requests 未安装")
        print("  运行: pip install -r requirements.txt")
        return False


def check_script_files():
    """检查脚本文件"""
    print("\n✓ 检查脚本文件...")
    script_dir = Path(__file__).parent / "scripts"
    
    required_files = [
        "__init__.py",
        "ragflow_client.py",
        "ragflow_agent.py"
    ]
    
    all_exist = True
    for file in required_files:
        file_path = script_dir / file
        if file_path.exists():
            print(f"  ✅ {file}")
        else:
            print(f"  ❌ {file} 不存在")
            all_exist = False
    
    return all_exist


def check_reference_files():
    """检查参考文件"""
    print("\n✓ 检查参考文件...")
    ref_dir = Path(__file__).parent / "references"
    
    required_files = [
        "api_reference.md",
        "usage_guide.md"
    ]
    
    all_exist = True
    for file in required_files:
        file_path = ref_dir / file
        if file_path.exists():
            print(f"  ✅ {file}")
        else:
            print(f"  ❌ {file} 不存在")
            all_exist = False
    
    return all_exist


def check_config_file():
    """检查配置文件"""
    print("\n✓ 检查配置文件...")
    config_file = Path.home() / ".ragflow" / "config.json"
    
    if config_file.exists():
        try:
            with open(config_file, "r") as f:
                config = json.load(f)
            print(f"  ✅ 配置文件存在")
            print(f"     URL: {config.get('url', 'N/A')}")
            return True
        except Exception as e:
            print(f"  ⚠️  配置文件存在但无法读取: {e}")
            return False
    else:
        print(f"  ℹ️  配置文件不存在 (首次使用需要配置)")
        return True


def test_imports():
    """测试导入"""
    print("\n✓ 测试导入...")
    try:
        script_dir = Path(__file__).parent / "scripts"
        sys.path.insert(0, str(script_dir))
        
        from ragflow_client import RAGFlowConfig, RAGFlowClient
        print("  ✅ ragflow_client 导入成功")
        
        from ragflow_agent import RAGFlowAgent
        print("  ✅ ragflow_agent 导入成功")
        
        return True
    except Exception as e:
        print(f"  ❌ 导入失败: {e}")
        return False


def main():
    """主函数"""
    print("\n" + "="*60)
    print("  RAGFlow Skill 安装验证")
    print("="*60 + "\n")
    
    checks = [
        ("Python 版本", check_python_version),
        ("依赖", check_dependencies),
        ("脚本文件", check_script_files),
        ("参考文件", check_reference_files),
        ("配置文件", check_config_file),
        ("导入测试", test_imports),
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"  ❌ 检查失败: {e}")
            results.append((name, False))
    
    # 总结
    print("\n" + "="*60)
    print("  验证总结")
    print("="*60 + "\n")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{status}: {name}")
    
    print(f"\n总体: {passed}/{total} 检查通过\n")
    
    if passed == total:
        print("✅ 所有检查通过！")
        print("\n下一步:")
        print("  1. 配置 RAGFlow:")
        print("     python scripts/ragflow_agent.py configure --url <url> --api-key <key>")
        print("  2. 验证配置:")
        print("     python scripts/ragflow_agent.py check-config")
        print("  3. 查看示例:")
        print("     python examples.py")
        return 0
    else:
        print("❌ 某些检查失败，请解决上述问题")
        return 1


if __name__ == "__main__":
    sys.exit(main())
