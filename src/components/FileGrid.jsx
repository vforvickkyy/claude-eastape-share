import React from "react";
import {
  FolderOpen, File, FileImage, FilePdf, FileZip, FileVideo, FileAudio, FileCode,
  DotsThree, ArrowCounterClockwise, Trash, FolderSimplePlus, ArrowSquareOut,
  Copy, PencilSimple, Check, X,
} from "@phosphor-icons/react";
import { formatSize, formatDate, totalShareSize, shareLabel } from "../lib/userApi";

function fileIcon(name, size = 28) {
  const ext = (name?.split(".").pop() || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return <FileImage size={size} weight="duotone" />;
  if (ext === "pdf") return <FilePdf size={size} weight="duotone" />;
  if (["zip","rar","7z","tar","gz"].includes(ext)) return <FileZip size={size} weight="duotone" />;
  if (["mp4","mov","avi","mkv","webm"].includes(ext)) return <FileVideo size={size} weight="duotone" />;
  if (["mp3","wav","ogg","flac","aac"].includes(ext)) return <FileAudio size={size} weight="duotone" />;
  if (["js","ts","jsx","tsx","py","go","rs","html","css"].includes(ext)) return <FileCode size={size} weight="duotone" />;
  return <File size={size} weight="duotone" />;
}

/* Shared context menu rendered at fixed screen position */
function CtxMenu({ x, y, items, onClose, ctxRef }) {
  // Flip left if near right edge
  const left = x + 190 > window.innerWidth ? x - 190 : x;
  const top  = y + items.length * 34 + 16 > window.innerHeight ? y - items.length * 34 - 8 : y;

  return (
    <div
      ref={ctxRef}
      className="card-menu-dropdown ctx-fixed"
      style={{ left, top }}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="ctx-divider" />
        ) : (
          <button
            key={i}
            className={`card-menu-item ${item.danger ? "danger" : ""}`}
            onClick={e => { e.stopPropagation(); item.onClick(); }}
          >
            {item.icon} {item.label}
          </button>
        )
      )}
    </div>
  );
}

