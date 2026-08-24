import unittest
import os
import asyncio
from unittest.mock import patch, MagicMock

from app.providers.gemini import GeminiProvider
from app.providers.base_provider import LLMProviderError, EmbeddingProviderUnavailableError
from app.ai.context.models import ContextConfig
from app.ai.context.retrieval import RetrievalContextBuilder
from app.ai.context.builder import resolve_agent_system_prompt


class TestGeminiArchitecture(unittest.TestCase):
    def setUp(self):
        os.environ["EXECUTION_MODE"] = "LIVE"
        self.provider = GeminiProvider(api_key="")

    def test_missing_api_key_raises_provider_error_in_live_mode(self):
        """Verify that generate_text raises LLMProviderError when API key is missing in LIVE mode."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            with self.assertRaises(LLMProviderError) as cm:
                loop.run_until_complete(
                    self.provider.generate_text(
                        prompt="Hello",
                        system_prompt="You are an assistant.",
                        model="gemini-1.5-flash",
                    )
                )
            self.assertEqual(cm.exception.code, "GEMINI_API_KEY_NOT_CONFIGURED")
        finally:
            loop.close()

    def test_missing_api_key_returns_structured_error_in_live_mode(self):
        """Verify that generate_structured returns StructuredLLMResponse with error in LIVE mode."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            res = loop.run_until_complete(
                self.provider.generate_structured(
                    prompt="Hello",
                    system_prompt="You are an assistant.",
                    model="gemini-1.5-flash",
                )
            )
            self.assertEqual(res.finish_reason, "ERROR")
            self.assertEqual(res.provider_error, "GEMINI_API_KEY_NOT_CONFIGURED")
            self.assertEqual(res.text, "")
        finally:
            loop.close()

    def test_missing_api_key_raises_embedding_error_in_live_mode(self):
        """Verify that embeddings raises EmbeddingProviderUnavailableError without fake vectors."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            with self.assertRaises(EmbeddingProviderUnavailableError) as cm:
                loop.run_until_complete(self.provider.embeddings("test document text"))
            self.assertEqual(cm.exception.code, "EMBEDDING_PROVIDER_UNAVAILABLE")
        finally:
            loop.close()

    def test_invalid_model_raises_invalid_model_error(self):
        """Verify that invalid model names raise LLMProviderError code INVALID_MODEL."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            with self.assertRaises(LLMProviderError) as cm:
                loop.run_until_complete(
                    self.provider.generate_text(
                        prompt="Hello",
                        model="invalid-fake-model-v999",
                    )
                )
            self.assertEqual(cm.exception.code, "INVALID_MODEL")
        finally:
            loop.close()

    def test_system_prompt_includes_knowledge_grounding_instructions(self):
        """Verify resolve_agent_system_prompt includes knowledge grounding instructions."""
        agent_data = {
            "name": "Nila",
            "role": "Personal Assistant",
            "purpose": "Workflow Execution",
        }
        sys_prompt = resolve_agent_system_prompt(agent_data)
        self.assertIn("[KNOWLEDGE GROUNDING INSTRUCTIONS]", sys_prompt)
        self.assertIn("<knowledge_context>", sys_prompt)

    def test_rag_context_formatting(self):
        """Verify RetrievalContextBuilder formats RAG content inside <knowledge_context>."""
        agent_data = {"knowledge_sources": ["RefundPolicy.pdf"]}
        config = ContextConfig(rag_enabled=True)

        with patch("app.ai.context.retrieval.qdrant_client") as mock_qdrant:
            mock_col = MagicMock()
            mock_col.name = "knowledge_ws_123"
            mock_qdrant.get_collections.return_value.collections = [mock_col]
            mock_col_info = MagicMock()
            mock_col_info.config.params.vectors.size = 3072
            mock_qdrant.get_collection.return_value = mock_col_info

            mock_point = MagicMock()
            mock_point.score = 0.9
            mock_point.payload = {"document_title": "RefundPolicy.pdf", "text": "Full refund within 14 days."}
            mock_search = MagicMock()
            mock_search.points = [mock_point]
            mock_qdrant.query_points.return_value = mock_search

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                with patch("app.providers.manager.ProviderManager.get_active_provider") as mock_prov:
                    mock_provider_instance = MagicMock()
                    async def mock_embeddings(q):
                        return [0.1] * 3072
                    mock_provider_instance.embeddings.side_effect = mock_embeddings
                    mock_prov.return_value = (mock_provider_instance, {})

                    context_str, tokens, cited = loop.run_until_complete(
                        RetrievalContextBuilder.build(
                            workspace_id="ws_123",
                            agent_data=agent_data,
                            query="refund policy",
                            config=config,
                            budget_limit=1000,
                        )
                    )
                    self.assertIn("<knowledge_context>", context_str)
                    self.assertIn("Full refund within 14 days", context_str)
                    self.assertIn("</knowledge_context>", context_str)
            finally:
                loop.close()


if __name__ == "__main__":
    unittest.main()
