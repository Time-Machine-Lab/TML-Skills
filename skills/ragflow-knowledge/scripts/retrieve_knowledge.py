import os
import requests
import argparse
import sys
import json
from utils import load_config, get_base_url

def retrieve_knowledge():
    config = load_config()
    
    parser = argparse.ArgumentParser(description="Retrieve knowledge from RAGFlow")
    parser.add_argument("--query", required=True, help="Question to ask the knowledge base")
    parser.add_argument("--chat_id", help="Chat/Assistant ID to use", default=config.get("RAGFLOW_CHAT_ID"))
    parser.add_argument("--base_url", help="RAGFlow base URL", default=config.get("RAGFLOW_BASE_URL"))
    parser.add_argument("--api_key", help="RAGFlow API Key", default=config.get("RAGFLOW_API_KEY"))
    
    args = parser.parse_args()
    
    query = args.query
    chat_id = args.chat_id
    base_url = args.base_url
    api_key = args.api_key
    
    if not base_url or not api_key:
        print("Error: RAGFlow configuration missing. Please run 'python3 scripts/check_config.py' first.")
        sys.exit(1)
        
    if not chat_id:
        print("Error: RAGFLOW_CHAT_ID is required for retrieval.")
        print("Please obtain the Chat ID from your RAGFlow Assistant settings and set it in scripts/.env or via --chat_id.")
        sys.exit(1)

    full_url = get_base_url(base_url)
    url = f"{full_url}/chats_openai/{chat_id}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "ragflow", 
        "messages": [
            {"role": "user", "content": query}
        ],
        "stream": False
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        if response.status_code == 200:
            result = response.json()
            choices = result.get("choices", [])
            if choices:
                answer = choices[0].get("message", {}).get("content", "")
                print(answer)
            else:
                print("No answer returned.")
        else:
            print(f"Error: Retrieval failed (Status Code: {response.status_code})")
            print(response.text)
            sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"Error: Request failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    retrieve_knowledge()
