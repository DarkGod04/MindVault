import os
import json
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(), override=True)

if "GOOGLE_API_KEY" not in os.environ and "GEMINI_API_KEY" in os.environ:
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]



from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.schema.runnable import RunnableBranch, RunnablePassthrough, RunnableLambda
from langchain.schema.messages import HumanMessage, AIMessage
from langchain_core.output_parsers import StrOutputParser

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

def get_llm(provider: str = "gemini", temperature: float = 0.2, api_key: str = None):
    if provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(model="llama3.2:3b", temperature=temperature)
    else:
        if api_key:
            primary = ChatGoogleGenerativeAI(model="gemini-3.5-flash", temperature=temperature, google_api_key=api_key, max_retries=3)
            fallbacks = [
                ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite", temperature=temperature, google_api_key=api_key, max_retries=3),
                ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=temperature, google_api_key=api_key, max_retries=3),
                ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=temperature, google_api_key=api_key, max_retries=3),
                ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", temperature=temperature, google_api_key=api_key, max_retries=3)
            ]
        else:
            primary = ChatGoogleGenerativeAI(model="gemini-3.5-flash", temperature=temperature, max_retries=3)
            fallbacks = [
                ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite", temperature=temperature, max_retries=3),
                ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=temperature, max_retries=3),
                ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=temperature, max_retries=3),
                ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", temperature=temperature, max_retries=3)
            ]
        return primary.with_fallbacks(fallbacks)

#not in retrieve.py
def classify_intent(question: str) -> str:
    q = question.lower()
    
    # Keyword detection first — fast and reliable
    compare_keywords = ["compare", "difference", "vs", "versus", 
                       "contrast", "distinguish", "similarities", 
                       "different between", "alike"]
    
    test_keywords = ["generate questions", "mcq", "quiz", "test me",
                     "generate mcqs", "create questions", "make questions",
                     "question on", "questions on", "questions about"]
    
    summarize_keywords = ["summarize", "summary", "overview", "revise",
                         "revision", "brief", "outline", "recap",
                         "give me all", "everything about"]
    
    for keyword in compare_keywords:
        if keyword in q:
            print(f"[Intent] Keyword match: compare")
            return "compare"
    
    for keyword in test_keywords:
        if keyword in q:
            print(f"[Intent] Keyword match: test")
            return "test"
    
    for keyword in summarize_keywords:
        if keyword in q: 
            print(f"[Intent] Keyword match: summarize")
            return "summarize"
    
    # No keyword match — default fallback to answer (saves an LLM call)
    print(f"[Intent] Default fallback: answer")
    return "answer"


def orchestrate_query_with_history(question: str, history: list, provider: str = "gemini", temperature: float = 0.2, api_key: str = None) -> dict:
    llm = get_llm(provider, temperature, api_key)
    
    orchestrator_prompt = ChatPromptTemplate.from_template("""
You are the query orchestrator for a RAG (Retrieval-Augmented Generation) system.
Analyze the user's new question and the conversation history to perform three tasks:
1. **Resolve/Rewrite**: Rewrite the new question to be fully self-contained and explicit, resolving all pronouns (like "it", "they", "he", "she", "this", "that") and vague references based on the context of the conversation history. If the question is already fully explicit and does not depend on history, output it unchanged.
2. **Classify Intent**: Classify the intent of the resolved question into exactly one of:
   - "compare": Comparing concepts, vs, versus, differences, similarities.
   - "test": Generating a quiz, testing knowledge, MCQs.
   - "summarize": Summarizing a topic, recap, overview.
   - "answer": Direct questions, fact-seeking, or general conversation.
3. **Route Decision**: Decide where to fetch the answer from:
   - "history": Use this if the question refers purely to information already discussed in the conversation history and does not require searching external documents.
   - "retrieve": Use this if the question requires looking up information from the uploaded documents (e.g., questions about definitions, concepts, facts, summaries, tests, or comparisons that need fresh RAG retrieval).

Response MUST be a single JSON object. Do not include any explanation or extra text outside the JSON.

Expected JSON schema:
{{
  "resolved_question": "string",
  "intent": "compare" | "test" | "summarize" | "answer",
  "decision": "history" | "retrieve"
}}

Conversation History:
{history_str}

New Question: {question}
""")
    
    history_str = "\n".join([
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
        for m in history[-6:]
    ])
    
    orchestrator_chain = orchestrator_prompt | llm | StrOutputParser()
    
    try:
        raw_res = orchestrator_chain.invoke({
            "history_str": history_str,
            "question": question
        }).strip()
        
        # Clean up code blocks if present
        if raw_res.startswith("```"):
            lines = raw_res.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            raw_res = "\n".join(lines).strip()
            
        data = json.loads(raw_res)
        
        resolved = data.get("resolved_question", question).strip() or question
        intent = data.get("intent", "answer").strip().lower()
        decision = data.get("decision", "retrieve").strip().lower()
        
        if intent not in ["compare", "test", "summarize", "answer"]:
            intent = "answer"
        if decision not in ["history", "retrieve"]:
            decision = "retrieve"
            
        print(f"[Orchestrator] Resolved: '{resolved}' | Intent: '{intent}' | Decision: '{decision}'")
        return {
            "resolved_question": resolved,
            "intent": intent,
            "decision": decision
        }
    except Exception as e:
        print(f"[Orchestrator] Error during orchestration: {e}. Using safe fallbacks.")
        # Safe fallback: keyword intent, retrieve routing, original question
        intent = classify_intent(question)
        return {
            "resolved_question": question,
            "intent": intent,
            "decision": "retrieve"
        }



