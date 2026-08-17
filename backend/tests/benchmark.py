import asyncio
import time
from app.ai.context.models import ContextConfig
from app.ai.context.engine import ContextEngine
from app.ai.context.budget import ContextBudgetManager

# Simulated datasets
MOCK_HISTORY_SHORT = [
    {"sender_type": "customer", "text": "Hello! How can I contact you?"},
    {"sender_type": "agent", "text": "You can reach us at support@zhyra.ai or check our settings."}
]

MOCK_HISTORY_LONG = [
    {"sender_type": "customer", "text": "I want to start a product launch plan."},
    {"sender_type": "agent", "text": "Great! We can schedule key steps and list tasks."},
    {"sender_type": "customer", "text": "Let's set the launch date for August 20."},
    {"sender_type": "agent", "text": "Launch date is set. Do you need a team sync?"},
    {"sender_type": "customer", "text": "Yes, schedule a marketing sync for tomorrow."},
    {"sender_type": "agent", "text": "Marketing sync scheduled. Anything else?"},
    {"sender_type": "customer", "text": "Also send an email update to Priya about this."},
    {"sender_type": "agent", "text": "Sent email notification to Priya. Ready for launch."},
    {"sender_type": "customer", "text": "Perfect, let's confirm the billing cost first."},
    {"sender_type": "agent", "text": "Billing cost details loaded. Subscription is Scale plan."}
]

MOCK_AGENT_DATA = {
    "name": "Tara",
    "purpose": "General workspace assistant helping with tools and documents",
    "tools": ["GoogleCalendar", "Gmail", "Shopify", "Razorpay", "GoogleDrive"],
    "knowledge_sources": ["Refund Policy.txt", "Operations Manual.txt"]
}

TASKS = [
    {
        "name": "Simple General Question",
        "query": "What is the capital of France?",
        "history": MOCK_HISTORY_SHORT
    },
    {
        "name": "RAG Knowledge Request",
        "query": "What is the policy for processing a refund?",
        "history": MOCK_HISTORY_SHORT
    },
    {
        "name": "Calendar Booking Tool Call",
        "query": "Schedule a meeting with marketing team tomorrow at 3pm.",
        "history": MOCK_HISTORY_SHORT
    },
    {
        "name": "Long Conversation Context",
        "query": "Can you check if the meeting with Priya is confirmed?",
        "history": MOCK_HISTORY_LONG
    }
]

def simulate_legacy_prompt(task) -> int:
    """Simulates how the prompt was constructed prior to the optimization engine."""
    # 1. Full history
    history_str = ""
    for msg in task["history"]:
        history_str += f"{msg['sender_type'].capitalize()}: {msg['text']}\n"
    
    # 2. All tools exposed
    tools_prompt = (
        "Available tools:\n"
        "- GoogleCalendar.list_events\n- GoogleCalendar.create_event\n"
        "- Gmail.send_email\n- WhatsApp.send_message\n- Shopify.get_order\n"
        "- Razorpay.create_refund\n- CustomAPI.request"
    )
    
    # 3. All RAG sources concatenated
    rag_str = (
        "Source: Refund Policy.txt\nContent: Customers can request a full refund within 14 days...\n\n"
        "Source: Operations Manual.txt\nContent: Standard operational rules apply. Hours are 9-5..."
    )
    
    full_prompt = (
        f"You are Tara. Purpose: General assistant.\n{tools_prompt}\n\n"
        f"Conversational History:\n{history_str}\n"
        f"Context docs:\n{rag_str}\n\n"
        f"Customer: {task['query']}\nResponse:"
    )
    return ContextBudgetManager.estimate_tokens(full_prompt)

async def run_benchmark():
    print("=" * 70)
    print(" ZHYRA AI TOKEN & CONTEXT ENGINE OPTIMIZATION BENCHMARK ")
    print("=" * 70)
    print(f"{'Task Name':<28} | {'Before (Tokens)':<15} | {'After (Tokens)':<15} | {'Savings %':<10}")
    print("-" * 70)

    total_before = 0
    total_after = 0

    for task in TASKS:
        # Before tokens
        before_tokens = simulate_legacy_prompt(task)
        
        # After tokens (through ContextEngine)
        packet = await ContextEngine.build(
            workspace_id="ws_usr_admin_",
            agent_id="nova_agent",
            agent_data=MOCK_AGENT_DATA,
            query=task["query"],
            history=task["history"]
        )
        after_tokens = packet.token_usage_estimate.get("total", 0)
        
        savings = ((before_tokens - after_tokens) / before_tokens) * 100
        print(f"{task['name']:<28} | {before_tokens:<15} | {after_tokens:<15} | {savings:.1f}%")
        
        total_before += before_tokens
        total_after += after_tokens

    avg_savings = ((total_before - total_after) / total_before) * 100
    print("-" * 70)
    print(f"{'TOTAL / AVERAGE SAVINGS':<28} | {total_before:<15} | {total_after:<15} | {avg_savings:.1f}%")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_benchmark())
