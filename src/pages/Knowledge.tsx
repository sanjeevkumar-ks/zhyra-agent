import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import {
  Folder,
  FileText,
  Link2,
  HelpCircle,
  UploadCloud,
  Search,
  Sparkles,
  AlertTriangle,
  Copy,
  Star,
  Plus,
} from "lucide-react";
import { AskZhyraChip, Badge, PageHeader, Panel, Button } from "../components/ui";

const typeIcon: Record<string, any> = { PDF: FileText, DOCX: FileText, URL: Link2, FAQ: HelpCircle };

export default function Knowledge() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState("All Documents");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  // Folder states
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [showAddFolder, setShowAddFolder] = useState(false);

  // Dynamic Query Documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiClient.get<any[]>("/api/knowledge/documents"),
  });

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setProgress(20);
    try {
      setProgress(50);
      await apiClient.upload("/api/knowledge/documents", file, folder);
      setProgress(100);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 1000);
    } catch (e) {
      console.error("Document upload indexing failed:", e);
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleAddFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    setCustomFolders((prev) => Array.from(new Set([...prev, trimmed])));
    setFolder(trimmed);
    setNewFolderName("");
    setShowAddFolder(false);
  };

  const docs = documents.filter((d) => folder === "All Documents" || d.folder === folder);

  // Dynamic folder collection merged with custom folders
  const folders = useMemo(() => {
    const dbFolders = documents.map((d: any) => d.folder).filter(Boolean);
    return ["All Documents", ...Array.from(new Set([...customFolders, ...dbFolders]))];
  }, [documents, customFolders]);

  // Compute AI coverage rate based on indexing status
  const indexedCount = documents.filter((d: any) => d.status === "indexed").length;
  const coveragePercentage = documents.length > 0 ? Math.round((indexedCount / documents.length) * 100) : 0;

  // Filter and sort for most referenced list
  const referencedDocs = useMemo(() => {
    return documents
      .filter((d: any) => (d.references || 0) > 0)
      .sort((a: any, b: any) => (b.references || 0) - (a.references || 0))
      .slice(0, 4);
  }, [documents]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Knowledge Hub"
        title="Everything your AI knows"
        description="Upload documents, connect sources, and watch Zhyra turn them into knowledge your agents can act on."
        actions={
          <>
            <AskZhyraChip label="Find knowledge gaps" />
          </>
        }
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.docx,.txt,.csv,.json"
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-colors ${
          dragOver ? "border-accent bg-accent-soft/50" : "border-line hover:border-ink/20"
        }`}
      >
        {!uploading ? (
          <>
            <UploadCloud size={26} className="text-ink-faint" />
            <p className="text-[13.5px] font-medium text-ink">Drag files here, or click to upload</p>
            <p className="text-[12.5px] text-ink-faint">PDF, DOCX, Spreadsheets — Zhyra indexes it all automatically.</p>
          </>
        ) : (
          <div className="w-full max-w-sm space-y-3">
            <p className="flex items-center justify-center gap-2 text-[13.5px] font-medium text-ink">
              <Sparkles size={14} className="animate-pulse-soft text-violet" />
              {progress < 100 ? "Zhyra is indexing your document…" : "Indexed and ready to use"}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-alt">
              <div className="h-full rounded-full bg-accent transition-all duration-150" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr_280px]">
        {/* Folders block */}
        <div className="space-y-1.5">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Folders</p>
          {folders.map((f: string) => (
            <button
              key={f}
              onClick={() => setFolder(f)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors ${
                folder === f ? "bg-canvas-alt font-medium text-ink" : "text-ink-soft hover:bg-canvas-alt/60"
              }`}
            >
              <Folder size={15} className="shrink-0 text-ink-faint" />
              <span className="truncate">{f}</span>
            </button>
          ))}

          {showAddFolder ? (
            <form onSubmit={handleAddFolderSubmit} className="mt-2 px-2 space-y-1.5 animate-slide-in">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name..."
                className="w-full rounded-lg border border-line bg-canvas-alt/50 px-2 py-1.5 text-[12.5px] text-ink focus:outline-none"
                autoFocus
              />
              <div className="flex gap-1.5">
                <Button size="sm" type="submit" className="!px-2.5 !py-1 text-[11.5px] text-white">
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => setShowAddFolder(false)}
                  className="!px-2.5 !py-1 text-[11.5px]"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddFolder(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12.5px] text-accent hover:bg-canvas-alt/50 font-medium"
            >
              <Plus size={14} className="shrink-0" />
              <span>Add Folder</span>
            </button>
          )}
        </div>

        {/* Documents Feed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-faint">
              <Search size={13} />
              <span>Search documents…</span>
            </div>
            <p className="text-[12.5px] text-ink-faint">{docs.length} documents</p>
          </div>
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="flex justify-between items-center px-5 py-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded bg-canvas-alt shrink-0" />
                    <div className="space-y-2">
                      <div className="h-3 w-40 rounded bg-canvas-alt" />
                      <div className="h-3 w-24 rounded bg-canvas-alt" />
                    </div>
                  </div>
                </div>
              ))
            ) : docs.length === 0 ? (
              <div className="p-10 text-center text-[13px] text-ink-faint">
                No documents found in this folder. Drag or select a file to upload.
              </div>
            ) : (
              docs.map((d) => {
                const type = (d.type || "PDF").toUpperCase();
                const Icon = typeIcon[type] || FileText;
                return (
                  <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-canvas-alt/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-alt text-ink-soft">
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-ink">{d.title}</p>
                        <p className="text-[12px] text-ink-faint">
                          {d.folder || "All Documents"} · {d.size_str || `${(d.size / 1024).toFixed(1)} KB`} · {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : "Just now"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="hidden text-[12px] text-ink-faint sm:inline">{d.references || 0} references</span>
                      {d.status === "indexed" && <Badge tone="emerald">Indexed</Badge>}
                      {d.status === "indexing" && <Badge tone="accent">Indexing…</Badge>}
                      {d.status === "stale" && <Badge tone="amber">Needs review</Badge>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* AI Stats Side panel */}
        <aside className="space-y-5">
          <Panel>
            <h3 className="mb-4 text-[13.5px] font-semibold text-ink">AI Coverage</h3>
            <div className="mb-5 flex items-center gap-4">
              <svg width="56" height="56" className="-rotate-90">
                <circle cx="28" cy="28" r="24" stroke="#F0EEE8" strokeWidth="5" fill="none" />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  stroke="#2F6BFF"
                  strokeWidth="5"
                  fill="none"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - coveragePercentage / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <div>
                <p className="text-xl font-semibold text-ink">{coveragePercentage}%</p>
                <p className="text-[12px] text-ink-faint">Understood by your agents</p>
              </div>
            </div>
            
            {documents.length === 0 ? (
              <p className="text-[12px] leading-relaxed text-ink-faint border-t border-line pt-3">
                No coverage stats available. Index documents to populate AI diagnostics.
              </p>
            ) : (
              <div className="space-y-3 border-t border-line pt-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber" />
                  <p className="text-[12.5px] leading-relaxed text-ink-soft">
                    <span className="font-medium text-ink">Missing information:</span> EU return policy not documented
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Copy size={14} className="mt-0.5 shrink-0 text-violet" />
                  <p className="text-[12.5px] leading-relaxed text-ink-soft">
                    <span className="font-medium text-ink">Duplicate content:</span> 2 versions of Refund Policy found
                  </p>
                </div>
              </div>
            )}
          </Panel>

          <Panel>
            <h3 className="mb-3 flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
              <Star size={13} className="text-amber" /> Most referenced
            </h3>
            {referencedDocs.length === 0 ? (
              <p className="text-[12.5px] text-ink-faint leading-relaxed py-2">
                No referenced documents yet. Chats will populate reference counts.
              </p>
            ) : (
              <div className="space-y-2.5">
                {referencedDocs.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between text-[13px]">
                    <span className="truncate text-ink-soft">{d.title}</span>
                    <span className="shrink-0 font-medium text-ink">{d.references || 0}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
