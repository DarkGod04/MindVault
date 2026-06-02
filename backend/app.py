from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import shutil
import os
import json
import requests
from dotenv import load_dotenv, find_dotenv

# Load environment variables from .env file
load_dotenv(find_dotenv(), override=True)

if "GOOGLE_API_KEY" not in os.environ and "GEMINI_API_KEY" in os.environ:
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]

# Initialize Database
from database.auth_db import init_db, create_user, get_user_by_username, get_user_by_google_id, get_user_by_id
from auth.security import create_access_token, decode_access_token, hash_password, verify_password

init_db()

USAGE_FILE = "data/usage.json"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_free_tries_used() -> int:
    if not os.path.exists(USAGE_FILE):
        return 0
    try:
        with open(USAGE_FILE, "r") as f:
            data = json.load(f)
            return data.get("free_tries_used", 0)
    except Exception:
        return 0

def increment_free_tries() -> int:
    current = get_free_tries_used()
    new_val = current + 1
    try:
        os.makedirs(os.path.dirname(USAGE_FILE), exist_ok=True)
        with open(USAGE_FILE, "w") as f:
            json.dump({"free_tries_used": new_val}, f)
    except Exception as e:
        print(f"Error saving usage count: {e}")
    return new_val


# Dependency to get current authenticated user from JWT
def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Invalid token or expired session. Please log in again."
        )
    username = payload.get("sub")
    user_id = payload.get("user_id")
    if not username or not user_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid token payload."
        )
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found."
        )
    return user


from rag.memory import (
    get_session_history,
    save_session_message,
    get_history_for_prompt
)

from rag.ingest import ingest_document
from rag.retrieve1 import query_rag, delete_document_from_vectorstore
from metadata.tracker import log_document, get_all_documents, delete_document_metadata

app = FastAPI(title="MindVault API")

cors_origins_raw = os.environ.get("CORS_ORIGINS", "")
if cors_origins_raw:
    cors_origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]
else:
    cors_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "MindVault is running"}

@app.get("/usage")
def get_usage():
    return {
        "free_tries_used": get_free_tries_used(),
        "max_free_tries": 3
    }


# =====================================================================
# AUTHENTICATION ENDPOINTS
# =====================================================================

class UserAuthRequest(BaseModel):
    username: str
    password: str

class GoogleAuthRequest(BaseModel):
    credential: str

@app.post("/register")
def register(user: UserAuthRequest):
    username = user.username.strip()
    password = user.password.strip()
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password cannot be empty.")
        
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        
    existing = get_user_by_username(username)
    if existing:
        raise HTTPException(status_code=400, detail="Username is already taken.")
        
    try:
        hashed = hash_password(password)
        user_id = create_user(username=username, password_hash=hashed)
        return {"message": "User registered successfully.", "user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/login")
def login(user: UserAuthRequest):
    username = user.username.strip()
    password = user.password.strip()
    
    db_user = get_user_by_username(username)
    if not db_user or not verify_password(password, db_user.get("password_hash")):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password."
        )
        
    token = create_access_token(data={"sub": db_user["username"], "user_id": db_user["id"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": db_user["username"],
        "id": db_user["id"]
    }

@app.post("/login/google")
def login_google(req: GoogleAuthRequest):
    token = req.credential
    try:
        response = requests.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={token}", timeout=5)
        if not response.ok:
            raise HTTPException(status_code=400, detail="Invalid Google credential.")
            
        payload = response.json()
        if "sub" not in payload:
            raise HTTPException(status_code=400, detail="Invalid Google token payload.")
            
        google_id = payload["sub"]
        email = payload.get("email")
        name = payload.get("name", email)
        
        db_user = get_user_by_google_id(google_id)
        if not db_user:
            # Generate a username based on email or Google ID
            base_username = email.split('@')[0] if email else f"google_{google_id}"
            username = base_username
            
            # Check for name collisions
            counter = 1
            while get_user_by_username(username):
                username = f"{base_username}_{counter}"
                counter += 1
                
            try:
                user_id = create_user(username=username, email=email, google_id=google_id)
                db_user = get_user_by_id(user_id)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to auto-register: {e}")
                
        access_token = create_access_token(data={"sub": db_user["username"], "user_id": db_user["id"]})
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "username": db_user["username"],
            "id": db_user["id"]
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Google login failed: {e}")

@app.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "email": current_user.get("email")
    }


# =====================================================================
# PROTECTED RAG & DOCUMENT ENDPOINTS
# =====================================================================

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    provider: str = "gemini",
    x_gemini_api_key: str = Header(None, alias="X-Gemini-API-Key"),
    current_user: dict = Depends(get_current_user)
):
    allowed_types = ["application/pdf", "text/plain", "text/markdown"]
    user_id = current_user["id"]
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail="Only PDF, TXT and MD files supported."
        )
        
    if provider == "gemini" and not x_gemini_api_key:
        tries = get_free_tries_used()
        if tries >= 3:
            raise HTTPException(
                status_code=403,
                detail="Free trial limit reached. Please configure your Google AI Studio API key."
            )
    
    user_dir = f"data/docs/{user_id}"
    os.makedirs(user_dir, exist_ok=True)
    file_path = f"{user_dir}/{file.filename}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    chunks = ingest_document(file_path, provider=provider, api_key=x_gemini_api_key, user_id=user_id)
    log_document(
        filename=file.filename,
        path=file_path,
        chunk_count=len(chunks),
        user_id=user_id
    )

    return {
        "message": f"{file.filename} ingested successfully.",
        "chunks": len(chunks),
        "filename": file.filename
    }

