import os
import google.generativeai as genai
from typing import List

def get_embedding(text: str) -> List[float]:
    """
    Generates a 768-dimensional vector embedding for the given text
    using Google's text-embedding-004 model.
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY environment variable is not set")
        
    genai.configure(api_key=api_key)
    
    # Generate embedding
    response = genai.embed_content(
        model="models/gemini-embedding-2",
        content=text,
        task_type="retrieval_document"
    )
    
    # The response is a dictionary with an 'embedding' key containing the list of floats
    if "embedding" in response:
        return response["embedding"]
    elif "embeddings" in response and len(response["embeddings"]) > 0:
        return response["embeddings"][0]
    else:
        raise RuntimeError(f"Unexpected response format from embed_content: {response}")
