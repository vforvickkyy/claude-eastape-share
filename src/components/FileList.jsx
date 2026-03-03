import React from "react";
import {
  FolderOpen, File, FileImage, FilePdf, FileZip, FileVideo, FileAudio, FileCode,
  DotsThree, ArrowCounterClockwise, Trash, FolderSimplePlus, ArrowSquareOut,
  Copy, PencilSimple,
} from "@phosphor-icons/react";
import { formatSize, formatDate, totalShareSize, shareLabel } from "../lib/userApi";

function fileIcon(name, size = 16) {
  const ext = (name?.split(".").pop() || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return <FileImage size={size} weight="duotone" />;
  if (ext === "pdf") return <FilePdf size={size} weight="duotone" />;
  if (["zip","rar","7z","tar","gz"].includes(ext)) return <FileZip size={size} weight="duotone" />;
  if (["mp4","mov","avi","mkv","webm"].includes(ext)) return <FileVideo size={size} weight="duotone" />;
  if (["mp3","wav","ogg","flac","aac"].includes(ext)) return <FileAudio size={size} weight="duotone" />;
  if (["js","ts","jsx","tsx","py","go","rs","html","css"].includes(ext)) return <FileCode size={size} weight="duotone" />;
  return <File size={size} weight="duotone" />;
}

function CtxMenu({ x, y, items, ctxRef }) {
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

export default function FileList({ shares, folders, isTrash, onFolderClick, onTrash, onRestore, onDelete, onMove, onRename }) {
  const [ctxMenu, setCtxMenu] = React.useState(null);
  const [renaming, setRenaming] = React.useState(null);
  const [copied, setCopied] = React.useState(null);
  const ctxRef = React.useRef(null);
  const inputRef = React.useRef(null);

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

  React.useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

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

  function shareItems(share) {
    const currentName = share.files?.[0]?.name || "file";
    if (isTrash) return [
      { icon: <ArrowCounterClockwise size={13} />, label: "Restore",           onClick: () => { onRestore?.(share.token); setCtxMenu(null); } },
      { icon: <Trash size={13} />,                label: "Delete permanently", danger: true, onClick: () => { onDelete?.({ type: "share", token: share.token }); setCtxMenu(null); } },
    ];
    return [
      { icon: <ArrowSquareOut size={13} />,  label: "Open share link",  onClick: () => { window.open(`/share/${share.token}`, "_blank"); setCtxMenu(null); } },
      { icon: <Copy size={13} />,            label: "Copy link",        onClick: () => copyLink(share.token) },
      { divider: true },
      { icon: <PencilSimple size={13} />,    label: "Rename",           onClick: () => startRename(share.token, currentName) },
      { icon: <FolderSimplePlus size={13} />, label: "Move to folder",  onClick: () => { onMove?.(share.token); setCtxMenu(null); } },
      { divider: true },
      { icon: <Trash size={13} />,           label: "Move to trash",    danger: true, onClick: () => { onTrash?.(share.token); setCtxMenu(null); } },
      { icon: <Trash size={13} />,           label: "Delete permanently", danger: true, onClick: () => { onDelete?.({ type: "share", token: share.token }); setCtxMenu(null); } },
    ];
  }

  function folderItems(folder) {
    return [
      { icon: <Trash size={13} />, label: "Delete folder", danger: true, onClick: () => { onDelete?.({ type: "folder", id: folder.id }); setCtxMenu(null); } },
    ];
  }

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
    <>
      <table className="file-list-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Date</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {folders?.map(folder => (
            <tr
              key={folder.id}
              className="file-list-row folder-row"
              onClick={() => onFolderClick?.(folder)}
              onContextMenu={e => openAt(e, { isFolder: true, folderId: folder.id })}
            >
              <td className="file-list-name">
                <FolderOpen size={16} weight="duotone" className="row-icon folder-icon-sm" />
                {folder.name}
              </td>
              <td>—</td>
              <td>{formatDate(folder.created_at)}</td>
              <td>
                <div className="card-menu" style={{ position: "relative" }}>
                  <button
                    className="card-menu-btn"
                    onClick={e => openFromBtn(e, { isFolder: true, folderId: folder.id })}
                  >
                    <DotsThree size={16} weight="bold" />
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {shares?.map(share => {
            const label     = shareLabel(share);
            const firstName = share.files?.[0]?.name || "file";
            const isRenaming = renaming?.token === share.token;
            const wasCopied  = copied === share.token;

            return (
              <tr
                key={share.token}
                className="file-list-row"
                onContextMenu={e => openAt(e, { token: share.token, isFolder: false })}
              >
                <td className="file-list-name">
                  {fileIcon(firstName, 15)}
                  {isRenaming ? (
                    <input
                      ref={inputRef}
                      className="rename-input rename-input--row"
                      value={renaming.value}
                      onChange={e => setRenaming(r => ({ ...r, value: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === "Enter")  commitRename(share.token);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      onBlur={() => commitRename(share.token)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span title={label} style={{ color: wasCopied ? "var(--purple-l)" : undefined }}>
                      {wasCopied ? "Link copied!" : label}
                    </span>
                  )}
                </td>
                <td>{formatSize(totalShareSize(share))}</td>
                <td>{formatDate(share.created_at)}</td>
                <td>
                  <div className="card-menu" style={{ position: "relative" }}>
                    <button
                      className="card-menu-btn"
                      onClick={e => openFromBtn(e, { token: share.token, isFolder: false })}
                    >
                      <DotsThree size={16} weight="bold" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {ctxMenu && ctxItems.length > 0 && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} ctxRef={ctxRef} />
      )}
    </>
  );
}
