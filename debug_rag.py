import os
import sys
from dotenv import load_dotenv

# Run in backend directory context
os.chdir("backend")
sys.path.append(os.getcwd())
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
load_dotenv()

if "GOOGLE_API_KEY" not in os.environ and "GEMINI_API_KEY" in os.environ:
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]

from rag.retrieve1 import load_vectorstore, get_llm

vectorstore = load_vectorstore()
if vectorstore is None:
    print("Vectorstore not found.")
    exit(1)

retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
question = "What is an operating system?"
docs = retriever.get_relevant_documents(question)

print(f"Retrieved {len(docs)} documents:")
for idx, doc in enumerate(docs):
    print(f"\n--- DOC {idx} (Source: {doc.metadata.get('source')}, Page: {doc.metadata.get('page')}) ---")
    print(doc.page_content[:300] + "...")
