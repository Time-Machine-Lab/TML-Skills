import os
import requests
import argparse
import sys
import getpass
from utils import load_config, save_config, get_base_url

def check_config():
    # Load configuration
    config = load_config()
    base_url = config.get("RAGFLOW_BASE_URL")
    api_key = config.get("RAGFLOW_API_KEY")
    chat_id = config.get("RAGFLOW_CHAT_ID")
    
    # Prompt user if missing
    if not base_url or not api_key:
        print("RAGFlow Configuration Missing.")
        print("Please provide the following details:")
        
        if not base_url:
            base_url = input("Enter RAGFlow Base URL (e.g., http://localhost:9380): ").strip()
        
        if not api_key:
            api_key = getpass.getpass("Enter RAGFlow API Key: ").strip()
            
        if not chat_id:
            print("\nOptional: To use retrieval features, you need a Chat ID (from Assistant settings).")
            chat_id_input = input("Enter Chat ID (or press Enter to skip): ").strip()
            if chat_id_input:
                chat_id = chat_id_input

        # Save configuration
        save_config(base_url, api_key, chat_id)
        
    # Re-check and proceed
    full_url = get_base_url(base_url)
    
    print(f"\nChecking configuration for RAGFlow at: {full_url}")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # 1. Check Connection (List Datasets)
    try:
        response = requests.get(f"{full_url}/datasets?page=1&page_size=10", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == 0:
                print("Connection successful! \u2705")
                datasets = data.get("data", [])
                print(f"Found {len(datasets)} datasets:")
                for ds in datasets:
                    print(f"  - {ds.get('name')} (ID: {ds.get('id')})")
            else:
                print(f"Error: API returned code {data.get('code')}: {data.get('message')}")
                sys.exit(1)
        elif response.status_code == 401:
            print("Error: Unauthorized. Check your API Key.")
            sys.exit(1)
        else:
            print(f"Error: Failed to connect (Status Code: {response.status_code})")
            print(response.text)
            sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"Error: Connection failed: {e}")
        sys.exit(1)

    # 2. Check Chat ID
    if chat_id:
        print(f"\nChat ID configured: {chat_id}")
    else:
        print("\n--- Configuration Tips ---")
        print("To use 'retrieve_knowledge.py', you need a Chat ID.")
        print("You can find your Chat ID in the RAGFlow UI:")
        print("1. Go to 'Chat' or 'Assistant' section.")
        print("2. Select an assistant.")
        print("3. The ID is usually in the URL (e.g., .../chat/12345) or in the API settings.")
        print("You can run this script again to update configuration.")
    
    print("\nConfiguration check complete.")

if __name__ == "__main__":
    check_config()