class QueryRequest(BaseModel):
    question: str
    mode: str = "default"
    session_id: str = "default_session"
    provider: str = "gemini"
    temperature: float = 0.2
    k: int = 5

@app.post("/query")
def query(
    req: QueryRequest, 
    x_gemini_api_key: str = Header(None, alias="X-Gemini-API-Key"),
    current_user: dict = Depends(get_current_user)
):
    if not req.question.strip():
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty."
        )
        
    if req.provider == "gemini" and not x_gemini_api_key:
        tries = get_free_tries_used()
        if tries >= 3:
            raise HTTPException(
                status_code=403,
                detail="Free trial limit reached. Please configure your Google AI Studio API key."
            )
        increment_free_tries()

    user_id = current_user["id"]
    # Isolate history keys per user
    session_key = f"user_{user_id}_{req.session_id}"
    history = get_session_history(session_key)
    
    result = query_rag(
        question=req.question,
        history=history,
        mode=req.mode,
        provider=req.provider,
        temperature=req.temperature,
        k=req.k,
        api_key=x_gemini_api_key,
        user_id=user_id
    )
    save_session_message(session_key, role="user", content=req.question)
    save_session_message(session_key, role="assistant", content=result["answer"])
    return {
        "answer": result["answer"],
        "sources": result["sources"],
        "mode": req.mode,
        "free_tries_used": get_free_tries_used()
    }

@app.get("/documents")
def list_documents(current_user: dict = Depends(get_current_user)):
    return {"documents": get_all_documents(current_user["id"])}


@app.delete("/session/{session_id}")
def clear_session_route(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    from rag.memory import clear_session
    user_id = current_user["id"]
    session_key = f"user_{user_id}_{session_id}"
    clear_session(session_key)
    return {"message": f"Session {session_id} cleared."}


@app.delete("/documents/{filename}")
def delete_document_route(
    filename: str,
    provider: str = "gemini",
    x_gemini_api_key: str = Header(None, alias="X-Gemini-API-Key"),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    
    # 1. Clean up local raw file in user folder
    file_path = f"data/docs/{user_id}/{filename}"
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"[API] Error deleting raw file {file_path}: {e}")
            
    # 2. Delete chunks from user-isolated vectorstore
    vector_success = delete_document_from_vectorstore(
        filename, 
        provider=provider, 
        api_key=x_gemini_api_key, 
        user_id=user_id
    )
    
    # 3. Delete metadata
    meta_success = delete_document_metadata(filename, user_id)
    
    if not vector_success and not meta_success:
        raise HTTPException(
            status_code=404,
            detail=f"Document '{filename}' not found in index or registry."
        )
        
    return {
        "message": f"Document '{filename}' deleted successfully.",
        "filename": filename,
        "vector_cleaned": vector_success,
        "registry_cleaned": meta_success
    }


@app.get("/documents/{filename}/file")
def get_document_file(
    filename: str,
    token: str = None,
    authorization: str = Header(None, alias="Authorization")
):
    token_str = None
    if authorization and authorization.startswith("Bearer "):
        token_str = authorization.split(" ")[1]
    elif token:
        token_str = token
        
    if not token_str:
        raise HTTPException(status_code=401, detail="Not authenticated.")
        
    payload = decode_access_token(token_str)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token or expired session.")
        
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload.")
        
    safe_filename = os.path.basename(filename)
    file_path = f"data/docs/{user_id}/{safe_filename}"
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail=f"File {safe_filename} not found."
        )
    return FileResponse(file_path)


@app.post("/documents/reindex")
def reindex_documents(
    provider: str = "gemini",
    x_gemini_api_key: str = Header(None, alias="X-Gemini-API-Key"),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    
    if provider == "gemini" and not x_gemini_api_key:
        tries = get_free_tries_used()
        if tries >= 3:
            raise HTTPException(
                status_code=403,
                detail="Free trial limit reached. Please configure your Google AI Studio API key."
            )
            
    docs = get_all_documents(user_id)
    if not docs:
        return {"message": "No documents in vault to re-index.", "reindexed": 0}
        
    reindexed_count = 0
    errors = []
    for doc in docs:
        file_path = doc["path"]
        if not os.path.exists(file_path):
            alt_path = os.path.join("data", "docs", str(user_id), doc["filename"])
            if os.path.exists(alt_path):
                file_path = alt_path
            else:
                errors.append(f"File not found on disk: {doc['filename']}")
                continue
        try:
            ingest_document(file_path, provider=provider, api_key=x_gemini_api_key, user_id=user_id)
            reindexed_count += 1
        except Exception as e:
            errors.append(f"Error indexing {doc['filename']}: {e}")
            
    if errors:
        return {
            "message": f"Re-indexed {reindexed_count} of {len(docs)} documents for {provider.capitalize()}. Errors: {', '.join(errors)}",
            "reindexed": reindexed_count,
            "errors": errors
        }
        
    return {
        "message": f"Successfully re-indexed {reindexed_count} documents for {provider.capitalize()}.",
        "reindexed": reindexed_count
    }