def load_vectorstore(provider: str = "gemini", api_key: str = None, user_id: int = 1):
    embeddings = get_embeddings(provider, api_key)
    vectorstore_path = get_vectorstore_path(provider, user_id)
    
    if not os.path.exists(vectorstore_path):
        return None
    
    return FAISS.load_local(
        vectorstore_path,
        embeddings,
        allow_dangerous_deserialization=True
    )

def format_history(history: list) -> list:
    messages = []
    for msg in history[-6:]:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        else:
            messages.append(AIMessage(content=msg["content"]))
    return messages


def format_sources(docs) -> list:
    sources = []
    seen = set()
    for doc in docs:
        filename = os.path.basename(doc.metadata.get('source', 'Unknown'))
        page = doc.metadata.get('page', 0)
        if page is None:
            page = 0
        else:
            try:
                page = int(page)
            except ValueError:
                page = 0
        key = (filename, page)
        if key not in seen:
            seen.add(key)
            sources.append({
                "filename": filename,
                "page": page,
                "content": doc.page_content
            })
    return sources


def build_retrieval_chain(vectorstore, mode: str = "default", provider: str = "gemini", temperature: float = 0.2, k: int = 5, api_key: str = None):
    
    prompts = {
        "student": """You are a study assistant. Answer using only the context below.
Use simple language and bullet points where helpful.
If answer is not in context say: "This isn't in your uploaded documents."

Context: {context}
Question: {question}""",

        "lawyer": """You are a legal research assistant. Answer using only the context below.
Be precise and formal. Flag any ambiguities.
If answer is not in context say: "This isn't in your uploaded documents."

Context: {context}
Question: {question}""",

        "developer": """You are a technical assistant. Answer using only the context below.
Be precise. Include implementation details if present.
If answer is not in context say: "This isn't in your uploaded documents."

Context: {context}
Question: {question}""",

        "default": """Answer using only the context below.
If answer is not in context say: "This isn't in your uploaded documents."

Context: {context}
Question: {question}"""
    }

    prompt = ChatPromptTemplate.from_messages([
        ("system", prompts.get(mode, prompts["default"])),
        MessagesPlaceholder(variable_name="history"),
        ("human", "{question}"),
    ])

    retriever = vectorstore.as_retriever(search_kwargs={"k": k})

    def retrieve_context(input: dict) -> dict:
        docs = retriever.get_relevant_documents(input["question"])
        context = "\n\n---\n\n".join([
            f"[Source: {os.path.basename(doc.metadata.get('source', 'Unknown'))}, Page: {doc.metadata.get('page', '?')}]\n{doc.page_content}"
            for doc in docs
        ])
        sources = format_sources(docs)
        return {
            "context": context,
            "question": input["question"],
            "history": input.get("history", []),
            "sources": sources 
        }

    llm = get_llm(provider, temperature, api_key)

    chain = (
        RunnableLambda(retrieve_context)
        | RunnablePassthrough.assign(
            answer = prompt | llm | StrOutputParser()
        )
    )

    return chain

