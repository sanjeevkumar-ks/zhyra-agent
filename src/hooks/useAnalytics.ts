import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";

export type AnalyticsRange = "today" | "7d" | "30d" | "90d";

export interface AnalyticsOverview {
  range: AnalyticsRange;
  has_real_data: boolean;
  conversations_total: number;
  conversations_change: number | null;
  csat: number | null;
  csat_change: number | null;
  resolution_rate: number | null;
  resolution_change: number | null;
  ai_confidence: number | null;
  escalation_rate: number | null;
  successful_actions: number;
  hours_saved: number;
  cost_saved: number;
  fte_saved: number;
  top_questions: Array<{ q: string; count: number }>;
  knowledge_gaps: Array<{ gap: string; count: number }>;
  failed_actions: Array<{ name: string; agent: string; count: number }>;
  timeseries: Array<{ date: string; conversations: number; resolved: number; failed_actions: number }>;
}

export function useAnalytics(initialRange: AnalyticsRange = "30d") {
  const [range, setRange] = useState<AnalyticsRange>(initialRange);

  const query = useQuery({
    queryKey: ["analytics-overview", range],
    queryFn: () => apiClient.get<AnalyticsOverview>(`/api/analytics/overview?range=${range}`),
    staleTime: 30000,
  });

  return {
    range,
    setRange,
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
