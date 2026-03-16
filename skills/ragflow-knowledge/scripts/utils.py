import os
import json

CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")

def load_config():
    config = {}
    # Load from .env file if exists
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    config[key.strip()] = value.strip()
    
    # Environment variables override .env
    for key in ["RAGFLOW_BASE_URL", "RAGFLOW_API_KEY", "RAGFLOW_CHAT_ID", "RAGFLOW_DATASET_ID"]:
        val = os.getenv(key)
        if val:
            config[key] = val
            
    return config

def save_config(base_url, api_key, chat_id=None, dataset_id=None):
    config = load_config()
    if base_url: config["RAGFLOW_BASE_URL"] = base_url
    if api_key: config["RAGFLOW_API_KEY"] = api_key
    if chat_id: config["RAGFLOW_CHAT_ID"] = chat_id
    if dataset_id: config["RAGFLOW_DATASET_ID"] = dataset_id
    
    with open(CONFIG_FILE, "w") as f:
        for key, value in config.items():
            f.write(f"{key}={value}\n")
    print(f"Configuration saved to {CONFIG_FILE}")

def get_base_url(url):
    if not url: return None
    if not url.endswith("/api/v1"):
        if url.endswith("/"):
            return url + "api/v1"
        else:
            return url + "/api/v1"
    return url
