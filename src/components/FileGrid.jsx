import React from "react";
import {
  FolderOpen, File, FileImage, FilePdf, FileZip, FileVideo, FileAudio, FileCode,
  DotsThree, ArrowCounterClockwise, Trash, FolderSimplePlus, ArrowSquareOut,
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

function MenuBtn({ items }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    function outside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  return (
    <div className="card-menu" ref={ref}>
      <button className="card-menu-btn" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
        <DotsThree size={18} weight="bold" />
      </button>
      {open && (
        <div className="card-menu-dropdown">
          {items.map((item, i) => (
            <button key={i} className={`card-menu-item ${item.danger ? "danger" : ""}`}
              onClick={e => { e.stopPropagation(); setOpen(false); item.onClick(); }}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileGrid({ shares, folders, isTrash, onFolderClick, onTrash, onRestore, onDelete, onMove }) {
  return (
    <div className="file-grid">
      {/* Folders */}
      {folders?.map(folder => (
        <div key={folder.id} className="file-card folder-card" onClick={() => onFolderClick?.(folder)}>
          <div className="file-card-icon folder-icon">
            <FolderOpen size={32} weight="duotone" />
          </div>
          <div className="file-card-info">
            <span className="file-card-name">{folder.name}</span>
            <span className="file-card-meta">{formatDate(folder.created_at)}</span>
          </div>
          <MenuBtn items={[
            { icon: <Trash size={13} />, label: "Delete folder", danger: true, onClick: () => onDelete?.({ type: "folder", id: folder.id }) },
          ]} />
        </div>
      ))}

      {/* Shares */}
      {shares?.map(share => {
        const label = shareLabel(share);
        const firstName = share.files?.[0]?.name || "file";
        const menuItems = isTrash ? [
          { icon: <ArrowCounterClockwise size={13} />, label: "Restore",           onClick: () => onRestore?.(share.token) },
          { icon: <Trash size={13} />,                label: "Delete permanently", danger: true, onClick: () => onDelete?.({ type: "share", token: share.token }) },
        ] : [
          { icon: <ArrowSquareOut size={13} />, label: "Open share link",   onClick: () => window.open(`/share/${share.token}`, "_blank") },
          { icon: <FolderSimplePlus size={13} />, label: "Move to folder",  onClick: () => onMove?.(share.token) },
          { icon: <Trash size={13} />,           label: "Move to trash",    danger: true, onClick: () => onTrash?.(share.token) },
        ];
        return (
          <div key={share.token} className="file-card">
            <div className="file-card-icon">
              {fileIcon(firstName)}
            </div>
            <div className="file-card-info">
              <span className="file-card-name" title={label}>{label}</span>
              <span className="file-card-meta">
                {formatSize(totalShareSize(share))} · {formatDate(share.created_at)}
              </span>
            </div>
            <MenuBtn items={menuItems} />
          </div>
        );
      })}
    </div>
  );
}
