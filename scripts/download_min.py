from huggingface_hub import snapshot_download

for m in [
    "sshleifer/distilbart-cnn-12-6",          # live demo model
    "sentence-transformers/all-MiniLM-L6-v2", # verifier
    "cross-encoder/nli-deberta-v3-small",     # entailment
    "facebook/bart-large-cnn",                # second model
]:
    print("Downloading", m, flush=True)
    snapshot_download(repo_id=m, max_workers=2)
    print("Done", m, flush=True)