import { auth } from "../../firebase";

export const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getHeaders(customHeaders: Record<string, string> = {}): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...customHeaders,
  };

  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken(true);
      headers["Authorization"] = `Bearer ${idToken}`;
    }
  } catch (e) {
    console.error("Failed to append ID Token to request headers", e);
  }

  return headers;
}

export const apiClient = {
  async get<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
    const requestHeaders = await getHeaders(headers);
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: requestHeaders,
    });

    if (!response.ok) {
      let message = "An error occurred while fetching data.";
      try {
        const errData = await response.json();
        message = errData.detail || message;
      } catch {}
      throw new ApiError(message, response.status);
    }

    return response.json() as Promise<T>;
  },

  async post<T>(path: string, body: any, headers: Record<string, string> = {}): Promise<T> {
    const requestHeaders = await getHeaders(headers);
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let message = "An error occurred while sending data.";
      try {
        const errData = await response.json();
        message = errData.detail || message;
      } catch {}
      throw new ApiError(message, response.status);
    }

    return response.json() as Promise<T>;
  },

  async put<T>(path: string, body: any, headers: Record<string, string> = {}): Promise<T> {
    const requestHeaders = await getHeaders(headers);
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "PUT",
      headers: requestHeaders,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let message = "An error occurred while updating data.";
      try {
        const errData = await response.json();
        message = errData.detail || message;
      } catch {}
      throw new ApiError(message, response.status);
    }

    return response.json() as Promise<T>;
  },

  async delete<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
    const requestHeaders = await getHeaders(headers);
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: requestHeaders,
    });

    if (!response.ok) {
      let message = "An error occurred while deleting resource.";
      try {
        const errData = await response.json();
        message = errData.detail || message;
      } catch {}
      throw new ApiError(message, response.status);
    }

    return response.json() as Promise<T>;
  },

  async upload<T>(path: string, file: File, folder: string = "All Documents"): Promise<T> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const headers: Record<string, string> = {};
    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      let message = "Upload failed.";
      try {
        const errData = await response.json();
        message = errData.detail || message;
      } catch {}
      throw new ApiError(message, response.status);
    }

    return response.json() as Promise<T>;
  },

  async stream(
    path: string,
    onChunk: (text: string) => void,
    onMetadata?: (meta: any) => void,
    onEvent?: (event: any) => void,
    onAck?: (ack: any) => void
  ): Promise<void> {
    const currentUser = auth.currentUser;
    let authHeader = "";
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      authHeader = `Bearer ${idToken}`;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: authHeader ? { "Authorization": authHeader } : {},
    });

    if (!response.ok) {
      throw new ApiError("Streaming connection failed.", response.status);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line.startsWith("data: ")) {
          const content = line.substring(6).trim();
          if (content === "[DONE]") {
            return;
          }
          if (content.startsWith("__ACK__:")) {
            if (onAck) {
              try {
                onAck(JSON.parse(content.substring(8)));
              } catch {}
            }
          } else if (content.startsWith("__EVENT__:")) {
            if (onEvent) {
              try {
                onEvent(JSON.parse(content.substring(10)));
              } catch {}
            }
          } else if (content.startsWith("__METADATA__:")) {
            if (onMetadata) {
              try {
                const meta = JSON.parse(content.substring(13));
                onMetadata(meta);
              } catch {}
            }
          } else {
            onChunk(content);
          }
        }
      }
      buffer = lines[lines.length - 1];
    }
  }
};
