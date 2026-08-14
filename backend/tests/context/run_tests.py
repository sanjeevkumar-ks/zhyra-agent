import asyncio
import sys
from app.ai.context.models import ContextConfig, ContextBudget
from app.ai.context.budget import ContextBudgetManager
from app.ai.context.conversation import ConversationContextBuilder
from app.ai.context.memory import MemoryContextBuilder
from app.ai.context.retrieval import RetrievalContextBuilder
from app.ai.context.tools import ToolContextBuilder, ToolResultCompressor
from app.ai.context.policies import ContextPolicies
from app.ai.context.compressor import ContextCompressor

def test_context_config():
    cfg = ContextConfig()
    assert cfg.max_history_messages == 8, "Expected max_history_messages to be 8"
    assert cfg.max_rag_tokens == 2500, "Expected max_rag_tokens to be 2500"
    assert cfg.compress_rag is True, "Expected compress_rag to be True"
    print("✓ test_context_config passed")

def test_budget_calculation():
    config = ContextConfig(total_context_budget=10000)
    budget = ContextBudgetManager.calculate_budget("claude-3-5-sonnet", config)
    assert budget.total_context_budget == 10000, "Expected total_context_budget to be 10000"
    assert budget.conversation_budget == 2500, "Expected conversation_budget to be 2500"
    assert budget.rag_budget == 3300, "Expected rag_budget to be 3300"

    config_tiny = ContextConfig(total_context_budget=2000)
    budget_tiny = ContextBudgetManager.calculate_budget("gpt-4", config_tiny)
    assert budget_tiny.total_context_budget == 2000, "Expected total_context_budget to be 2000"
    assert budget_tiny.conversation_budget == 500, "Expected conversation_budget to be 500"
    print("✓ test_budget_calculation passed")

def test_sentence_compression():
    text = (
        "Source: doc.txt\n"
        "Content: The quick brown fox jumps over the lazy dog. "
        "A completely unrelated sentence about physics. "
        "Another sentence mentioning the dog. "
        "A final sentence summarizing foxes."
    )
    compressed = ContextCompressor.compress_chunk(text, "query about dog and fox")
    assert "quick brown fox" in compressed, "Expected quick brown fox to be in compressed"
    assert "physics" not in compressed, "Expected physics to be compressed out"
    print("✓ test_sentence_compression passed")

def test_tool_result_compression():
    mock_events = [
        {"summary": "Team Standup", "start": {"dateTime": "2026-08-14T09:00:00Z"}},
        {"summary": "1:1 with Manager", "start": {"dateTime": "2026-08-14T11:00:00Z"}},
        {"summary": "Client Call", "start": {"dateTime": "2026-08-14T14:00:00Z"}}
    ]
    compressed = ToolResultCompressor.compress_result("GoogleCalendar", "list_events", mock_events)
    assert "Team Standup" in compressed, "Expected Team Standup to be in compressed"
    assert "1:1" in compressed, "Expected 1:1 to be in compressed"

    large_metadata = {
        "id": "123",
        "kind": "calendar#event",
        "etag": "\"xyz\"",
        "status": "confirmed",
        "metadata": {"some_deep_nested_boilerplate": "abc"}
    }
    pruned = ToolResultCompressor.compress_result("GoogleCalendar", "create_event", large_metadata)
    assert "id" in pruned, "Expected id to be in pruned"
    assert "status" in pruned, "Expected status to be in pruned"
    assert "metadata" not in pruned, "Expected metadata to be pruned out"
    print("✓ test_tool_result_compression passed")

def test_relevance_overlap_scoring():
    query = "cancel my recent subscription order"
    match = MemoryContextBuilder._calculate_relevance(query, "Customer canceled order subscription yesterday")
    miss = MemoryContextBuilder._calculate_relevance(query, "Standard operational schedule is Mon-Fri")
    assert match > miss, f"Expected Jaccard similarity match ({match}) to exceed miss ({miss})"
    print("✓ test_relevance_overlap_scoring passed")

def test_tool_intent_routing():
    query_cal = "Can we schedule a call for tomorrow?"
    query_lower = query_cal.lower()
    matched = []
    for group, keywords in ToolContextBuilder.KEYWORD_PATTERNS.items():
        if any(k in query_lower for k in keywords):
            matched.append(group)
    assert "calendar" in matched, "Expected calendar group to match"
    print("✓ test_tool_intent_routing passed")

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
    assert "billing question" not in convo_str, "Expected older history to be summarized or truncated"
    assert "twice on my card" in convo_str or "amount was $45" in convo_str, "Expected recent messages to remain"
    print("✓ test_rolling_window_summarization passed")

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
    
    sys_prompt = "You are a customer assistant."
    history = "Customer: Help\nAgent: Yes\n" * 100
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
    
    final_total = (
        ContextBudgetManager.estimate_tokens(sys_p) +
        ContextBudgetManager.estimate_tokens(hist_p) +
        ContextBudgetManager.estimate_tokens(mem_p) +
        ContextBudgetManager.estimate_tokens(rag_p) +
        ContextBudgetManager.estimate_tokens(tool_p)
    )
    assert final_total <= 1000, f"Expected final tokens ({final_total}) to be within 1000"
    print("✓ test_policy_reduction passed")

async def run_all():
    print("Starting Context Engine Unit Tests...")
    test_context_config()
    test_budget_calculation()
    test_sentence_compression()
    test_tool_result_compression()
    test_relevance_overlap_scoring()
    test_tool_intent_routing()
    await test_rolling_window_summarization()
    test_policy_reduction()
    print("All Context Engine unit tests completed successfully!")

if __name__ == "__main__":
    asyncio.run(run_all())
