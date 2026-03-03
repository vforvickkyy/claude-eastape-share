import React from "react";
import {
  FolderOpen, File, FileImage, FilePdf, FileZip, FileVideo, FileAudio, FileCode,
  DotsThree, ArrowCounterClockwise, Trash, FolderSimplePlus, ArrowSquareOut,
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

function RowMenu({ items }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    function outside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  return (
    <div className="card-menu" ref={ref} style={{ position: "relative" }}>
      <button className="card-menu-btn" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
        <DotsThree size={16} weight="bold" />
      </button>
      {open && (
        <div className="card-menu-dropdown" style={{ right: 0, left: "auto" }}>
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

export default function FileList({ shares, folders, isTrash, onFolderClick, onTrash, onRestore, onDelete, onMove }) {
  return (
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
          <tr key={folder.id} className="file-list-row folder-row" onClick={() => onFolderClick?.(folder)}>
            <td className="file-list-name">
              <FolderOpen size={16} weight="duotone" className="row-icon folder-icon-sm" />
              {folder.name}
            </td>
            <td>—</td>
            <td>{formatDate(folder.created_at)}</td>
            <td>
              <RowMenu items={[
                { icon: <Trash size={13} />, label: "Delete folder", danger: true, onClick: () => onDelete?.({ type: "folder", id: folder.id }) },
              ]} />
            </td>
          </tr>
        ))}
        {shares?.map(share => {
          const label = shareLabel(share);
          const firstName = share.files?.[0]?.name || "file";
          const menuItems = isTrash ? [
            { icon: <ArrowCounterClockwise size={13} />, label: "Restore",           onClick: () => onRestore?.(share.token) },
            { icon: <Trash size={13} />,                label: "Delete permanently", danger: true, onClick: () => onDelete?.({ type: "share", token: share.token }) },
          ] : [
            { icon: <ArrowSquareOut size={13} />, label: "Open share link",  onClick: () => window.open(`/share/${share.token}`, "_blank") },
            { icon: <FolderSimplePlus size={13} />, label: "Move to folder", onClick: () => onMove?.(share.token) },
            { icon: <Trash size={13} />,           label: "Move to trash",   danger: true, onClick: () => onTrash?.(share.token) },
          ];
          return (
            <tr key={share.token} className="file-list-row">
              <td className="file-list-name">
                {fileIcon(firstName, 15)}
                <span title={label}>{label}</span>
              </td>
              <td>{formatSize(totalShareSize(share))}</td>
              <td>{formatDate(share.created_at)}</td>
              <td><RowMenu items={menuItems} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
