# MindVault - Initial Setup & Requirements Guide

This document outlines the detailed requirements, dependencies, and setup steps necessary to run the **MindVault** project locally. MindVault is a local RAG (Retrieval-Augmented Generation) system built using FastAPI, LangChain, Ollama, and FAISS.

---

## 1. Prerequisites & Local LLM Setup

MindVault uses a fully local AI stack, meaning no external LLM API keys are required. You must set up **Ollama** and download the necessary models:

1. **Install Ollama**:
   - Download and install Ollama from [ollama.com](https://ollama.com/).
2. **Start Ollama**:
   - Ensure the Ollama service is running on your machine (by default, it hosts on `http://localhost:11434`).
3. **Pull Required Models**:
   - **LLM (llama3.2:3b)**: Used for text generation, query routing, intent classification, and summarization.
     ```bash
     ollama pull llama3.2:3b
     ```
   - **Embedding Model (nomic-embed-text)**: Used for generating text embeddings for PDF ingestion and query retrieval.
     ```bash
     ollama pull nomic-embed-text
     ```

---

## 2. Environment Configuration

Create a `.env` file in the root of the project (or inside the `backend/` directory) to configure environment variables.

**`.env` Content:**
```env
OLLAMA_BASE_URL=http://localhost:11434
```

---

## 3. Backend Setup

The backend is built with FastAPI and Python 3.10+ (compiled with Python 3.12).

### Step 1: Create a Virtual Environment
Run the following commands in the project root:
* **Windows (PowerShell)**:
  ```powershell
  python -m venv venv
  .\venv\Scripts\Activate.ps1
  ```
* **macOS / Linux**:
  ```bash
  python3 -m venv venv
  source venv/bin/activate
  ```

### Step 2: Install Dependencies
Install all package requirements listed in `requirements.txt`:
```bash
pip install -r requirements.txt
```

**Key Python Libraries Installed:**
* `fastapi` & `uvicorn`: API server and hot-reloading development server.
* `langchain`, `langchain-community`, `langchain-ollama`: Orchestration framework for LLMs, prompts, and memory.
* `faiss-cpu`: Local vector database.
* `pypdf`: Library to parse and extract text from PDFs.
* `python-dotenv`: Environment variable loader.
* *Note on Unused Packages:* `spacy` and `networkx` are listed in `requirements.txt` but are not currently imported in the active codebase. They can be omitted unless graph-based extensions are being built.

### Step 3: Run the Backend
To ensure relative file paths (e.g., `data/docs` or `vectorstore1`) resolve correctly, navigate to the `backend/` directory and start the server:
```bash
cd backend
uvicorn app:app --reload
```
The API documentation will be available at `http://localhost:8000/docs`.

---

## 4. Directory Structure Requirements

The backend expects specific folder structures to function correctly. If they do not exist, create them:

* `backend/data/docs/` - Place where uploaded documents (PDFs, TXTs, MDs) are stored.
* `backend/data/` - Holds tracker registry (`documents.json`) and session storage (`sessions.json`).
* `backend/vectorstore1/` - Directory where the FAISS index (`index.faiss` and `index.pkl`) will be generated.
* `backend/export/` - Placeholder directory.
* `backend/graph/` - Placeholder directory.

---

## 5. Known Codebase Issues to Resolve

Before launching, be aware of the following critical code bug:
* **Missing `summarize_chain` in `backend/rag/retrieve1.py`**:
  * On line 475, `query_rag()` attempts to run `summarize_chain()` when the user's intent is classified as `"summarize"`.
  * However, `summarize_chain` is **not defined or imported** in `retrieve1.py`. Asking the system to summarize a document will crash the API with a `NameError`.
  * *Fix Required:* You will need to implement `summarize_chain()` or re-route `"summarize"` intents to the default retrieval chain.

---

## 6. Frontend Setup & Cleanup

### The Directory Issue
The current `frontend` directory contains broken folders created by a literal brace expansion typo (likely run on a Windows shell, resulting in literal brackets and commas in folder names):
* `frontend/{app/{chat,upload,dashboard},components/{chat,upload,graph},lib}/`
* `frontend/{app/{chat,upload,dashboard},components/{ui,chat,graph},lib}/`

### Steps to Initialize the Frontend:
1. **Clean up**: Delete the folders containing `{` and `}` in their names.
2. **Initialize App**: The project intends to have a React/Next.js structure.
   Initialize a new React or Next.js app inside `frontend/` (ensure it uses port `3000` as allowed in the backend CORS settings):
   ```bash
   npx create-next-app@latest frontend --typescript --tailwind --eslint
   ```
3. **Target Structure**:
   * `frontend/app/chat/` (Chat interface)
   * `frontend/app/dashboard/` (Dashboard view)
   * `frontend/app/upload/` (PDF upload page)
   * `frontend/components/ui/` (Reusable visual components)
   * `frontend/lib/` (Utility and API connection functions)