def build_router_chain(history: list, provider: str = "gemini", temperature: float = 0.2, api_key: str = None):
    llm = get_llm(provider, temperature, api_key)
    
    router_prompt = ChatPromptTemplate.from_template("""
Given the conversation history and the new question, decide if the question
refers to something already discussed in the history or needs new document retrieval.

History:
{history}

Question: {question}

Reply with ONLY one word:
- "history" if question refers to previous conversation
- "retrieve" if question needs document search
""")

    router_chain = router_prompt | llm | StrOutputParser()
    
    return router_chain

'''def query_rag(question: str, history: list = [], mode: str = "default") -> dict:
    vectorstore = load_vectorstore()
    print(f"[Debug] question={question}")
    print(f"[Debug] history length={len(history)}")
    print(f"[Debug] first history item={history[0] if history else 'EMPTY'}")
    if vectorstore is None:
        return {
            "answer": "No documents uploaded yet. Please upload a document first.",
            "sources": [],
        }
    
    formatted_history = format_history(history)
    llm = get_llm()
    
    # Step 1 — Route the question
    if history:
        print(f"[Debug] History exists, running router...")
        router_chain = build_router_chain(history)
        history_str = "\n".join([
            f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
            for m in history[-6:]
        ])
        print(f"[Debug] Invoking router with question: {question}")
        decision = router_chain.invoke({
            "history": history_str,
            "question": question
        }).strip().lower()
        print(f"[Router] Decision: {decision}")
    else:
        decision = "retrieve"
    print(f"[Router] Decision: {decision}")
    # Step 2 — Route to right chain
    if decision == "history":
        history_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant. Answer based on conversation history only."),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{question}")
        ])
        
        history_chain = history_prompt | llm | StrOutputParser()
        
        answer = history_chain.invoke({
            "history": formatted_history,
            "question": question
        })
        
        return {
            "answer": answer,
            "sources": ["conversation history"],
        }
    
    else:
        retrieval_chain = build_retrieval_chain(vectorstore, mode)
        
        result = retrieval_chain.invoke({
            "question": question,
            "history": formatted_history,
        })
        
        return {
            "answer": result["answer"],
            "sources": result.get("sources", []),
        }'''

def resolve_context_from_history(question: str, history: list, provider: str = "gemini", temperature: float = 0.2, api_key: str = None) -> str:
    llm = get_llm(provider, temperature, api_key)
    
    resolve_prompt = ChatPromptTemplate.from_template("""
Given the conversation history and a question, rewrite the question to be 
fully explicit and self contained. If the question is already explicit 
return it unchanged.

History:
{history}

Question: {question}

Rewritten question:
""")
    
    resolve_chain = resolve_prompt | llm | StrOutputParser()
    
    history_str = "\n".join([
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
        for m in history[-6:]
    ])
    
    return resolve_chain.invoke({
        "history": history_str,
        "question": question
    }).strip()




def comparison_chain(question: str, vectorstore, mode: str = "default", provider: str = "gemini", temperature: float = 0.2, k: int = 8, api_key: str = None) -> dict:
    llm = get_llm(provider, temperature, api_key)
    
    retriever = vectorstore.as_retriever(search_kwargs={"k": k})
    docs = retriever.get_relevant_documents(question)
    
    if not docs:
        return {
            "answer": "Nothing relevant found in your documents.",
            "sources": []
        }
    
    context = "\n\n---\n\n".join([
        f"[Source: {os.path.basename(doc.metadata.get('source', 'Unknown'))}, Page: {doc.metadata.get('page', '?')}]\n{doc.page_content}"
        for doc in docs
    ])
    
    sources = format_sources(docs)
    
    compare_prompt = ChatPromptTemplate.from_template("""
Compare the concepts asked about using ONLY the context below.
Structure your response as:

**Similarities:**
- point 1
- point 2

**Differences:**
- point 1
- point 2

**Key Insight:**
One sentence summarizing the most important distinction.

If insufficient information exists say so explicitly.
Only use information from the context below.

Context:
{context}

Comparison request: {question}

Comparison:
""")
    
    compare = compare_prompt | llm | StrOutputParser()
    
    answer = compare.invoke({
        "context": context,
        "question": question
    })
    
    return {"answer": answer, "sources": sources}


