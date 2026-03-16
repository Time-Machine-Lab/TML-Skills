import os
import requests
import argparse
import sys
import json
from utils import load_config, get_base_url

def update_dataset_description():
    config = load_config()
    
    parser = argparse.ArgumentParser(description="Update RAGFlow dataset description")
    parser.add_argument("--dataset_name", required=True, help="Name of the dataset to update")
    parser.add_argument("--description", required=True, help="New description")
    
    args = parser.parse_args()
    target_name = args.dataset_name
    new_description = args.description
    
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
        # 1. Find Dataset ID
        dataset_id = None
        target_ds_data = None
        
        # Need to iterate because name filter might not be exact or multiple
        response = requests.get(f"{full_url}/datasets?page=1&page_size=100", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == 0:
                datasets = data.get("data", [])
                for ds in datasets:
                    if ds.get("name") == target_name:
                        dataset_id = ds.get("id")
                        target_ds_data = ds
                        break
            else:
                print(f"Error listing datasets: {data.get('message')}")
                sys.exit(1)
        else:
            print(f"Error listing datasets: {response.status_code}")
            sys.exit(1)
            
        if not dataset_id:
            print(f"Dataset '{target_name}' not found.")
            sys.exit(1)

        # 2. Update Description
        # Construct payload with existing values to avoid overwriting them with defaults if PUT is full replace
        # Based on typical REST API, PUT usually replaces resource. PATCH updates partial.
        # RAGFlow API documentation (from snippets) suggests "Updates configurations...".
        # Let's try sending just description first. If it fails or clears other fields, we might need to send all.
        # Safest bet is to include what we know.
        
        update_payload = {
            "name": target_name, # Keep name
            "description": new_description,
            "permission": target_ds_data.get("permission", "me"),
            "avatar": target_ds_data.get("avatar", ""),
            "tenant_id": target_ds_data.get("tenant_id")
        }
        
        # Using PUT based on typical patterns, endpoint /datasets/{id}
        update_response = requests.put(f"{full_url}/datasets/{dataset_id}", headers=headers, json=update_payload)
        
        if update_response.status_code == 200:
            res_data = update_response.json()
            if res_data.get("code") == 0:
                print(f"Successfully updated description for '{target_name}'")
            else:
                print(f"Error updating description: {res_data.get('message')}")
        else:
            print(f"Error updating description: {update_response.status_code} {update_response.text}")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    update_dataset_description()
