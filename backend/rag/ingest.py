import os
import time
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(), override=True)

if "GOOGLE_API_KEY" not in os.environ and "GEMINI_API_KEY" in os.environ:
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]




from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS

def load_document(file_path: str):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        loader = PyPDFLoader(file_path)
    elif ext in [".txt", ".md"]:
        loader = TextLoader(file_path, encoding="utf-8")
    else:
        raise ValueError(f"Unsupported file extension: {ext}")
    pages = loader.load()
    return pages

def chunk_documents(pages, chunk_size=500, chunk_overlap=100):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ".", " "]
    )
    chunks = splitter.split_documents(pages)
    return chunks


def get_embeddings(provider: str = "gemini", api_key: str = None):
    if provider == "ollama":
        from langchain_ollama import OllamaEmbeddings
        return OllamaEmbeddings(model="nomic-embed-text")
    else:
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        if api_key:
            return GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-2", google_api_key=api_key)
        return GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-2")

def get_vectorstore_path(provider: str = "gemini", user_id: int = 1) -> str:
    if provider == "ollama":
        return f"vectorstore_ollama_{user_id}"
    return f"vectorstore_gemini_{user_id}"

def embed_and_store(chunks, batch_size=50, provider="gemini", api_key=None, user_id: int = 1):
    embeddings = get_embeddings(provider, api_key)
    vectorstore_path = get_vectorstore_path(provider, user_id)
    
    vectorstore = None
    if os.path.exists(vectorstore_path):
        try:
            vectorstore = FAISS.load_local(
                vectorstore_path, 
                embeddings,
                allow_dangerous_deserialization=True
            )
        except Exception as e:
            print(f"[Ingest] Could not load local vectorstore: {e}. Starting fresh.")
            vectorstore = None
            
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        print(f"[Ingest] Embedding batch {i//batch_size + 1}/{-(-len(chunks)//batch_size)} ({len(batch)} chunks) for provider {provider}...")
        
        retries = 3
        while retries > 0:
            try:
                if vectorstore is None:
                    vectorstore = FAISS.from_documents(batch, embeddings)
                else:
                    vectorstore.add_documents(batch)
                break
            except Exception as e:
                if provider == "ollama":
                    print(f"[Ingest] Ollama embedding error: {e}. Retrying in 5 seconds...")
                    time.sleep(5)
                    retries -= 1
                    continue
                if "429" in str(e) or "quota" in str(e).lower() or "resource_exhausted" in str(e).lower():
                    print("[Ingest] Rate limit hit (429). Sleeping for 60 seconds to reset quota...")
                    time.sleep(60)
                    retries -= 1
                else:
                    print(f"[Ingest] Unexpected error during embedding: {e}")
                    raise e
        else:
            raise Exception("Failed to embed documents after multiple rate limit retries.")
            
        vectorstore.save_local(vectorstore_path)
        
        if provider == "gemini" and i + batch_size < len(chunks):
            print("[Ingest] Sleeping for 60 seconds before next batch to prevent rate limiting...")
            time.sleep(60)
            
    return vectorstore

def ingest_document(file_path: str, chunk_size=500, chunk_overlap=50, provider="gemini", api_key=None, user_id: int = 1):
    print(f"[Ingest] Loading: {file_path}")
    pages = load_document(file_path)
    print(f"[Ingest] Loaded {len(pages)} pages")
    
    print(f"[Ingest] Chunking...")
    chunks = chunk_documents(pages, chunk_size, chunk_overlap)
    print(f"[Ingest] Created {len(chunks)} chunks")
    
    print(f"[Ingest] Embedding and storing with provider: {provider}...")
    embed_and_store(chunks, provider=provider, api_key=api_key, user_id=user_id)
    print(f"[Ingest] Done.")
    
    return chunks

'''
from rag.ingest import ingest_document
chunks = ingest_document("data\docs\OS Notes.pdf")
print(len(chunks))
print(chunks[0].page_content)
print(chunks[0].metadata)
'''