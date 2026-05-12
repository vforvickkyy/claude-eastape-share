import React, { useEffect, useState, useRef } from "react";
import {
  PaperPlaneTilt, CheckCircle, ArrowBendDownRight, Clock, Trash,
} from "@phosphor-icons/react";
import { mediaApi } from "../../lib/api";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";

const AVATAR_COLORS = ['#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#f97316']
function avatarColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function CommentsPanel({ assetId, currentTime, onSeek, onCommentsChange, isAssetOwner }) {
  const { user } = useAuth();
  const [comments,    setComments]   = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [body,        setBody]       = useState("");
  const [replyTo,     setReplyTo]    = useState(null);
  const [submitting,  setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const bottomRef = useRef(null);

  function loadComments() {
    return mediaApi.getComments(assetId)
      .then(d => setComments(d.comments || []))
      .catch(console.error);
  }

  useEffect(() => { onCommentsChange?.(comments) }, [comments]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!assetId) return;
    setLoading(true);
    loadComments().finally(() => setLoading(false));
  }, [assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime — refetch so profiles always populated
  useEffect(() => {
    if (!assetId || !supabase) return;
    const channel = supabase
      .channel(`comments-${assetId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_media_comments', filter: `media_id=eq.${assetId}` },
        () => { loadComments(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const data = await mediaApi.createComment({
        assetId,
        body: body.trim(),
        timestampSeconds: currentTime > 0 ? parseFloat(currentTime.toFixed(2)) : null,
        parentCommentId: replyTo || null,
      });
      setComments(cs => [...cs, data.comment]);
      setBody(""); setReplyTo(null);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      console.error(err);
      setSubmitError("Failed to post. Please try again.");
    } finally { setSubmitting(false); }
  }

  // Optimistic toggle — instant like a like button
  async function toggleResolve(comment) {
    const next = !comment.resolved;
    setComments(cs => cs.map(c => c.id === comment.id ? { ...c, resolved: next } : c));
    await mediaApi.updateComment(comment.id, { resolved: next }).catch(() => {
      setComments(cs => cs.map(c => c.id === comment.id ? { ...c, resolved: comment.resolved } : c));
    });
  }

  async function deleteComment(comment) {
    setComments(cs => cs.filter(c => c.id !== comment.id && c.parent_comment_id !== comment.id));
    await mediaApi.deleteComment(comment.id).catch(() => loadComments());
  }

  const topLevel   = comments.filter(c => !c.parent_comment_id);
  const childrenOf = id => comments.filter(c => c.parent_comment_id === id);

  return (
    <div className="comments-panel">
      {loading ? (
        <div className="empty-state" style={{ padding: "24px 0" }}><span className="spinner" /></div>
      ) : (
        <>
          <div className="comments-list">
            {topLevel.length === 0 ? (
              <p className="comments-empty">No comments yet.</p>
            ) : (
              topLevel.map(c => (
                <CommentThread
                  key={c.id}
                  comment={c}
                  children={childrenOf(c.id)}
                  onReply={() => setReplyTo(c.id)}
                  onResolve={() => toggleResolve(c)}
                  onDelete={deleteComment}
                  onSeek={onSeek}
                  currentUserId={user?.id}
                  isAssetOwner={isAssetOwner}
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Compose */}
          <form className="comment-compose" onSubmit={submit}>
            {submitError && (
              <div style={{ color: '#f87171', fontSize: 11, padding: '2px 0' }}>{submitError}</div>
            )}
            {currentTime > 0 && (
              <div className="comment-timestamp-hint">
                <Clock size={11} /> At {fmtDur(currentTime)}
              </div>
            )}
            {replyTo && (
              <div className="comment-reply-banner">
                Replying to thread &nbsp;
                <button type="button" onClick={() => setReplyTo(null)} className="comment-reply-cancel">✕ Cancel</button>
              </div>
            )}
            <div className="comment-compose-row">
              <input
                className="form-input"
                placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
                value={body}
                onChange={e => setBody(e.target.value)}
                disabled={submitting}
              />
              <button type="submit" className="btn-primary-sm comment-send" disabled={submitting || !body.trim()}>
                <PaperPlaneTilt size={14} weight="fill" />
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function CommentThread({ comment, children, onReply, onResolve, onDelete, onSeek, currentUserId, isAssetOwner }) {
  return (
    <div className={`comment-thread ${comment.resolved ? "resolved" : ""}`}>
      <CommentItem
        comment={comment}
        onReply={onReply}
        onResolve={onResolve}
        onDelete={onDelete}
        onSeek={onSeek}
        canResolve={isAssetOwner || currentUserId === comment.user_id}
        canDelete={isAssetOwner || currentUserId === comment.user_id}
      />
      {children.map(child => (
        <div key={child.id} className="comment-reply">
          <ArrowBendDownRight size={11} className="comment-reply-icon" />
          <CommentItem
            comment={child}
            onDelete={onDelete}
            onSeek={onSeek}
            canDelete={isAssetOwner || currentUserId === child.user_id}
          />
        </div>
      ))}
    </div>
  );
}

function CommentItem({ comment, onReply, onResolve, onDelete, onSeek, canResolve, canDelete }) {
  const name  = comment.profiles?.full_name || comment.profiles?.email || comment.guest_name || "Guest";
  const color = avatarColor(name);
  const [hovering, setHovering] = useState(false);

  return (
    <div
      className="comment-item"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="comment-meta">
        <div className="comment-avatar" style={{ background: color }}>{name.charAt(0).toUpperCase()}</div>
        <span className="comment-author">{name}</span>
        {comment.timestamp_seconds != null && (
          <button className="comment-ts" onClick={() => onSeek?.(comment.timestamp_seconds)}>
            {fmtDur(comment.timestamp_seconds)}
          </button>
        )}
        <span className="comment-age">{timeAgo(comment.created_at)}</span>
        {canDelete && onDelete && hovering && (
          <button className="comment-action comment-delete" onClick={() => onDelete(comment)} title="Delete">
            <Trash size={11} />
          </button>
        )}
      </div>

      <p className="comment-body">{comment.body}</p>

      <div className="comment-actions">
        {onReply && (
          <button className="comment-action" onClick={onReply}>Reply</button>
        )}
        {onResolve && canResolve && (
          <button
            className={`comment-action comment-resolve${comment.resolved ? " resolved" : ""}`}
            onClick={onResolve}
          >
            <CheckCircle size={11} weight={comment.resolved ? "fill" : "regular"} />
            {comment.resolved ? "Resolved" : "Resolve"}
          </button>
        )}
      </div>
    </div>
  );
}

function fmtDur(s) {
  if (s == null) return "";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
