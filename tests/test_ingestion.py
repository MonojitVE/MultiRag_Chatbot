from langchain_text_splitters import RecursiveCharacterTextSplitter

def test_text_splitting():
    """Verify that RecursiveCharacterTextSplitter behaves as expected."""
    text = "Hello world! " * 100
    splitter = RecursiveCharacterTextSplitter(chunk_size=100, chunk_overlap=20)
    chunks = splitter.split_text(text)
    
    assert len(chunks) > 0
    assert all(len(c) <= 100 for c in chunks)
    print(f"Test text splitting succeeded. Split into {len(chunks)} chunks.")

def test_loader_imports():
    """Verify all langchain loaders can be imported."""
    try:
        from langchain_community.document_loaders import PyMuPDFLoader, Docx2txtLoader, TextLoader
        print("Import test passed: PyMuPDFLoader, Docx2txtLoader, and TextLoader imported successfully.")
    except Exception as e:
        raise AssertionError(f"Importing document loaders failed: {e}")

if __name__ == "__main__":
    test_text_splitting()
    test_loader_imports()
    print("All ingestion tests passed.")
