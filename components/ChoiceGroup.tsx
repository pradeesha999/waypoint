"use client";

/**
 * ChoiceGroup — the single "pick one" control for the whole app.
 *
 * Every questionnaire used to hand-roll its own stack of <button> elements. That
 * meant eleven near-identical blocks of markup, and none of them told assistive
 * technology that the buttons were a set of mutually exclusive answers: a screen
 * reader announced eleven separate buttons with no indication of which was
 * chosen or how many there were.
 *
 * This renders the WAI-ARIA radiogroup pattern properly:
 *   - the wrapper is role="radiogroup" with an accessible name (the question),
 *   - each option is role="radio" with aria-checked,
 *   - roving tabindex: exactly one option is in the tab order, so Tab moves past
 *     the whole group rather than through every answer,
 *   - arrow keys move focus, Home/End jump to the ends, Space/Enter answers.
 *
 * Arrow keys deliberately do NOT select. The APG default for a radiogroup is
 * selection-follows-focus, but this app advances to the next question as soon as
 * an answer is chosen — so with that default a keyboard user pressing Down to
 * read the options would answer the question and be moved on before they had
 * seen them. Focus-only navigation is the variant the pattern allows for exactly
 * this case.
 *
 * Visual variants map to the three existing shapes in globals.css. Nothing about
 * the instrument changes — same items, same options, same scoring. Only how the
 * control is delivered.
 */

import { ReactNode, useEffect, useRef, useState } from "react";

export type ChoiceVariant = "list" | "chips" | "days";

export interface ChoiceOption {
  /** The value handed back to onChange — an option index, a day count, minutes… */
  value: number;
  label: ReactNode;
}

const WRAPPER_CLASS: Record<ChoiceVariant, string> = {
  list: "optlist",
  chips: "chips",
  days: "daygrid",
};

const OPTION_CLASS: Record<ChoiceVariant, string> = {
  list: "optbtn",
  chips: "chip",
  days: "daybtn",
};

export default function ChoiceGroup({
  label,
  options,
  value,
  onChange,
  variant = "list",
}: {
  /** Accessible name for the group — pass the question text. */
  label: string;
  options: ChoiceOption[];
  value: number | null;
  onChange: (value: number) => void;
  variant?: ChoiceVariant;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  // A new question reuses this component with a different option set. Without
  // this, the tab stop (and the keyboard user's focus) would stay on whatever
  // index they had arrowed to on the previous question — landing them in the
  // middle of a list they haven't read yet.
  useEffect(() => {
    setFocusIndex(null);
    const inside = refs.current.some((el) => el && el === document.activeElement);
    if (inside) refs.current[0]?.focus();
  }, [label]);

  const selectedIndex = options.findIndex((o) => o.value === value);
  // Roving tabindex: the tab stop is wherever the user last arrowed to, else the
  // chosen option, else the first. Never zero tab stops, never more than one.
  const tabStop = focusIndex ?? (selectedIndex === -1 ? 0 : selectedIndex);
  const tabIndexOf = (i: number) => (i === tabStop ? 0 : -1);

  function move(from: number, delta: number) {
    const to = (from + delta + options.length) % options.length;
    setFocusIndex(to);
    refs.current[to]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    // `e.code` is the fallback: some input stacks report a spacebar press with an
    // empty `e.key`, which would otherwise fall through and do nothing.
    const key = e.key === " " || e.code === "Space" ? " " : e.key;
    switch (key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(i, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(i, -1);
        break;
      case "Home":
        e.preventDefault();
        move(i, -i);
        break;
      case "End":
        e.preventDefault();
        move(i, options.length - 1 - i);
        break;
      case " ":
      case "Enter":
        // Handled explicitly rather than left to the button's native activation.
        // preventDefault also suppresses the synthesized click, so onChange fires
        // exactly once — which matters because choosing an answer advances the
        // flow, and a double fire would skip a question.
        e.preventDefault();
        setFocusIndex(i);
        onChange(options[i].value);
        break;
    }
  }

  return (
    <div className={WRAPPER_CLASS[variant]} role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabIndexOf(i)}
            className={`${OPTION_CLASS[variant]} ${checked ? "selected" : ""}`}
            onClick={() => {
              setFocusIndex(i);
              onChange(o.value);
            }}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {variant === "list" ? <span>{o.label}</span> : o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Convenience for the common case: a list of option labels scored by index. */
export function indexOptions(labels: readonly string[]): ChoiceOption[] {
  return labels.map((label, value) => ({ value, label }));
}
