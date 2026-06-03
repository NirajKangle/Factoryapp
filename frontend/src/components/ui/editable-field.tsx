import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface EditableFieldProps {
  label: string;
  value: string;
  onSave?: (value: string) => Promise<void>;
  multiline?: boolean;
  readOnly?: boolean;
  showLabel?: boolean;
  className?: string;
}

export function EditableField({
  label,
  value,
  onSave,
  multiline = false,
  readOnly = false,
  showLabel = true,
  className,
}: EditableFieldProps) {
  const labelPrefix = showLabel ? (
    <span className="text-muted-foreground">{label}: </span>
  ) : null;
  const isEditable = !readOnly && onSave != null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    if (!onSave) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      setDraft(value);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!isEditable) {
    return (
      <div className={cn("text-sm", className)}>
        {labelPrefix}
        <span className="font-medium text-foreground">{value}</span>
      </div>
    );
  }

  const inputClassName =
    "w-full rounded border border-input bg-background px-2 py-1 text-sm text-foreground";

  const eventHandlers = {
    value: draft,
    disabled: saving,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: () => void commit(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
      if (!multiline && e.key === "Enter") {
        e.preventDefault();
        void commit();
      }
    },
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    className: inputClassName,
  };

  if (editing) {
    return (
      <div className={cn("text-sm", className)} onDoubleClick={(e) => e.stopPropagation()}>
        {labelPrefix}
        {multiline ? (
          <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} rows={3} {...eventHandlers} />
        ) : (
          <input type="text" ref={inputRef as React.RefObject<HTMLInputElement>} {...eventHandlers} />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("cursor-text text-sm", className)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isEditable) setEditing(true);
      }}
      title="Double-click to edit"
    >
      {labelPrefix}
      <span className="font-medium text-foreground">{value || "—"}</span>
    </div>
  );
}
