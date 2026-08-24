import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";

export function usePlaygroundSessions(agentId?: string) {
  const queryClient = useQueryClient();

  const queryParams = new URLSearchParams();
  if (agentId && agentId !== "all") queryParams.set("agent_id", agentId);

  const sessionsQuery = useQuery({
    queryKey: ["playgroundSessions", agentId],
    queryFn: () => apiClient.get<any[]>(`/api/playground/sessions?${queryParams.toString()}`),
    refetchInterval: 10000,
  });

  const createSessionMutation = useMutation({
    mutationFn: ({ agentId, mode = "live", customer = "Playground Tester" }: { agentId: string; mode?: string; customer?: string }) =>
      apiClient.post<any>("/api/playground/session", {
        agent_id: agentId,
        mode,
        customer,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playgroundSessions"] });
    },
  });

  const evaluateMutation = useMutation({
    mutationFn: ({ convoId, promptText, aiReply }: { convoId: string; promptText: string; aiReply: any }) =>
      apiClient.post<any>(`/api/playground/session/${convoId}/evaluate`, {
        prompt_text: promptText,
        ai_reply: aiReply,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["playgroundSession", variables.convoId] });
      queryClient.invalidateQueries({ queryKey: ["playgroundSessions"] });
    },
  });

  const saveTestMutation = useMutation({
    mutationFn: (testData: { agent_id: string; name: string; mode?: string; input: string; expected_behavior?: string }) =>
      apiClient.post<any>("/api/playground/saved-tests", testData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playgroundSavedTests"] });
    },
  });

  const regressionMutation = useMutation({
    mutationFn: (targetAgentId: string) =>
      apiClient.post<any>(`/api/playground/regression?agent_id=${targetAgentId}`, {}),
  });

  return {
    sessions: sessionsQuery.data || [],
    isLoading: sessionsQuery.isLoading,
    isError: sessionsQuery.isError,
    error: sessionsQuery.error,
    refetch: sessionsQuery.refetch,
    createSession: createSessionMutation.mutateAsync,
    isCreating: createSessionMutation.isPending,
    evaluateRun: evaluateMutation.mutateAsync,
    isEvaluating: evaluateMutation.isPending,
    saveTest: saveTestMutation.mutate,
    runRegression: regressionMutation.mutateAsync,
    isRunningRegression: regressionMutation.isPending,
  };
}

export function usePlaygroundSession(sessionId: string | null) {
  return useQuery({
    queryKey: ["playgroundSession", sessionId],
    queryFn: () => apiClient.get<any>(`/api/playground/session/${sessionId}`),
    enabled: !!sessionId,
    refetchInterval: 3000,
  });
}

export function useEdgeCases(agentId?: string) {
  return useQuery({
    queryKey: ["playgroundEdgeCases", agentId],
    queryFn: () => apiClient.get<any[]>(`/api/playground/edge-cases?agent_id=${agentId}`),
    enabled: !!agentId,
  });
}

export function useSavedTests(agentId?: string) {
  return useQuery({
    queryKey: ["playgroundSavedTests", agentId],
    queryFn: () => apiClient.get<any[]>(`/api/playground/saved-tests?agent_id=${agentId || ""}`),
    enabled: !!agentId,
  });
}
