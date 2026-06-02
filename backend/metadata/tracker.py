import json
import os
from datetime import datetime


DOCS_FILE = "data/documents.json"


def _load_docs() -> list:
    if not os.path.exists(DOCS_FILE):
        return []
    with open(DOCS_FILE, "r") as f:
        return json.load(f)


def _save_docs(docs: list):
    with open(DOCS_FILE, "w") as f:
        json.dump(docs, f, indent=2)


def log_document(filename: str, path: str, chunk_count: int, user_id: int):
    docs = _load_docs()
    
    for doc in docs:
        if doc["filename"] == filename and doc.get("user_id") == user_id:
            doc["chunk_count"] = chunk_count
            doc["last_updated"] = datetime.utcnow().isoformat()
            _save_docs(docs)
            return
    
    docs.append({
        "filename": filename,
        "path": path,
        "chunk_count": chunk_count,
        "uploaded_at": datetime.utcnow().isoformat(),
        "user_id": user_id
    })
    
    _save_docs(docs)


def get_all_documents(user_id: int) -> list:
    docs = _load_docs()
    return [doc for doc in docs if doc.get("user_id") == user_id]


def get_document(filename: str, user_id: int) -> dict | None:
    docs = _load_docs()
    for doc in docs:
        if doc["filename"] == filename and doc.get("user_id") == user_id:
            return doc
    return None


def delete_document_metadata(filename: str, user_id: int) -> bool:
    docs = _load_docs()
    new_docs = [doc for doc in docs if not (doc["filename"] == filename and doc.get("user_id") == user_id)]
    if len(new_docs) < len(docs):
        _save_docs(new_docs)
        return True
    return False