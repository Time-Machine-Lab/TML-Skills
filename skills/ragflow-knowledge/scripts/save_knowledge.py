import os
import requests
import argparse
import sys
import json
import time
import tempfile
from utils import load_config, save_config, get_base_url

def save_knowledge():
    config = load_config()
    
    parser = argparse.ArgumentParser(description="Save knowledge to RAGFlow")
    parser.add_argument("--content", help="Text content to save")
    parser.add_argument("--file_path", help="Path to file to upload")
    parser.add_argument("--dataset_name", default="TraeKnowledge", help="Name of the dataset")
    parser.add_argument("--base_url", help="RAGFlow base URL", default=config.get("RAGFLOW_BASE_URL"))
    parser.add_argument("--api_key", help="RAGFlow API Key", default=config.get("RAGFLOW_API_KEY"))
    parser.add_argument("--dataset_id", help="Target Dataset ID", default=config.get("RAGFLOW_DATASET_ID"))
    
    args = parser.parse_args()
    
    content = args.content
    file_path = args.file_path
    dataset_name = args.dataset_name
    base_url = args.base_url
    api_key = args.api_key
    dataset_id = args.dataset_id
    
    if not base_url or not api_key:
        print("Error: RAGFlow configuration missing. Please run 'python3 scripts/check_config.py' first.")
        sys.exit(1)

    if not content and not file_path:
        print("Error: Either --content or --file_path must be provided.")
        sys.exit(1)

    full_url = get_base_url(base_url)

    headers = {
        "Authorization": f"Bearer {api_key}"
    }

    # 1. Find or Create Dataset (if dataset_id not provided)
    if not dataset_id:
        try:
            # List datasets
            response = requests.get(f"{full_url}/datasets?page=1&page_size=100&name={dataset_name}", headers=headers)
            if response.status_code == 200:
                data = response.json()
                if data.get("code") == 0:
                    datasets = data.get("data", [])
                    for ds in datasets:
                        if ds.get("name") == dataset_name:
                            dataset_id = ds.get("id")
                            break
                else:
                    print(f"Error listing datasets: {data.get('message')}")
                    sys.exit(1)
            
            if not dataset_id:
                # Create dataset
                print(f"Dataset '{dataset_name}' not found. Creating...")
                create_payload = {
                    "name": dataset_name,
                    "avatar": "",
                    "description": "Created by Trae Skill",
                    "permission": "me",
                    "chunk_method": "naive",
                    "parser_config": {"chunk_token_num": 128, "delimiter": "\n", "html4excel": False, "layout_recognize": True, "raptor": {"use_raptor": False}}
                }
                create_response = requests.post(f"{full_url}/datasets", headers=headers, json=create_payload)
                if create_response.status_code == 200:
                    create_data = create_response.json()
                    if create_data.get("code") == 0:
                        dataset_id = create_data.get("data", {}).get("id")
                        print(f"Dataset created with ID: {dataset_id}")
                        # Save dataset_id to config for future use
                        save_config(None, None, dataset_id=dataset_id)
                    else:
                        print(f"Error creating dataset: {create_data.get('message')}")
                        sys.exit(1)
                else:
                    print(f"Error creating dataset: {create_response.status_code} {create_response.text}")
                    sys.exit(1)
            else:
                 # Save found dataset_id to config
                 save_config(None, None, dataset_id=dataset_id)

        except Exception as e:
            print(f"Error managing dataset: {e}")
            sys.exit(1)

    # 2. Upload Document
    temp_file_obj = None
    processing_file_path = file_path
    
    if content:
        # Save content to temporary file
        temp_file_obj = tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix=".txt")
        temp_file_obj.write(content)
        temp_file_obj.close()
        processing_file_path = temp_file_obj.name
    
    if not os.path.exists(processing_file_path):
        print(f"Error: File not found: {processing_file_path}")
        sys.exit(1)

    try:
        with open(processing_file_path, 'rb') as f:
            files = {'file': (os.path.basename(processing_file_path), f)}
            upload_headers = {"Authorization": f"Bearer {api_key}"}
            upload_response = requests.post(f"{full_url}/datasets/{dataset_id}/documents", headers=upload_headers, files=files)
            
            if upload_response.status_code == 200:
                upload_data = upload_response.json()
                if upload_data.get("code") == 0:
                    docs = upload_data.get("data", [])
                    # Wait, docs is usually a list of dicts.
                    # Sometimes data is just the list.
                    # Let's handle both.
                    target_doc = None
                    if isinstance(docs, list) and docs:
                        target_doc = docs[0]
                    elif isinstance(docs, dict):
                         target_doc = docs # Rare but possible API variance
                    
                    if target_doc:
                        doc_id = target_doc.get("id")
                        doc_name = target_doc.get("name")
                        doc_size = target_doc.get("size")
                        print(f"Document uploaded: {doc_name} (ID: {doc_id})")
                        
                        # 3. Trigger Parsing (Run)
                        print("Triggering parsing...")
                        run_payload = {"run": 1, "progress": 0} 
                        run_response = requests.put(f"{full_url}/datasets/{dataset_id}/documents/{doc_id}", headers=headers, json=run_payload)
                        
                        run_status = "Unknown"
                        if run_response.status_code == 200 and run_response.json().get("code") == 0:
                             run_status = "Started"
                        else:
                             # Try bulk run endpoint fallback
                             bulk_run_payload = {"ids": [doc_id], "run": 1}
                             bulk_response = requests.post(f"{full_url}/datasets/{dataset_id}/documents/run", headers=headers, json=bulk_run_payload)
                             if bulk_response.status_code == 200 and bulk_response.json().get("code") == 0:
                                 run_status = "Started (Bulk)"
                             else:
                                 run_status = f"Failed to trigger ({run_response.status_code})"

                        # Return details
                        print(f"\n--- Save Complete ---")
                        print(f"Dataset: {dataset_name} (ID: {dataset_id})")
                        print(f"File: {doc_name}")
                        print(f"Size: {doc_size} bytes")
                        print(f"Parsing Status: {run_status}")
                    else:
                        print("Error: Upload succeeded but no document data returned.")
                else:
                    print(f"Error uploading document: {upload_data.get('message')}")
            else:
                print(f"Error uploading document: {upload_response.status_code} {upload_response.text}")

    except Exception as e:
        print(f"Error processing file: {e}")
    finally:
        if temp_file_obj and os.path.exists(processing_file_path):
            os.remove(processing_file_path)

if __name__ == "__main__":
    save_knowledge()
