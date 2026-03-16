#!/usr/bin/env python3
"""
RAGFlow Agent Interface
High-level interface for Agent to interact with RAGFlow knowledge base
"""

import json
import sys
import os
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any, List
from ragflow_client import RAGFlowConfig, RAGFlowClient


class RAGFlowAgent:
    """Agent interface for RAGFlow operations"""
    
    def __init__(self):
        self.config = RAGFlowConfig.get_config()
        self.client = None
        if self.config:
            self.client = RAGFlowClient(self.config["url"], self.config["api_key"])
    
    def ensure_configured(self) -> bool:
        """Check if RAGFlow is configured"""
        if not self.config:
            return False
        if not self.client:
            self.client = RAGFlowClient(self.config["url"], self.config["api_key"])
        return True
    
    def configure(self, url: str, api_key: str) -> Dict[str, Any]:
        """Configure RAGFlow connection"""
        if RAGFlowConfig.save_config(url, api_key):
            self.config = {"url": url, "api_key": api_key}
            self.client = RAGFlowClient(url, api_key)
            
            # Test connection
            result = self.client.check_connection()
            return {
                "status": "success",
                "message": "RAGFlow configured successfully",
                "connection_check": result
            }
        else:
            return {
                "status": "error",
                "message": "Failed to save configuration"
            }
    
    def check_config(self) -> Dict[str, Any]:
        """Check current configuration and connection"""
        if not self.ensure_configured():
            return {
                "status": "not_configured",
                "message": "RAGFlow is not configured",
                "next_step": "Please provide RAGFlow URL and API Key"
            }
        
        result = self.client.check_connection()
        return {
            "status": "configured",
            "url": self.config["url"],
            "connection": result
        }
    
    def search(self, query: str, kb_id: Optional[str] = None, 
               top_k: int = 10) -> Dict[str, Any]:
        """Search knowledge base"""
        if not self.ensure_configured():
            return {
                "status": "error",
                "message": "RAGFlow is not configured"
            }
        
        result = self.client.search_knowledge(query, kb_id, top_k)
        
        if result["status"] == "success":
            # Format results for better readability
            data = result.get("data", {})
            return {
                "status": "success",
                "query": query,
                "results_count": len(data.get("results", [])),
                "results": data.get("results", []),
                "metadata": {
                    "kb_id": kb_id,
                    "top_k": top_k
                }
            }
        
        return result
    
    def save_knowledge(self, content: str, kb_name: str, 
                      file_name: Optional[str] = None) -> Dict[str, Any]:
        """Save knowledge to knowledge base"""
        if not self.ensure_configured():
            return {
                "status": "error",
                "message": "RAGFlow is not configured"
            }
        
        try:
            # Create or get knowledge base
            kb_result = self._get_or_create_kb(kb_name)
            if kb_result["status"] != "success":
                return kb_result
            
            kb_id = kb_result["kb_id"]
            
            # Create temporary file with content
            file_name = file_name or f"{kb_name}_content.txt"
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".txt",
                delete=False,
                encoding="utf-8"
            ) as f:
                f.write(content)
                temp_file = f.name
            
            try:
                # Upload document
                upload_result = self.client.upload_document(kb_id, temp_file, file_name)
                
                if upload_result["status"] != "success":
                    return upload_result
                
                # Extract document ID and activate
                doc_data = upload_result.get("data", {})
                doc_id = doc_data.get("id") or doc_data.get("doc_id")
                
                if doc_id:
                    activate_result = self.client.activate_document(kb_id, doc_id)
                    if activate_result["status"] != "success":
                        return {
                            "status": "warning",
                            "message": "Document uploaded but activation failed",
                            "upload_result": upload_result,
                            "activation_error": activate_result
                        }
                
                return {
                    "status": "success",
                    "message": "Knowledge saved and activated successfully",
                    "kb_name": kb_name,
                    "kb_id": kb_id,
                    "file_name": file_name,
                    "document_info": doc_data
                }
            
            finally:
                # Clean up temp file
                if os.path.exists(temp_file):
                    os.unlink(temp_file)
        
        except Exception as e:
            return {
                "status": "error",
                "message": f"Error saving knowledge: {str(e)}"
            }
    
    def list_knowledge_bases(self) -> Dict[str, Any]:
        """List all knowledge bases"""
        if not self.ensure_configured():
            return {
                "status": "error",
                "message": "RAGFlow is not configured"
            }
        
        result = self.client.list_knowledge_bases()
        
        if result["status"] == "success":
            kbs = result.get("data", {}).get("knowledge_bases", [])
            return {
                "status": "success",
                "count": len(kbs),
                "knowledge_bases": kbs
            }
        
        return result
    
    def _get_or_create_kb(self, kb_name: str) -> Dict[str, Any]:
        """Get existing knowledge base or create new one"""
        # List existing KBs
        list_result = self.client.list_knowledge_bases()
        
        if list_result["status"] == "success":
            kbs = list_result.get("data", {}).get("knowledge_bases", [])
            
            # Check if KB exists
            for kb in kbs:
                if kb.get("name") == kb_name:
                    return {
                        "status": "success",
                        "kb_id": kb.get("id"),
                        "message": "Using existing knowledge base"
                    }
        
        # Create new KB
        create_result = self.client.create_knowledge_base(
            kb_name,
            f"Knowledge base for {kb_name}"
        )
        
        if create_result["status"] == "success":
            kb_id = create_result.get("data", {}).get("id")
            return {
                "status": "success",
                "kb_id": kb_id,
                "message": "Created new knowledge base"
            }
        
        return create_result


def main():
    """CLI interface for Agent operations"""
    import argparse
    
    parser = argparse.ArgumentParser(description="RAGFlow Agent Interface")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Configure command
    config_parser = subparsers.add_parser("configure", help="Configure RAGFlow")
    config_parser.add_argument("--url", required=True, help="RAGFlow URL")
    config_parser.add_argument("--api-key", required=True, help="RAGFlow API Key")
    
    # Check config command
    subparsers.add_parser("check-config", help="Check RAGFlow configuration")
    
    # Search command
    search_parser = subparsers.add_parser("search", help="Search knowledge base")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("--kb-id", help="Knowledge base ID")
    search_parser.add_argument("--top-k", type=int, default=10, help="Number of results")
    
    # Save knowledge command
    save_parser = subparsers.add_parser("save", help="Save knowledge to knowledge base")
    save_parser.add_argument("--kb-name", required=True, help="Knowledge base name")
    save_parser.add_argument("--content", help="Content to save")
    save_parser.add_argument("--file", help="File path to read content from")
    save_parser.add_argument("--file-name", help="Name for the document in KB")
    
    # List command
    subparsers.add_parser("list", help="List knowledge bases")
    
    args = parser.parse_args()
    
    agent = RAGFlowAgent()
    
    if args.command == "configure":
        result = agent.configure(args.url, args.api_key)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    
    elif args.command == "check-config":
        result = agent.check_config()
        print(json.dumps(result, indent=2, ensure_ascii=False))
    
    elif args.command == "search":
        result = agent.search(args.query, args.kb_id, args.top_k)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    
    elif args.command == "save":
        content = args.content
        if args.file:
            with open(args.file, "r", encoding="utf-8") as f:
                content = f.read()
        
        if not content:
            print(json.dumps({
                "status": "error",
                "message": "No content provided. Use --content or --file"
            }), file=sys.stderr)
            sys.exit(1)
        
        result = agent.save_knowledge(content, args.kb_name, args.file_name)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    
    elif args.command == "list":
        result = agent.list_knowledge_bases()
        print(json.dumps(result, indent=2, ensure_ascii=False))
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