export default function FileGrid({ shares, folders, isTrash, onFolderClick, onTrash, onRestore, onDelete, onMove, onRename }) {
  const [ctxMenu, setCtxMenu] = React.useState(null); // { token, x, y, isFolder, folderId } | null
  const [renaming, setRenaming] = React.useState(null); // { token, value } | null
  const [copied, setCopied] = React.useState(null); // token that was just copied
  const ctxRef = React.useRef(null);

  /* Close menu on outside click or ESC */
  React.useEffect(() => {
    if (!ctxMenu) return;
    function onDown(e) {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null);
    }
    function onKey(e) { if (e.key === "Escape") setCtxMenu(null); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  function openAt(e, payload) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ ...payload, x: e.clientX, y: e.clientY });
  }

  function openFromBtn(e, payload) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setCtxMenu({ ...payload, x: r.left, y: r.bottom + 4 });
  }

  function copyLink(token) {
    navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(t => t === token ? null : t), 1800);
    setCtxMenu(null);
  }

  function startRename(token, currentName) {
    setRenaming({ token, value: currentName });
    setCtxMenu(null);
  }

  async function commitRename(token) {
    const name = renaming?.value?.trim();
    setRenaming(null);
    if (!name) return;
    await onRename?.(token, name);
  }

  /* Menu items for a share */
  function shareItems(share) {
    const currentName = share.files?.[0]?.name || "file";
    if (isTrash) return [
      { icon: <ArrowCounterClockwise size={13} />, label: "Restore",            onClick: () => { onRestore?.(share.token); setCtxMenu(null); } },
      { icon: <Trash size={13} />,                label: "Delete permanently",  danger: true, onClick: () => { onDelete?.({ type: "share", token: share.token }); setCtxMenu(null); } },
    ];
    return [
      { icon: <ArrowSquareOut size={13} />, label: "Open share link",  onClick: () => { window.open(`/share/${share.token}`, "_blank"); setCtxMenu(null); } },
      { icon: <Copy size={13} />,           label: "Copy link",        onClick: () => copyLink(share.token) },
      { divider: true },
      { icon: <PencilSimple size={13} />,   label: "Rename",           onClick: () => startRename(share.token, currentName) },
      { icon: <FolderSimplePlus size={13} />,label: "Move to folder",  onClick: () => { onMove?.(share.token); setCtxMenu(null); } },
      { divider: true },
      { icon: <Trash size={13} />,          label: "Move to trash",    danger: true, onClick: () => { onTrash?.(share.token); setCtxMenu(null); } },
      { icon: <Trash size={13} />,          label: "Delete permanently", danger: true, onClick: () => { onDelete?.({ type: "share", token: share.token }); setCtxMenu(null); } },
    ];
  }

  /* Menu items for a folder */
  function folderItems(folder) {
    return [
      { icon: <Trash size={13} />, label: "Delete folder", danger: true, onClick: () => { onDelete?.({ type: "folder", id: folder.id }); setCtxMenu(null); } },
    ];
  }

  /* Resolve items for the active context menu */
  const ctxItems = React.useMemo(() => {
    if (!ctxMenu) return [];
    if (ctxMenu.isFolder) {
      const folder = folders?.find(f => f.id === ctxMenu.folderId);
      return folder ? folderItems(folder) : [];
    }
    const share = shares?.find(s => s.token === ctxMenu.token);
    return share ? shareItems(share) : [];
  }, [ctxMenu, shares, folders, isTrash]);

  return (
    <div className="file-grid">
      {/* Folders */}
      {folders?.map(folder => (
        <div
          key={folder.id}
          className="file-card folder-card"
          onClick={() => onFolderClick?.(folder)}
          onContextMenu={e => openAt(e, { isFolder: true, folderId: folder.id })}
        >
          <div className="file-card-icon folder-icon">
            <FolderOpen size={32} weight="duotone" />
          </div>
          <div className="file-card-info">
            <span className="file-card-name">{folder.name}</span>
            <span className="file-card-meta">{formatDate(folder.created_at)}</span>
          </div>
          <button
            className="card-menu-btn"
            onClick={e => openFromBtn(e, { isFolder: true, folderId: folder.id })}
          >
            <DotsThree size={18} weight="bold" />
          </button>
        </div>
      ))}

      {/* Shares */}
      {shares?.map(share => {
        const label   = shareLabel(share);
        const firstName = share.files?.[0]?.name || "file";
        const isRenaming = renaming?.token === share.token;
        const wasCopied  = copied === share.token;
        const isDeleted  = share.files?.every(f => f.storage_deleted);
        const hasDeleted = !isDeleted && share.files?.some(f => f.storage_deleted);

        return (
          <div
            key={share.token}
            className={`file-card ${isDeleted ? "file-card--deleted" : ""}`}
            onContextMenu={e => openAt(e, { token: share.token, isFolder: false })}
          >
            <div className="file-card-icon">{fileIcon(firstName)}</div>

            <div className="file-card-info">
              {isRenaming ? (
                <input
                  className="rename-input"
                  value={renaming.value}
                  autoFocus
                  onChange={e => setRenaming(r => ({ ...r, value: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === "Enter")  commitRename(share.token);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={() => commitRename(share.token)}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="file-card-name" title={label}>{label}</span>
              )}
              <span className="file-card-meta">
                {isDeleted  ? "Downloaded & deleted" :
                 hasDeleted ? "Partially downloaded" :
                 wasCopied  ? "Link copied!" :
                 `${formatSize(totalShareSize(share))} · ${formatDate(share.created_at)}`}
              </span>
              {(isDeleted || hasDeleted) && (
                <span className="file-deleted-badge">{isDeleted ? "Deleted" : "Partial"}</span>
              )}
            </div>

            <button
              className="card-menu-btn"
              onClick={e => openFromBtn(e, { token: share.token, isFolder: false })}
            >
              <DotsThree size={18} weight="bold" />
            </button>
          </div>
        );
      })}

      {/* Context menu */}
      {ctxMenu && ctxItems.length > 0 && (
        <CtxMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems}
          ctxRef={ctxRef}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
