import uuid

def generate_unique_reference(prefix="REF-"):
    return prefix + uuid.uuid4().hex[:8].upper()