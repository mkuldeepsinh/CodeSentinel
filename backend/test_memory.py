import os
import sys
import asyncio
import json
import uuid
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

# Colors
RESET  = "\033[0m"
BOLD   = "\033[1m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BLUE   = "\033[94m"

def info(text): print(f"  {BLUE}→{RESET}  {text}")
def ok(text):   print(f"  {GREEN}✔{RESET}  {text}")
def err(text):  print(f"  {RED}✘{RESET}  {text}")

async def test_all():
    print(f"\n{BOLD}{CYAN}═" * 65 + f"{RESET}")
    print(f"{BOLD}{CYAN}  CodeSentinel — Memory Architecture Test Suite{RESET}")
    print(f"{BOLD}{CYAN}═" * 65 + f"{RESET}\n")

    # 1. Init Database
    info("Testing Database Initialization...")
    from database import (
        init_db,
        create_project,
        get_project,
        create_generation,
        get_project_generations,
        get_best_generation,
        find_similar_generation
    )
    try:
        init_db()
        ok("Database initialized successfully.")
    except Exception as e:
        err(f"Database initialization failed: {e}")
        return

    # 2. Test Project CRUD
    info("Testing Project Creation and Retrieval...")
    test_id = f"test_proj_{str(uuid.uuid4())[:8]}"
    unique_suffix = str(uuid.uuid4())[:8]
    test_prompt = f"Build a secure TCP server that listens on port 9000 - {unique_suffix}."
    try:
        create_project(test_id, "Test TCP Project", test_prompt, "javascript")
        proj = get_project(test_id)
        if proj and proj["prompt"] == test_prompt:
            ok("Project created and retrieved successfully.")
        else:
            err(f"Project mismatch: {proj}")
            return
    except Exception as e:
        err(f"Project CRUD failed: {e}")
        return

    # 3. Test Embeddings
    info("Testing Gemini Embedding Generation...")
    from embeddings import get_embedding
    try:
        emb1 = get_embedding(test_prompt)
        if len(emb1) == 3072:
            ok("Gemini 3072-dimension embedding generated successfully.")
        else:
            err(f"Unexpected embedding size: {len(emb1)}")
            return
    except Exception as e:
        err(f"Embedding generation failed: {e}")
        return

    # 4. Test Generation Storage
    info("Testing Generation Creation and Retrieval...")
    test_code = "const net = require('net'); const server = net.createServer(); server.listen(9000);"
    test_findings = [{"check_id": "test_rule", "message": "Test Finding", "severity": "WARNING", "line": 5, "cwe": [], "owasp": []}]
    try:
        create_generation(test_id, test_code, 85, test_findings, emb1)
        generations = get_project_generations(test_id)
        if len(generations) > 0 and generations[0]["code"] == test_code:
            ok("Generation saved and retrieved successfully.")
        else:
            err(f"Generation mismatch: {generations}")
            return
    except Exception as e:
        err(f"Generation storage failed: {e}")
        return

    # 5. Test Best Generation retrieval
    info("Testing Best Generation selection...")
    try:
        # Save a worse one
        create_generation(test_id, "worse code", 45, [], emb1)
        # Save a better one
        better_code = "const net = require('net'); // secured code"
        create_generation(test_id, better_code, 98, [], emb1)
        
        best = get_best_generation(test_id)
        if best and best["security_score"] == 98 and best["code"] == better_code:
            ok("Highest security score generation retrieved successfully.")
        else:
            err(f"Best generation mismatch: {best}")
            return
    except Exception as e:
        err(f"Best generation retrieval failed: {e}")
        return

    # 5b. Test Project Deletion
    info("Testing Project Deletion...")
    try:
        from database import delete_project
        delete_project(test_id)
        proj_deleted = get_project(test_id)
        gens_deleted = get_project_generations(test_id)
        if proj_deleted is None and len(gens_deleted) == 0:
            ok("Project and all generations deleted successfully from database.")
        else:
            err(f"Deletion failed. Project: {proj_deleted}, Generations: {gens_deleted}")
            return
            
        # Recreate project and generations to allow subsequent semantic similarity search tests to pass
        create_project(test_id, "Test TCP Project", test_prompt, "javascript")
        create_generation(test_id, test_code, 85, test_findings, emb1)
        create_generation(test_id, "worse code", 45, [], emb1)
        create_generation(test_id, better_code, 98, [], emb1)
    except Exception as e:
        err(f"Project deletion test failed: {e}")
        return

    # 6. Test Semantic Deduplication Search
    info("Testing Semantic Similarity Search...")
    try:
        # Query with exact same prompt
        match = find_similar_generation(emb1, threshold=0.95)
        if match and match["project_id"] == test_id:
            ok(f"Semantic match found successfully. Cosine similarity: {match.get('similarity', 1.0):.4f}")
        else:
            err(f"Semantic match failed for exact prompt: {match}")
            return
            
        # Query with slightly modified prompt
        similar_prompt = f"Build a self-contained Node.js TCP server on port 9000 - {unique_suffix}."
        emb2 = get_embedding(similar_prompt)
        match2 = find_similar_generation(emb2, threshold=0.80)
        if match2 and match2["project_id"] == test_id:
            ok(f"Semantic match found for similar prompt. Cosine similarity: {match2.get('similarity', 0.0):.4f}")
        else:
            err(f"Semantic match failed for similar prompt: {match2}")
            return
            
        # Query with completely different prompt (should NOT match)
        different_prompt = "Make a cookie recipe website in HTML and styling."
        emb3 = get_embedding(different_prompt)
        match3 = find_similar_generation(emb3, threshold=0.85)
        if match3 is None:
            ok("No semantic match found for unrelated prompt as expected.")
        else:
            err(f"False positive semantic match: {match3}")
            return
    except Exception as e:
        err(f"Semantic similarity test failed: {e}")
        return

    print(f"\n{BOLD}{GREEN}ALL MEMORY ARCHITECTURE TESTS PASSED SUCCESSFULLY!{RESET}\n")

if __name__ == "__main__":
    asyncio.run(test_all())
