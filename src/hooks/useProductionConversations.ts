import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";

export interface ConversationFilterOptions {
  agentId?: string;
  channel?: string;
  status?: string;
  search?: string;
}

export type ConversationStatus = "active" | "training" | "paused" | "resolved" | "escalated";

export interface ProductionConversation {
  id: string;
  agent_id?: string;
  agent_name?: string;
  channel?: string;
  status?: ConversationStatus | string;
  customer_name?: string;
  customer_avatar?: string;
  last_message?: string;
  updated_at?: string;
  messages?: Array<{
    id: string;
    sender: "user" | "agent" | "system";
    text: string;
    timestamp: string;
  }>;
  [key: string]: any;
}

export function useProductionConversations(filters: ConversationFilterOptions = {}) {
  const queryClient = useQueryClient();

  const queryParams = new URLSearchParams();
  if (filters.agentId && filters.agentId !== "all") queryParams.append("agent_id", filters.agentId);
  if (filters.channel && filters.channel !== "all") queryParams.append("channel", filters.channel);
  if (filters.status && filters.status !== "all") queryParams.append("status", filters.status);
  if (filters.search) queryParams.append("search", filters.search);

  const {
    data: conversations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<ProductionConversation[]>({
    queryKey: ["productionConversations", filters],
    queryFn: () => apiClient.get<ProductionConversation[]>(`/api/conversations?${queryParams.toString()}`),
  });

  const takeoverMutation = useMutation({
    mutationFn: (param: string | { convoId: string }) => {
      const id = typeof param === "string" ? param : param.convoId;
      return apiClient.post(`/api/conversations/${id}/takeover`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productionConversations"] });
      queryClient.invalidateQueries({ queryKey: ["productionConversation"] });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: (param: string | { convoId: string }) => {
      const id = typeof param === "string" ? param : param.convoId;
      return apiClient.post(`/api/conversations/${id}/reopen`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productionConversations"] });
      queryClient.invalidateQueries({ queryKey: ["productionConversation"] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (param: string | { convoId: string }) => {
      const id = typeof param === "string" ? param : param.convoId;
      return apiClient.post(`/api/conversations/${id}/resolve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productionConversations"] });
      queryClient.invalidateQueries({ queryKey: ["productionConversation"] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({ convoId, text, senderType }: { convoId: string; text: string; senderType?: string }) =>
      apiClient.post(`/api/conversations/${convoId}/message`, { text, senderType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productionConversations"] });
      queryClient.invalidateQueries({ queryKey: ["productionConversation"] });
    },
  });

  return {
    conversations,
    isLoading,
    isError,
    refetch,
    takeover: takeoverMutation.mutateAsync,
    isTakeoverPending: takeoverMutation.isPending,
    reopen: reopenMutation.mutateAsync,
    isReopenPending: reopenMutation.isPending,
    resolve: resolveMutation.mutateAsync,
    isResolvePending: resolveMutation.isPending,
    sendMessage: sendMessageMutation.mutateAsync,
    isSending: sendMessageMutation.isPending,
  };
}

export function useProductionConversation(convoId: string | null) {
  return useQuery<ProductionConversation | null>({
    queryKey: ["productionConversation", convoId],
    queryFn: () => {
      if (!convoId) return Promise.resolve(null);
      return apiClient.get<ProductionConversation>(`/api/conversations/${convoId}`);
    },
    enabled: Boolean(convoId),
  });
}
