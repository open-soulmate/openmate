'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState, StateField, Compartment } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, LanguageDescription, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import type { Extension } from '@codemirror/state';

// No placeholder extension needed — React overlay handles it

// Code languages for markdown code blocks
const codeLanguages = [
  LanguageDescription.of({ name: 'javascript', load: () => import('@codemirror/lang-javascript').then(m => m.javascript()) }),
  LanguageDescription.of({ name: 'typescript', load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })) }),
  LanguageDescription.of({ name: 'python', load: () => import('@codemirror/lang-python').then(m => m.python()) }),
  LanguageDescription.of({ name: 'html', load: () => import('@codemirror/lang-html').then(m => m.html()) }),
  LanguageDescription.of({ name: 'css', load: () => import('@codemirror/lang-css').then(m => m.css()) }),
  LanguageDescription.of({ name: 'json', load: () => import('@codemirror/lang-json').then(m => m.json()) }),
  LanguageDescription.of({ name: 'sql', load: () => import('@codemirror/lang-sql').then(m => m.sql()) }),
  LanguageDescription.of({ name: 'yaml', load: () => import('@codemirror/lang-yaml').then(m => m.yaml()) }),
  LanguageDescription.of({ name: 'xml', load: () => import('@codemirror/lang-xml').then(m => m.xml()) }),
];

// Markdown language (module-level, created once)
const markdownLang = markdown({ base: markdownLanguage, codeLanguages });

// Syntax highlight colors via CSS variables
const openmateHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: 'hsl(var(--primary))' },
  { tag: tags.operator, color: 'hsl(var(--muted-foreground))' },
  { tag: tags.special(tags.variableName), color: 'hsl(300 60% 70%)' },
  { tag: tags.typeName, color: 'hsl(var(--primary) / 0.8)' },
  { tag: tags.atom, color: 'hsl(25 80% 65%)' },
  { tag: tags.number, color: 'hsl(25 80% 65%)' },
  { tag: tags.definition(tags.variableName), color: 'hsl(var(--primary))' },
  { tag: tags.string, color: 'hsl(150 60% 60%)' },
  { tag: tags.special(tags.string), color: 'hsl(280 60% 65%)' },
  { tag: tags.comment, color: 'hsl(var(--muted-foreground) / 0.6)', fontStyle: 'italic' },
  { tag: tags.variableName, color: 'hsl(var(--foreground))' },
  { tag: tags.tagName, color: 'hsl(var(--primary))' },
  { tag: tags.bracket, color: 'hsl(var(--muted-foreground))' },
  { tag: tags.meta, color: 'hsl(var(--muted-foreground))' },
  { tag: tags.link, color: 'hsl(var(--primary))', textDecoration: 'underline' },
  { tag: tags.heading, color: 'hsl(var(--primary))', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
]));

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent, view: EditorView) => boolean;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

export function CodeMirrorEditor({
  value,
  onChange,
  onKeyDown,
  placeholder = '',
  readOnly = false,
  className = '',
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onKeyDownRef = useRef(onKeyDown);

  onChangeRef.current = onChange;
  onKeyDownRef.current = onKeyDown;

  const theme = useMemo(() => EditorView.theme({
    '&': {
      height: 'auto',
      fontSize: '14px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      padding: '0 14px 0 0',
      overflow: 'auto',
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      lineHeight: '1.6',
    },
    '.cm-editor': { height: '100%', padding: 0 },
    '.cm-content': {
      color: 'hsl(var(--foreground))',
      caretColor: 'hsl(var(--foreground))',
      position: 'relative',
    },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'hsl(var(--foreground))' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      border: 'none',
      padding: '0 2px !important',
      color: 'hsl(var(--muted-foreground) / 0.5) !important',
    },
    '.cm-gutterElement': {
      padding: '0 4px 0 0 !important',
      lineHeight: '1.6 !important',
      fontSize: '14px !important',
    },
    '.cm-line': {
      padding: '0',
      margin: 0,
      lineHeight: '1.6 !important',
      fontSize: '14px !important',
    },
    '.cm-activeLineGutter': { backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--foreground))' },
    '.cm-activeLine': { backgroundColor: 'hsl(var(--accent) / 0.3)' },
    '.cm-selectionBackground, ::selection': { backgroundColor: 'hsl(var(--primary) / 0.25) !important' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'hsl(var(--primary) / 0.3) !important' },
    '.cm-matchingBracket': { backgroundColor: 'hsl(var(--primary) / 0.2)', outline: '1px solid hsl(var(--primary) / 0.4)' },
    '.cm-foldGutter': { display: 'none !important' },
    '.cm-tooltip': { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' },
    '.cm-tooltip-autocomplete': { '& > ul > li[aria-selected]': { backgroundColor: 'hsl(var(--accent))' } },
    '.cm-panels': { backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))' },
    '.cm-panel': { display: 'none !important' },
    '.cm-searchMatch': { backgroundColor: 'hsl(var(--primary) / 0.2)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'hsl(var(--primary) / 0.35)' },
  }), []);

  const extensions = useMemo(() => {
    const exts: Extension[] = [
      lineNumbers(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      openmateHighlight,
      markdownLang,
      theme,

      EditorView.lineWrapping,
      keymap.of([
        { key: 'Tab', run: (view) => {
          view.dispatch(view.state.replaceSelection('  '));
          return true;
        }},
      ]),
    ];
    if (readOnly) {
      exts.push(EditorState.readOnly.of(true));
    }
    return exts;
  }, [placeholder, readOnly, theme]);

  const handleKeyDown = useCallback((e: KeyboardEvent, view: EditorView) => {
    if (onKeyDownRef.current) {
      return onKeyDownRef.current(e, view);
    }
    return false;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        ...extensions,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({ keydown: handleKeyDown }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [extensions, handleKeyDown]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  const focus = useCallback(() => {
    viewRef.current?.focus();
  }, []);

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
      onClick={focus}
    >
      <div
        ref={containerRef}
        className={`codemirror-editor ${className}`}
      />
      {value.length === 0 && placeholder && (
        <div style={{
          position: 'absolute',
          top: '4px',
          left: '24px',
          color: 'hsl(var(--muted-foreground) / 0.4)',
          fontStyle: 'italic',
          pointerEvents: 'none',
          fontSize: '14px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
        }}>
          {placeholder}
        </div>
      )}
    </div>
  );
}
