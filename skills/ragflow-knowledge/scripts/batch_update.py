import os
import requests
import sys
import json
from utils import load_config, get_base_url

# Define the updates
UPDATES = {
    "TML-技术文档": "存放团队核心技术沉淀，包括领域驱动设计(DDD)、架构设计模式、技术规范、技术方案及论文。",
    "TML-团队规范": "团队协作标准与管理流程，包括代码编写规范、Git 提交规范、研发流程管理制度、考勤与行政规则。",
    "TML-公共资源": "团队公共资产与基础设施信息，包括服务器资产列表、脱敏后的账号管理、常用软件工具包下载地址、常见问题解答(FAQ)。",
    "TML-项目文档": "具体项目的全生命周期文档，包括需求规格说明书(PRD)、项目排期表、会议纪要、测试报告与验收文档。",
    "TML-知识库": "非结构化或未分类的通用知识，包括行业动态、竞品情报、外部采集的参考资料及碎片化信息。"
}

def batch_update():
    config = load_config()
    base_url = config.get("RAGFLOW_BASE_URL")
    api_key = config.get("RAGFLOW_API_KEY")
    
    if not base_url or not api_key:
        print("Error: RAGFlow configuration missing.")
        sys.exit(1)

    full_url = get_base_url(base_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    print("Fetching existing datasets...")
    try:
        response = requests.get(f"{full_url}/datasets?page=1&page_size=100", headers=headers)
        if response.status_code != 200:
            print(f"Error listing datasets: {response.status_code}")
            sys.exit(1)
            
        data = response.json()
        if data.get("code") != 0:
            print(f"Error listing datasets: {data.get('message')}")
            sys.exit(1)
            
        existing_datasets = {ds['name']: ds for ds in data.get("data", [])}
        
        for name, description in UPDATES.items():
            if name in existing_datasets:
                ds = existing_datasets[name]
                print(f"Updating '{name}'...")
                
                update_payload = {
                    "name": name,
                    "description": description,
                    "permission": ds.get("permission", "me"),
                    "avatar": ds.get("avatar", ""),
                    # "tenant_id": ds.get("tenant_id") # Removing tenant_id as it causes "Extra inputs are not permitted"
                }
                
                update_res = requests.put(f"{full_url}/datasets/{ds['id']}", headers=headers, json=update_payload)
                
                if update_res.status_code == 200:
                    res_data = update_res.json()
                    if res_data.get("code") == 0:
                        print(f"  ✅ Success")
                    else:
                        print(f"  ❌ Failed: {res_data.get('message')}")
                else:
                    print(f"  ❌ Failed: {update_res.status_code}")
            else:
                print(f"⚠️ Dataset '{name}' not found. Skipping.")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    batch_update()
