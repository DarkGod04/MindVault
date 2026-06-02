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

from rag.retrieve1 import query_rag

question = "What is a process according to the OS Notes?"
result = query_rag(question)
print("Answer:")
print(result.get("answer"))
print("\nSources:")
print(result.get("sources"))
