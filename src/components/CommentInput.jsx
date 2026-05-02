import { useState } from 'react';
import './CommentInput.css';

export function CommentInput({ onSubmit }) {
  const [author, setAuthor] = useState('worker');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(author, content.trim());
      setContent('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="comment-input-form" onSubmit={handleSubmit}>
      <div className="author-selector">
        {['worker', 'planner'].map(a => (
          <label key={a} className={`author-option${author === a ? ' selected' : ''} author-${a}`}>
            <input type="radio" name="author" value={a} checked={author === a} onChange={() => setAuthor(a)} />
            {a.charAt(0).toUpperCase() + a.slice(1)}
          </label>
        ))}
      </div>
      <textarea
        className="comment-textarea"
        placeholder="Add a comment…"
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={2}
      />
      <button className="btn-post" type="submit" disabled={submitting || !content.trim()}>
        {submitting ? 'Posting…' : 'Post Comment'}
      </button>
    </form>
  );
}
