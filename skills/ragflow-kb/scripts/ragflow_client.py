#!/usr/bin/env python3
"""
RAGFlow Knowledge Base Client
Handles configuration, retrieval, and storage of knowledge in RAGFlow
"""

import os
import json
import requests
from pathlib import Path
from typing import Optional, Dict, List, Any
import sys

class RAGFlowConfig:
    """Manage RAGFlow configuration"""
    
    CONFIG_DIR = Path.home() / ".ragflow"
    CONFIG_FILE = CONFIG_DIR / "config.json"
    
    @classmethod
    def ensure_config_dir(cls):
        """Create config directory if it doesn't exist"""
        cls.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    
    @classmethod
    def save_config(cls, url: str, api_key: str) -> bool:
        """Save RAGFlow configuration"""
        cls.ensure_config_dir()
        config = {
            "url": url.rstrip("/"),
            "api_key": api_key
        }
        try:
            with open(cls.CONFIG_FILE, "w") as f:
                json.dump(config, f, indent=2)
            os.chmod(cls.CONFIG_FILE, 0o600)  # Restrict permissions
            return True
        except Exception as e:
            print(f"Error saving config: {e}", file=sys.stderr)
            return False
    
    @classmethod
    def load_config(cls) -> Optional[Dict[str, str]]:
        """Load RAGFlow configuration"""
        if not cls.CONFIG_FILE.exists():
            return None
        try:
            with open(cls.CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading config: {e}", file=sys.stderr)
            return None
    
    @classmethod
    def get_config(cls) -> Optional[Dict[str, str]]:
        """Get configuration from file or environment"""
        # Try config file first
        config = cls.load_config()
        if config:
            return config
        
        # Try environment variables
        url = os.getenv("RAGFLOW_URL")
        api_key = os.getenv("RAGFLOW_API_KEY")
        if url and api_key:
            return {"url": url, "api_key": api_key}
        
        return None


class RAGFlowClient:
    """RAGFlow API Client"""
    
    def __init__(self, url: str, api_key: str):
        self.url = url.rstrip("/")
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def check_connection(self) -> Dict[str, Any]:
        """Check RAGFlow connection and API availability"""
        try:
            response = requests.get(
                f"{self.url}/api/v1/user/info",
                headers=self.headers,
                timeout=10
            )
            if response.status_code == 200:
                return {
                    "status": "success",
                    "message": "RAGFlow connection successful",
                    "data": response.json()
                }
            else:
                return {
                    "status": "error",
                    "message": f"API returned status {response.status_code}",
                    "details": response.text
                }
        except requests.exceptions.ConnectionError:
            return {
                "status": "error",
                "message": "Cannot connect to RAGFlow server",
                "url": self.url
            }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }
    
    def list_knowledge_bases(self) -> Dict[str, Any]:
        """List all knowledge bases"""
        try:
            response = requests.get(
                f"{self.url}/api/v1/knowledge_bases",
                headers=self.headers,
                timeout=10
            )
            if response.status_code == 200:
                return {
                    "status": "success",
                    "data": response.json()
                }
            else:
                return {
                    "status": "error",
                    "message": f"Failed to list knowledge bases: {response.status_code}",
                    "details": response.text
                }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }
    
    def search_knowledge(self, query: str, kb_id: Optional[str] = None, 
                        top_k: int = 10) -> Dict[str, Any]:
        """Search knowledge base"""
        try:
            payload = {
                "query": query,
                "top_k": top_k
            }
            if kb_id:
                payload["kb_id"] = kb_id
            
            response = requests.post(
                f"{self.url}/api/v1/knowledge_bases/search",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            if response.status_code == 200:
                return {
                    "status": "success",
                    "data": response.json()
                }
            else:
                return {
                    "status": "error",
                    "message": f"Search failed: {response.status_code}",
                    "details": response.text
                }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }
    
    def upload_document(self, kb_id: str, file_path: str, 
                       file_name: Optional[str] = None) -> Dict[str, Any]:
        """Upload document to knowledge base"""
        try:
            if not os.path.exists(file_path):
                return {
                    "status": "error",
                    "message": f"File not found: {file_path}"
                }
            
            file_name = file_name or os.path.basename(file_path)
            
            with open(file_path, "rb") as f:
                files = {"file": (file_name, f)}
                response = requests.post(
                    f"{self.url}/api/v1/knowledge_bases/{kb_id}/documents",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    files=files,
                    timeout=60
                )
            
            if response.status_code in [200, 201]:
                return {
                    "status": "success",
                    "message": "Document uploaded successfully",
                    "data": response.json()
                }
            else:
                return {
                    "status": "error",
                    "message": f"Upload failed: {response.status_code}",
                    "details": response.text
                }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }
    
    def create_knowledge_base(self, name: str, description: str = "") -> Dict[str, Any]:
        """Create a new knowledge base"""
        try:
            payload = {
                "name": name,
                "description": description
            }
            response = requests.post(
                f"{self.url}/api/v1/knowledge_bases",
                headers=self.headers,
                json=payload,
                timeout=10
            )
            if response.status_code in [200, 201]:
                return {
                    "status": "success",
                    "message": "Knowledge base created successfully",
                    "data": response.json()
                }
            else:
                return {
                    "status": "error",
                    "message": f"Creation failed: {response.status_code}",
                    "details": response.text
                }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }
    
    def activate_document(self, kb_id: str, doc_id: str) -> Dict[str, Any]:
        """Activate a document for indexing"""
        try:
            response = requests.patch(
                f"{self.url}/api/v1/knowledge_bases/{kb_id}/documents/{doc_id}",
                headers=self.headers,
                json={"status": "active"},
                timeout=10
            )
            if response.status_code == 200:
                return {
                    "status": "success",
                    "message": "Document activated successfully",
                    "data": response.json()
                }
            else:
                return {
                    "status": "error",
                    "message": f"Activation failed: {response.status_code}",
                    "details": response.text
                }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }


def main():
    """CLI interface for RAGFlow operations"""
    import argparse
    
    parser = argparse.ArgumentParser(description="RAGFlow Knowledge Base Client")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Config command
    config_parser = subparsers.add_parser("config", help="Configure RAGFlow")
    config_parser.add_argument("--url", required=True, help="RAGFlow URL")
    config_parser.add_argument("--api-key", required=True, help="RAGFlow API Key")
    
    # Check command
    subparsers.add_parser("check", help="Check RAGFlow connection")
    
    # Search command
    search_parser = subparsers.add_parser("search", help="Search knowledge base")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("--kb-id", help="Knowledge base ID")
    search_parser.add_argument("--top-k", type=int, default=10, help="Number of results")
    
    # List command
    subparsers.add_parser("list", help="List knowledge bases")
    
    args = parser.parse_args()
    
    if args.command == "config":
        if RAGFlowConfig.save_config(args.url, args.api_key):
            print(json.dumps({
                "status": "success",
                "message": "Configuration saved successfully"
            }))
        else:
            print(json.dumps({
                "status": "error",
                "message": "Failed to save configuration"
            }), file=sys.stderr)
            sys.exit(1)
    
    else:
        config = RAGFlowConfig.get_config()
        if not config:
            print(json.dumps({
                "status": "error",
                "message": "RAGFlow not configured. Run 'config' command first."
            }), file=sys.stderr)
            sys.exit(1)
        
        client = RAGFlowClient(config["url"], config["api_key"])
        
        if args.command == "check":
            result = client.check_connection()
            print(json.dumps(result))
        
        elif args.command == "search":
            result = client.search_knowledge(args.query, args.kb_id, args.top_k)
            print(json.dumps(result))
        
        elif args.command == "list":
            result = client.list_knowledge_bases()
            print(json.dumps(result))


if __name__ == "__main__":
    main()
