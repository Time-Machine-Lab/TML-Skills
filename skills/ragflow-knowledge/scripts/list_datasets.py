import os
import requests
import json
import sys
from utils import load_config, get_base_url

def list_datasets():
    config = load_config()
    base_url = config.get("RAGFLOW_BASE_URL")
    api_key = config.get("RAGFLOW_API_KEY")
    
    if not base_url or not api_key:
        print("Error: RAGFlow configuration missing. Please run 'python3 scripts/check_config.py' first.")
        sys.exit(1)

    full_url = get_base_url(base_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(f"{full_url}/datasets?page=1&page_size=100", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == 0:
                datasets = data.get("data", [])
                output = []
                for ds in datasets:
                    output.append({
                        "id": ds.get("id"),
                        "name": ds.get("name"),
                        "description": ds.get("description", ""),
                        "permission": ds.get("permission", "me"),
                        "doc_count": ds.get("doc_count", 0)
                    })
                # Output JSON for the Agent to parse easily
                print(json.dumps(output, ensure_ascii=False, indent=2))
            else:
                print(f"Error: API returned code {data.get('code')}: {data.get('message')}")
                sys.exit(1)
        else:
            print(f"Error: Failed to connect (Status Code: {response.status_code})")
            sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    list_datasets()
