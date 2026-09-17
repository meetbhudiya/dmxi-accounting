import { useEffect, useRef, useState } from "react";
import { useCompanyApi } from "../api/useCompanyApi";
import { getToken } from "../api/client";
import Modal from "./Modal";

export type AttachmentEntity = "expense" | "purchase" | "invoice";

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface Props {
  entityType: AttachmentEntity;
  entityId: string;
  title: string;
  onClose: () => void;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isImage = (mime: string) => mime.startsWith("image/");

export default function AttachmentsModal({ entityType, entityId, title, onClose }: Props) {
  const companyApi  = useCompanyApi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files,     setFiles]     = useState<Attachment[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [preview,   setPreview]   = useState<Attachment | null>(null);

  const basePath = `/${entityType}s/${entityId}/attachments`;

  useEffect(() => {
    companyApi.get<Attachment[]>(basePath)
      .then(setFiles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [companyApi, basePath]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const token = getToken() ?? "";
      const url = `/api/companies/${companyApi.companyId}${basePath}?filename=${encodeURIComponent(file.name)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", Authorization: `Bearer ${token}` },
        body: file,
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? "Upload failed"); }
      const att: Attachment = await res.json();
      setFiles((prev) => [...prev, att]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(att: Attachment) {
    if (!window.confirm(`Remove "${att.filename}"?`)) return;
    try {
      await companyApi.del(`/attachments/${att.id}`);
      setFiles((prev) => prev.filter((f) => f.id !== att.id));
      if (preview?.id === att.id) setPreview(null);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function openFile(att: Attachment) {
    window.open(`/api/companies/${companyApi.companyId}/attachments/${att.id}/file`, "_blank");
  }

  return (
    <Modal title={`Attachments — ${title}`} onClose={onClose}>
      <div style={{ minWidth: 420 }}>
        {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>Loading…</div>
        ) : files.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 0 20px", color: "var(--muted)", gap: 8 }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
            <span style={{ fontSize: 13 }}>No attachments yet — upload a receipt or photo below.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {files.map((att) => (
              <div key={att.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg, #f8fafc)",
                transition: "border-color 0.15s",
              }}>
                {/* Thumbnail for images */}
                {isImage(att.mimeType) ? (
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: 6, overflow: "hidden",
                      border: "1px solid var(--border)", flexShrink: 0, cursor: "pointer",
                      background: "var(--border)",
                    }}
                    onClick={() => openFile(att)}
                    title="Click to open"
                  >
                    <img
                      src={`/api/companies/${companyApi.companyId}/attachments/${att.id}/file`}
                      alt={att.filename}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ) : (
                  <div style={{
                    width: 40, height: 40, borderRadius: 6, flexShrink: 0,
                    background: "#eff2ff", display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#2454ff", fontSize: 18,
                  }}>
                    📄
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {att.filename}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                    {fmtSize(att.sizeBytes)} · {new Date(att.createdAt).toLocaleDateString()}
                  </div>
                </div>

                <button className="btn" style={{ fontSize: 11, padding: "3px 10px", flexShrink: 0 }} onClick={() => openFile(att)}>
                  View
                </button>
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: "3px 8px", color: "#dc2626", borderColor: "#fecaca", flexShrink: 0 }}
                  onClick={() => handleDelete(att)}
                  title="Remove attachment"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload strip */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
            {uploading ? "Uploading…" : "Attach file"}
          </button>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Images (JPG, PNG, WEBP) or PDF · max 20 MB
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            style={{ display: "none" }}
            onChange={handleUpload}
          />
        </div>
      </div>
    </Modal>
  );
}
