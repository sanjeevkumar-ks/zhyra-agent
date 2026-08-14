import pytest
import asyncio
from app.ai.context.models import ContextConfig
from app.ai.context.budget import ContextBudgetManager
from app.ai.context.conversation import ConversationContextBuilder
from app.ai.context.memory import MemoryContextBuilder
from app.ai.context.retrieval import RetrievalContextBuilder
from app.ai.context.tools import ToolContextBuilder, ToolResultCompressor
from app.ai.context.policies import ContextPolicies
from app.ai.context.compressor import ContextCompressor
from app.ai.context.engine import ContextEngine

def test_context_config():
    cfg = ContextConfig()
    assert cfg.max_history_messages == 8
    assert cfg.max_rag_tokens == 2500
    assert cfg.compress_rag is True

def test_budget_calculation():
    # Claude model budget
    config = ContextConfig(total_context_budget=10000)
    budget = ContextBudgetManager.calculate_budget("claude-3-5-sonnet", config)
    assert budget.total_context_budget == 10000
    assert budget.conversation_budget == 2500  # 25% of 10k0
    assert budget.rag_budget == 3300  # 33% of 10k

    # Tiny total budget override
    config_tiny = ContextConfig(total_context_budget=2000)
    budget_tiny = ContextBudgetManager.calculate_budget("gpt-4", config_tiny)
    assert budget_tiny.total_context_budget == 2000
    assert budget_tiny.conversation_budget == 500

def test_sentence_compression():
    text = (
        "Source: doc.txt\n"
        "Content: The quick brown fox jumps over the lazy dog. "
        "A completely unrelated sentence about physics. "
        "Another sentence mentioning the dog. "
        "A final sentence summarizing foxes."
    )
    # Compressed chunk matching query words: 'dog'
    compressed = ContextCompressor.compress_chunk(text, "query about dog and fox")
    # First sentence (always kept), last sentence (always kept), dog/fox matching sentences kept, physics sentence removed
    assert "quick brown fox" in compressed
    assert "summary" in compressed or "final" in compressed
    assert "physics" not in compressed

def test_tool_result_compression():
    # Calendar list format
    mock_events = [
        {"summary": "Team Standup", "start": {"dateTime": "2026-08-14T09:00:00Z"}},
        {"summary": "1:1 with Manager", "start": {"dateTime": "2026-08-14T11:00:00Z"}},
        {"summary": "Client Call", "start": {"dateTime": "2026-08-14T14:00:00Z"}}
    ]
    compressed = ToolResultCompressor.compress_result("GoogleCalendar", "list_events", mock_events)
    assert "Team Standup" in compressed
    assert "1:1" in compressed
    assert "Client Call" in compressed

    # Generic JSON pruning
    large_metadata = {
        "id": "123",
        "kind": "calendar#event",
        "etag": "\"xyz\"",
        "status": "confirmed",
        "metadata": {"some_deep_nested_boilerplate": "abc"}
    }
    pruned = ToolResultCompressor.compress_result("GoogleCalendar", "create_event", large_metadata)
    assert "id" in pruned
    assert "status" in pruned
    assert "metadata" not in pruned

def test_relevance_overlap_scoring():
    query = "cancel my recent subscription order"
    match = MemoryContextBuilder._calculate_relevance(query, "Customer canceled order subscription yesterday")
    miss = MemoryContextBuilder._calculate_relevance(query, "Standard operational schedule is Mon-Fri")
    assert match > miss

def test_tool_intent_routing():
    # Calendar keywords mapping
    query_cal = "Can we schedule a call for tomorrow?"
    cal_mapping = ["int_gcal", "int_gmeet"]
    
    # Check if keyword patterns trigger matched group
    query_lower = query_cal.lower()
    matched = []
    for group, keywords in ToolContextBuilder.KEYWORD_PATTERNS.items():
        if any(k in query_lower for k in keywords):
            matched.append(group)
    assert "calendar" in matched

@pytest.mark.asyncio
async def test_rolling_window_summarization():
    history = [
        {"sender_type": "customer", "text": "Hi, I have a billing question"},
        {"sender_type": "agent", "text": "Sure, I can help. What's the issue?"},
        {"sender_type": "customer", "text": "I was charged twice on my card"},
        {"sender_type": "agent", "text": "Let me look up your account transaction"},
        {"sender_type": "customer", "text": "Ok, the amount was $45"}
    ]
    config = ContextConfig(max_history_messages=3, summarize_after_tokens=20)
    convo_str, tokens, summary = await ConversationContextBuilder.build(
        workspace_id="ws_test",
        conversation_id="con_test",
        history=history,
        config=config,
        budget_limit=1000
    )
    # Should keep at most last 3 messages in rolling window
    assert "Hi, I have a billing question" not in convo_str
    assert "twice on my card" in convo_str or "amount was $45" in convo_str

def test_policy_reduction():
    budget = ContextBudget(
        total_context_budget=1000,
        system_prompt_budget=150,
        conversation_budget=250,
        memory_budget=120,
        rag_budget=330,
        tool_budget=150,
        response_budget=200
    )
    
    # Build large context inputs that easily exceed 1000 tokens
    sys_prompt = "You are a customer assistant."
    history = "Customer: Help\nAgent: Yes\n" * 100  # Large convo
    memory = "Fact: Customer is premium.\n" * 20
    rag = "Doc: Refund policy is 14 days.\n" * 40
    tools = "Tool: Calendar.create_event\nTool: Gmail.send_email\n" * 10
    
    sys_p, hist_p, mem_p, rag_p, tool_p = ContextPolicies.apply_reduction(
        budget=budget,
        system_prompt=sys_prompt,
        conversation_history=history,
        memory_context=memory,
        rag_context=rag,
        tool_prompt=tools,
        max_limit=1000
    )
    
    from app.ai.context.budget import ContextBudgetManager
    final_total = (
        ContextBudgetManager.estimate_tokens(sys_p) +
        ContextBudgetManager.estimate_tokens(hist_p) +
        ContextBudgetManager.estimate_tokens(mem_p) +
        ContextBudgetManager.estimate_tokens(rag_p) +
        ContextBudgetManager.estimate_tokens(tool_p)
    )
    assert final_total <= 1000
