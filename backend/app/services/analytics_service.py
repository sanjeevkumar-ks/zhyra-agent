import time
import uuid
from typing import List, Optional, Dict, Any
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error

class AnalyticsService:

    @staticmethod
    def record_event(
        workspace_id: str,
        event_type: str,
        agent_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        tool_name: Optional[str] = None,
        success: bool = True,
        metadata: Optional[Dict[str, Any]] = None
    ) -> dict:
        """Centralized analytics event recorder. Stores structured events in Firestore."""
        event_id = f"evt_{uuid.uuid4().hex[:12]}"
        now = time.time()

        event_doc = {
            "id": event_id,
            "workspace_id": workspace_id,
            "event_type": event_type,
            "agent_id": agent_id or "",
            "conversation_id": conversation_id or "",
            "tool_name": tool_name or "",
            "success": success,
            "metadata": metadata or {},
            "created_at": now
        }

        try:
            firestore_client.collection("analytics_events").document(event_id).set(event_doc)
            log_info(f"Analytics event recorded [{event_type}] for workspace {workspace_id}")
        except Exception as e:
            log_error(f"Failed to record analytics event for workspace {workspace_id}", exc=e)

        return event_doc

    @staticmethod
    async def get_dashboard_analytics(workspace_id: str, range_key: str = "30d") -> dict:
        """Calculates real workspace analytics strictly from recorded event and conversation data."""
        now = time.time()
        
        # Calculate time cutoff based on range parameter
        if range_key == "today":
            cutoff = now - 86400
            prev_cutoff = now - (86400 * 2)
        elif range_key == "7d":
            cutoff = now - (86400 * 7)
            prev_cutoff = now - (86400 * 14)
        elif range_key == "90d":
            cutoff = now - (86400 * 90)
            prev_cutoff = now - (86400 * 180)
        else:  # Default 30d
            cutoff = now - (86400 * 30)
            prev_cutoff = now - (86400 * 60)

        # 1. Fetch workspace analytics events
        events_in_range = []
        prev_events = []
        try:
            events_stream = firestore_client.collection("analytics_events").stream()
            for doc in events_stream:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id:
                    created = data.get("created_at", 0)
                    if created >= cutoff:
                        events_in_range.append(data)
                    elif prev_cutoff <= created < cutoff:
                        prev_events.append(data)
        except Exception as e:
            log_error("Failed to query analytics_events from Firestore", exc=e)

        # 2. Fetch workspace conversations
        convos_in_range = []
        prev_convos = []
        try:
            convos_stream = firestore_client.collection("conversations").stream()
            for doc in convos_stream:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id:
                    created = data.get("created_at") or data.get("updated_at") or 0
                    if created >= cutoff:
                        convos_in_range.append(data)
                    elif prev_cutoff <= created < cutoff:
                        prev_convos.append(data)
        except Exception as e:
            log_error("Failed to query conversations from Firestore", exc=e)

        # Total Conversations
        total_convos = len(convos_in_range)
        prev_total_convos = len(prev_convos)

        # --- METRIC 1: Customer Satisfaction (CSAT) ---
        feedback_events = [e for e in events_in_range if e.get("event_type") == "feedback_received"]
        prev_feedback_events = [e for e in prev_events if e.get("event_type") == "feedback_received"]

        if feedback_events:
            csat_scores = [e.get("metadata", {}).get("rating", 5) for e in feedback_events if isinstance(e.get("metadata", {}).get("rating"), (int, float))]
            csat = round(sum(csat_scores) / len(csat_scores), 1) if csat_scores else None
        else:
            csat = None

        if prev_feedback_events:
            prev_csat_scores = [e.get("metadata", {}).get("rating", 5) for e in prev_feedback_events if isinstance(e.get("metadata", {}).get("rating"), (int, float))]
            prev_csat = round(sum(prev_csat_scores) / len(prev_csat_scores), 1) if prev_csat_scores else None
        else:
            prev_csat = None

        csat_change = round(csat - prev_csat, 1) if (csat is not None and prev_csat is not None) else None

        # --- METRIC 2: Resolution Rate ---
        if total_convos > 0:
            resolved_convos = sum(1 for c in convos_in_range if c.get("status") in ("completed", "resolved"))
            resolution_rate = round((resolved_convos / total_convos) * 100, 1)
        else:
            resolution_rate = None

        if prev_total_convos > 0:
            prev_resolved = sum(1 for c in prev_convos if c.get("status") in ("completed", "resolved"))
            prev_resolution_rate = round((prev_resolved / prev_total_convos) * 100, 1)
        else:
            prev_resolution_rate = None

        res_change = round(resolution_rate - prev_resolution_rate, 1) if (resolution_rate is not None and prev_resolution_rate is not None) else None

        # --- METRIC 3: AI Confidence ---
        confidence_events = [e for e in events_in_range if e.get("metadata", {}).get("confidence") is not None]
        if confidence_events:
            conf_scores = [float(e["metadata"]["confidence"]) for e in confidence_events]
            ai_confidence = round(sum(conf_scores) / len(conf_scores), 1)
        else:
            ai_confidence = None

        # --- METRIC 4: Escalation Rate ---
        if total_convos > 0:
            escalated_convos = sum(1 for c in convos_in_range if c.get("status") == "escalated" or c.get("escalated") is True)
            escalation_rate = round((escalated_convos / total_convos) * 100, 1)
        else:
            escalation_rate = None

        # --- METRIC 5: Automation Savings ---
        successful_actions = sum(1 for e in events_in_range if e.get("event_type") == "tool_succeeded" or (e.get("event_type") == "tool_execution" and e.get("success") is True))
        prev_successful_actions = sum(1 for e in prev_events if e.get("event_type") == "tool_succeeded" or (e.get("event_type") == "tool_execution" and e.get("success") is True))

        if successful_actions > 0:
            hours_saved = round((successful_actions * 5) / 60, 1)
            cost_saved = int(hours_saved * 35)  # $35/hr estimated handling cost
            fte_saved = round(successful_actions / 150, 1)  # 150 actions = 1 FTE
        else:
            hours_saved = 0
            cost_saved = 0
            fte_saved = 0

        # --- METRIC 6: Top Questions ---
        user_msgs = [e for e in events_in_range if e.get("event_type") == "user_message"]
        question_counts: Dict[str, int] = {}
        for m in user_msgs:
            txt = m.get("metadata", {}).get("text", "").strip()
            if txt and len(txt) > 3:
                # Basic normalization
                norm = txt.rstrip("?.!").strip().capitalize()
                question_counts[norm] = question_counts.get(norm, 0) + 1

        top_questions = [
            {"q": q, "count": cnt}
            for q, cnt in sorted(question_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        ]

        # --- METRIC 7: Knowledge Gaps ---
        gap_events = [e for e in events_in_range if e.get("event_type") == "knowledge_gap"]
        gap_counts: Dict[str, int] = {}
        for g in gap_events:
            q = g.get("metadata", {}).get("question", "Unanswered query").strip()
            gap_counts[q] = gap_counts.get(q, 0) + 1

        knowledge_gaps = [
            {"gap": q, "count": cnt}
            for q, cnt in sorted(gap_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        ]

        # --- METRIC 8: Failed Actions ---
        failed_events = [e for e in events_in_range if e.get("event_type") == "tool_failed" or (e.get("event_type") == "tool_execution" and e.get("success") is False)]
        failed_counts: Dict[str, Dict[str, Any]] = {}
        for f in failed_events:
            tool = f.get("tool_name") or f.get("metadata", {}).get("tool_name") or "Action"
            agent_id = f.get("agent_id") or "Agent"
            key = f"{tool}_{agent_id}"
            if key not in failed_counts:
                failed_counts[key] = {"name": tool, "agent": agent_id, "count": 0}
            failed_counts[key]["count"] += 1

        failed_actions = list(failed_counts.values())[:5]

        # --- METRIC 9: Timeseries & Sparklines ---
        # Generate date buckets for the selected range
        days_count = 7 if range_key == "7d" else 90 if range_key == "90d" else 1 if range_key == "today" else 30
        timeseries_series = []
        for d in range(days_count - 1, -1, -1):
            day_start = now - ((d + 1) * 86400)
            day_end = now - (d * 86400)
            day_label = time.strftime("%Y-%m-%d", time.gmtime(day_end))

            day_convos = sum(1 for c in convos_in_range if day_start <= (c.get("created_at") or 0) < day_end)
            day_resolved = sum(1 for c in convos_in_range if day_start <= (c.get("created_at") or 0) < day_end and c.get("status") in ("completed", "resolved"))
            day_fails = sum(1 for e in events_in_range if day_start <= (e.get("created_at") or 0) < day_end and e.get("event_type") in ("tool_failed", "conversation_failed"))

            timeseries_series.append({
                "date": day_label,
                "conversations": day_convos,
                "resolved": day_resolved,
                "failed_actions": day_fails
            })

        has_real_data = (total_convos > 0 or len(events_in_range) > 0)

        return {
            "range": range_key,
            "has_real_data": has_real_data,
            "conversations_total": total_convos,
            "conversations_change": round(((total_convos - prev_total_convos) / prev_total_convos * 100), 1) if prev_total_convos > 0 else None,
            "csat": csat,
            "csat_change": csat_change,
            "resolution_rate": resolution_rate,
            "resolution_change": res_change,
            "ai_confidence": ai_confidence,
            "escalation_rate": escalation_rate,
            "successful_actions": successful_actions,
            "hours_saved": hours_saved,
            "cost_saved": cost_saved,
            "fte_saved": fte_saved,
            "top_questions": top_questions,
            "knowledge_gaps": knowledge_gaps,
            "failed_actions": failed_actions,
            "timeseries": timeseries_series,
        }

    @staticmethod
    async def get_recent_activity(workspace_id: str) -> List[dict]:
        """Compiles recent operational events strictly from actual events and docs."""
        activities = []
        try:
            events_stream = firestore_client.collection("analytics_events").stream()
            events = [e.to_dict() for e in events_stream if e.to_dict().get("workspace_id") == workspace_id]
            sorted_events = sorted(events, key=lambda x: x.get("created_at", 0), reverse=True)[:10]

            for ev in sorted_events:
                e_type = ev.get("event_type", "")
                created = ev.get("created_at", time.time())
                time_str = time.strftime("%b %d, %H:%M", time.gmtime(created))

                if "tool" in e_type:
                    activities.append({
                        "id": ev.get("id"),
                        "type": "workflow",
                        "title": f"Tool '{ev.get('tool_name', 'Action')}' executed",
                        "detail": f"Status: {'Success' if ev.get('success') else 'Failed'}",
                        "agent": ev.get("agent_id", "Agent"),
                        "time": time_str
                    })
                elif "conversation" in e_type:
                    activities.append({
                        "id": ev.get("id"),
                        "type": "booking",
                        "title": f"Conversation {e_type.replace('_', ' ')}",
                        "detail": f"Conversation {ev.get('conversation_id', '')}",
                        "agent": ev.get("agent_id", "Agent"),
                        "time": time_str
                    })
                elif "knowledge" in e_type:
                    activities.append({
                        "id": ev.get("id"),
                        "type": "knowledge",
                        "title": "Knowledge Query",
                        "detail": ev.get("metadata", {}).get("question", "Search query"),
                        "time": time_str
                    })
        except Exception as e:
            log_error(f"Failed to query recent activity for workspace {workspace_id}", exc=e)

        return activities