def test_generator_chain(question: str, vectorstore, provider: str = "gemini", temperature: float = 0.2, k: int = 8, api_key: str = None) -> dict:
    llm = get_llm(provider, temperature, api_key)
    
    retriever = vectorstore.as_retriever(search_kwargs={"k": k})
    docs = retriever.get_relevant_documents(question)
    
    if not docs:
        return {
            "answer": "Nothing relevant found in your documents.",
            "sources": []
        }
    
    context = "\n\n---\n\n".join([
        f"[Source: {os.path.basename(doc.metadata.get('source', 'Unknown'))}, Page: {doc.metadata.get('page', '?')}]\n{doc.page_content}"
        for doc in docs
    ])
    
    sources = format_sources(docs)
    
    test_prompt = ChatPromptTemplate.from_template("""
Generate questions based ONLY on the content below.
Mix of 3 MCQs and 2 short answer questions.
Strictly from the documents and context you have.
Also give ansers at the end.

For MCQs use this format:
Q1. [question]
A) option
B) option  
C) option
D) option
Answer: [correct option]

For short answer use this format:
Q4. [question]
Answer: [expected answer]

Only use information from the context below.
Do not use any outside knowledge.

Content:
{context}

Topic requested: {question}

Questions:
""")
    
    test = test_prompt | llm | StrOutputParser()
    
    answer = test.invoke({
        "context": context,
        "question": question
    })
    
    return {"answer": answer, "sources": sources}


def summarize_chain(question: str, vectorstore, mode: str = "default", provider: str = "gemini", temperature: float = 0.2, k: int = 8, api_key: str = None) -> dict:
    llm = get_llm(provider, temperature, api_key)
    
    retriever = vectorstore.as_retriever(search_kwargs={"k": k})
    docs = retriever.get_relevant_documents(question)
    
    if not docs:
        return {
            "answer": "Nothing relevant found in your documents.",
            "sources": []
        }
    
    context = "\n\n---\n\n".join([
        f"[Source: {os.path.basename(doc.metadata.get('source', 'Unknown'))}, Page: {doc.metadata.get('page', '?')}]\n{doc.page_content}"
        for doc in docs
    ])
    
    sources = format_sources(docs)
    
    summarize_prompt = ChatPromptTemplate.from_template("""
Provide a comprehensive summary of the concepts asked about using ONLY the context below.
Structure your response as:

**Summary Overview:**
Provide a brief 2-3 sentence overview.

**Key Points:**
- Point 1
- Point 2
- Point 3
- Point 4

**Key Takeaway:**
One sentence summary of the main takeaway.

If insufficient information exists in the context, say so explicitly.
Only use information from the context below. Do not use outside knowledge.

Context:
{context}

Summary request: {question}

Summary:
""")
    
    summarize = summarize_prompt | llm | StrOutputParser()
    
    answer = summarize.invoke({
        "context": context,
        "question": question
    })
    
    return {"answer": answer, "sources": sources}


