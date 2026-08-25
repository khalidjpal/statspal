import { IconMinus, IconPencil, IconPlus } from '../Icons';

// Shared pieces of the dashboard's iOS-style edit mode, so the roster, calendar
// and schedule panels all get the same badges and the same delete guard rather
// than three near-copies.
//
// The wiggle itself is pure CSS: a panel puts `.dash-edit-item` on each editable
// element and the stylesheet animates it only while the dashboard carries
// `.dash-editing`. Nothing here runs when edit mode is off — the panels render
// their normal markup and skip these components entirely.

// The corner "remove" badge. It stops the click from reaching the row
// underneath, which in edit mode is tap-to-edit.
//
// `nested` matters: a <button> may not contain another <button>, and two of the
// three panels hang this badge inside a row that IS a button (a calendar bar, a
// tournament row). Those pass nested and get a span carrying role="button" —
// legal in a button's content model, and it behaves the same on click. Where the
// row is not a button (a roster <li>, a schedule <div>) it stays a real button
// and keeps its keyboard focus.
export function DeleteBadge({ onDelete, label, variant = 'minus', nested = false }) {
  const icon = variant === 'minus' ? <IconMinus size={12} /> : <IconPlus size={12} />;
  const fire = e => { e.stopPropagation(); e.preventDefault(); onDelete(); };

  if (nested) {
    return (
      <span
        role="button"
        className="dash-edit-badge dash-edit-badge-del"
        onClick={fire}
        onMouseDown={e => e.stopPropagation()}
        aria-label={label}
        title={label}
      >
        {icon}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="dash-edit-badge dash-edit-badge-del"
      onClick={fire}
      onMouseDown={e => e.stopPropagation()}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

// The "this is editable" hint. Decorative: the row itself carries the click, so
// this must not be a focus stop or a second tap target competing with it.
export function EditHint({ className = '' }) {
  return (
    <span className={`dash-edit-badge dash-edit-badge-edit ${className}`.trim()} aria-hidden="true">
      <IconPencil size={11} />
    </span>
  );
}

// Light confirm for a destructive tap. Deliberately a real dialog rather than
// window.confirm: edit mode is a tapping surface, and the whole point is that a
// stray tap on a delete badge can't take a player or a game with it.
//
// `detail` is where a panel spells out anything that goes WITH the item — a
// game's stats, a player's history — so the confirm is specific, not generic.
export function ConfirmDelete({ open, title, detail, busy, confirmLabel = 'Delete', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={() => !busy && onCancel()}>
      <div
        className="modal-content dash-edit-confirm"
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <h2>{title}</h2>
        {detail && <p className="dash-edit-confirm-detail">{detail}</p>}
        <div className="dash-edit-confirm-actions">
          <button
            type="button"
            className="dash-edit-confirm-danger"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? 'Removing…' : confirmLabel}
          </button>
          <button
            type="button"
            className="dash-edit-confirm-keep"
            onClick={onCancel}
            disabled={busy}
          >
            Keep it
          </button>
        </div>
      </div>
    </div>
  );
}

// The inline "add one more" affordance that closes each editable list.
export function AddInline({ onClick, label }) {
  return (
    <button type="button" className="dash-edit-add" onClick={onClick}>
      <span className="dash-edit-add-icon"><IconPlus size={12} /></span>
      {label}
    </button>
  );
}
