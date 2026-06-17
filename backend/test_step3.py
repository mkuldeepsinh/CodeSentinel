import os
import sys

# Ensure import paths resolve correctly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from graph.graph import build_graph

def test_graph_compilation():
    print("Compiling graph...")
    compiled_graph = build_graph()
    print("Graph compiled successfully!")
    
    # Save compilation image
    try:
        # get image bytes from LangGraph
        image_data = compiled_graph.get_graph().draw_mermaid_png()
        output_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "graph_compiled.png"))
        with open(output_path, "wb") as f:
            f.write(image_data)
        print(f"Graph image saved successfully to {output_path}!")
    except Exception as e:
        print(f"Could not save graph image as PNG: {str(e)}")
        
        # Fallback to saving raw mermaid text representation
        try:
            mermaid_text = compiled_graph.get_graph().draw_mermaid()
            output_path_text = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "graph_compiled.mermaid"))
            with open(output_path_text, "w") as f:
                f.write(mermaid_text)
            print(f"Mermaid markup saved as fallback to {output_path_text}")
        except Exception as ex:
            print(f"Fallback write failed: {str(ex)}")

if __name__ == "__main__":
    try:
        test_graph_compilation()
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
