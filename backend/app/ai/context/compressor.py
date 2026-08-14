import re
from typing import List

class ContextCompressor:
    @classmethod
    def compress_chunk(cls, text: str, query: str) -> str:
        """
        Compresses a text chunk at the sentence level by removing redundant 
        and low-relevance sentences relative to the user query.
        """
        if not text or not query:
            return text

        # Extract source prefix if present (e.g. "Source: Doc.txt\nContent: ...")
        prefix = ""
        body = text
        if text.startswith("Source:"):
            parts = text.split("\n", 1)
            if len(parts) > 1:
                prefix = parts[0] + "\n"
                body = parts[1]
                if body.startswith("Content:"):
                    prefix += "Content: "
                    body = body[len("Content:"):].strip()

        # Split body into sentences
        sentences = re.split(r'(?<=[.!?])\s+', body)
        if len(sentences) <= 3:
            # Too short to compress safely
            return text

        # Clean query words (exclude common stop words to prevent generic matches)
        stop_words = {"about", "and", "the", "for", "with", "from", "this", "that", "these", "those", "query", "what", "how", "why"}
        q_words = {w.strip("?,.!-()\"'").lower() for w in query.lower().split() if len(w) > 2 and w.lower() not in stop_words}
        if not q_words:
            return text

        keep = []
        seen = set()

        for idx, sentence in enumerate(sentences):
            trimmed = sentence.strip()
            if not trimmed:
                continue

            # Basic deduplication
            norm = trimmed.lower()
            if norm in seen:
                continue
            seen.add(norm)

            # Always keep first and last sentence to preserve context/flow
            if idx == 0 or idx == len(sentences) - 1:
                keep.append(trimmed)
                continue

            # Calculate word overlap
            s_words = {w.strip("?,.!-()\"'").lower() for w in trimmed.split()}
            overlap = q_words.intersection(s_words)
            
            # Keep if there's any direct word overlap
            if len(overlap) > 0:
                keep.append(trimmed)

        # Re-assemble compressed text
        compressed_body = " ".join(keep)
        return prefix + compressed_body
