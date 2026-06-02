import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
print(f"Loaded API Key starting with: {api_key[:10] if api_key else 'None'}...")

genai.configure(api_key=api_key)

try:
    print("Listing available embedding models...")
    for m in genai.list_models():
        if "embedContent" in m.supported_generation_methods:
            print(f" - {m.name} ({m.display_name})")
except Exception as e:
    print("\n[FAILURE] Listing models failed:")
    print(e)
