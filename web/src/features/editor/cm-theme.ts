import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Tek tondan koyu editör yüzeyi, kabukla aynı zemin — ayrı bir beyaz kutu
// değil (VSCode klonu yönü terk edildi, §11.5 güncellemesi).
export const cmTheme = EditorView.theme({
  "&": {
    color: "var(--vsc-editor-fg)",
    backgroundColor: "var(--vsc-editor-bg)",
    height: "100%",
    fontSize: "13px",
  },
  ".cm-content": {
    fontFamily: "var(--font-code)",
    caretColor: "var(--vsc-accent)",
    padding: "12px 0",
  },
  ".cm-line": {
    padding: "0 16px",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--vsc-accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(61, 59, 255, 0.35)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--vsc-editor-bg)",
    color: "var(--vsc-fg-muted)",
    border: "none",
    paddingRight: "4px",
  },
  ".cm-gutter.cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 12px",
  },
  ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    color: "var(--vsc-fg-active)",
  },
  ".cm-matchingBracket, .cm-nonmatchingBracket": {
    outline: "1px solid var(--vsc-fg-muted)",
    backgroundColor: "transparent",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--vsc-selected)",
    border: "1px solid var(--vsc-border)",
    fontFamily: "var(--font-ui)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--vsc-accent)",
    color: "#ffffff",
  },
});

export const cmSyntaxHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: "var(--vsc-syn-keyword)" },
    { tag: [tags.string, tags.character], color: "var(--vsc-syn-string)" },
    { tag: [tags.number, tags.bool, tags.null], color: "var(--vsc-syn-number)" },
    { tag: [tags.typeName, tags.className], color: "var(--vsc-syn-type)" },
    { tag: [tags.lineComment, tags.blockComment], color: "var(--vsc-syn-comment)", fontStyle: "italic" },
    { tag: [tags.operator, tags.punctuation, tags.bracket], color: "var(--vsc-editor-fg)" },
    { tag: tags.function(tags.variableName), color: "var(--vsc-syn-function)" },
  ]),
);