def query_rag(question: str, history: list = [], mode: str = "default", provider: str = "gemini", temperature: float = 0.2, k: int = 5, api_key: str = None, user_id: int = 1) -> dict:
    print(f"[Debug] question={question} | provider={provider} | temperature={temperature} | k={k}")
    print(f"[Debug] history length={len(history)}")
    
    vectorstore = load_vectorstore(provider, api_key, user_id)
    
    if vectorstore is None:
        other_provider = "ollama" if provider == "gemini" else "gemini"
        other_path = get_vectorstore_path(other_provider, user_id)
        if os.path.exists(other_path):
            return {
                "answer": f"Your documents are in the vault but were indexed using the {other_provider.capitalize()} provider. To query them using {provider.capitalize()}, please click the 'Re-index Documents' button in the Upload tab or System Dashboard to generate the correct local embeddings.",
                "sources": [],
            }
        return {
            "answer": "No documents uploaded yet. Please upload a document first.",
            "sources": [],
        }
    
    try:
        formatted_history = format_history(history)
        llm = get_llm(provider, temperature, api_key)
        
        # Run orchestrator if history exists, otherwise use simple keyword intent detection
        if history:
            analysis = orchestrate_query_with_history(question, history, provider, temperature, api_key)
            resolved_question = analysis["resolved_question"]
            intent = analysis["intent"]
            decision = analysis["decision"]
        else:
            resolved_question = question
            intent = classify_intent(question)
            decision = "retrieve"
            
        print(f"[Query Pipeline] Resolved: {resolved_question} | Intent: {intent} | Decision: {decision}")
        
        # Route to right chain
        if decision == "history":
            history_prompt = ChatPromptTemplate.from_messages([
                ("system", "You are a helpful assistant. Answer based on conversation history only."),
                MessagesPlaceholder(variable_name="history"),
                ("human", "{question}")
            ])
            history_chain = history_prompt | llm | StrOutputParser()
            answer = history_chain.invoke({
                "history": formatted_history,
                "question": resolved_question
            })
            return {
                "answer": answer,
                "sources": [
                    {
                        "filename": "Conversation History",
                        "page": 0,
                        "content": "Relevant context was retrieved from conversation history."
                    }
                ],
                "intent": intent
            }
        
        elif intent == "compare":
            result = comparison_chain(resolved_question, vectorstore, mode, provider, temperature, k, api_key)
            return {
                "answer": result["answer"],
                "sources": result["sources"],
                "intent": intent
            }
        
        elif intent == "test":
            result = test_generator_chain(resolved_question, vectorstore, provider, temperature, k, api_key)
            return {
                "answer": result["answer"],
                "sources": result["sources"],
                "intent": intent
            }
        
        elif intent == "summarize":
            result = summarize_chain(resolved_question, vectorstore, mode, provider, temperature, k, api_key)
            return {
                "answer": result["answer"],
                "sources": result["sources"],
                "intent": intent
            }
        
        else:
            retrieval_chain = build_retrieval_chain(vectorstore, mode, provider, temperature, k, api_key)
            result = retrieval_chain.invoke({
                "question": resolved_question,
                "history": formatted_history,
            })
            return {
                "answer": result["answer"],
                "sources": result.get("sources", []),
                "intent": intent
            }
    except Exception as e:
        err_msg = str(e)
        if "429" in err_msg or "quota" in err_msg.lower() or "resource_exhausted" in err_msg.lower():
            print("[Error] Gemini API rate limit hit in query_rag")
            return {
                "answer": "The Gemini API rate limit (429) was hit. Please wait a few seconds before trying again.",
                "sources": [],
                "intent": "error"
            }
        if "nomic-embed-text" in err_msg or "model not found" in err_msg.lower() or "connection" in err_msg.lower():
            print(f"[Error] Ollama connection/model issue: {e}")
            return {
                "answer": "Ollama service or model not found. Please ensure Ollama is running locally and that you have pulled the required models by running: 'ollama pull llama3.2:3b' and 'ollama pull nomic-embed-text' in your command prompt.",
                "sources": [],
                "intent": "error"
            }
        print(f"[Error] Exception in query_rag: {e}")
        return {
            "answer": f"An error occurred while generating response: {err_msg}",
            "sources": [],
            "intent": "error"
        }


def delete_document_from_vectorstore(filename: str, provider: str = "gemini", api_key: str = None, user_id: int = 1) -> bool:
    import shutil
    vectorstore = load_vectorstore(provider, api_key, user_id)
    if vectorstore is None:
        return False
    
    ids_to_delete = []
    for doc_id, doc in vectorstore.docstore._dict.items():
        doc_source = doc.metadata.get('source', '')
        if os.path.basename(doc_source) == filename:
            ids_to_delete.append(doc_id)
            
    if not ids_to_delete:
        print(f"[Vectorstore] No chunks found for document: {filename} in {provider} store")
        return False
        
    print(f"[Vectorstore] Deleting {len(ids_to_delete)} chunks for document: {filename} from {provider} store")
    vectorstore.delete(ids_to_delete)
    
    vectorstore_path = get_vectorstore_path(provider, user_id)
    
    # If index is empty, delete the directory
    if len(vectorstore.docstore._dict) == 0:
        print(f"[Vectorstore] Vectorstore is now empty. Purging {vectorstore_path} directory.")
        if os.path.exists(vectorstore_path):
            try:
                shutil.rmtree(vectorstore_path)
            except Exception as e:
                print(f"[Vectorstore] Error removing directory {vectorstore_path}: {e}")
    else:
        vectorstore.save_local(vectorstore_path)
        
    return True