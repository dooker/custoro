import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { FieldIF } from '../../../types/form';
import Link from '@tiptap/extension-link';
import styles from './Rte.module.sass';
import { useEffect, useState } from 'react';

const Rte = ({ name, value, onChange }: FieldIF) => {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                link: false, // disable built‑in link behavior
            }),
            Link.configure({
                openOnClick: false,
                autolink: false,
                linkOnPaste: false,
            }),
        ],
        content: value || '',
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            onChange?.({ name, value: html });
        },
    });
    const [activeMarks, setActiveMarks] = useState({
        bold: false,
        italic: false,
        strike: false,
        link: false,
        bulletList: false,
        orderedList: false,
    });

    useEffect(() => {
        if (!editor) return;

        const updateToolbar = () => {
            const { from, to, empty } = editor.state.selection;

            const isLink =
                editor.isActive('link') ||
                (!empty && editor.state.doc.rangeHasMark(from, to, editor.schema.marks.link));

            setActiveMarks({
                bold: editor.isActive('bold'),
                italic: editor.isActive('italic'),
                strike: editor.isActive('strike'),
                bulletList: editor.isActive('bulletList'),
                orderedList: editor.isActive('orderedList'),
                link: isLink,
            });
        };

        editor.on('selectionUpdate', updateToolbar);
        editor.on('transaction', updateToolbar);

        updateToolbar(); // initial

        return () => {
            editor.off('selectionUpdate', updateToolbar);
            editor.off('transaction', updateToolbar);
        };
    }, [editor]);

    const setLink = () => {
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('Enter URL', previousUrl || '');

        if (url === null) return; // user cancelled

        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }

        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    if (!editor) return null;

    return (
        <div className="textarea">
            <div className={styles.toolbar}>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={activeMarks.bold ? styles.active : ''}
                >
                    Bold
                </button>

                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={activeMarks.italic ? styles.active : ''}
                >
                    Italic
                </button>

                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    className={activeMarks.strike ? styles.active : ''}
                >
                    Strike
                </button>

                <button
                    type="button"
                    onClick={setLink}
                    className={activeMarks.link ? styles.active : ''}
                >
                    Link
                </button>

                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={activeMarks.bulletList ? styles.active : ''}
                >
                    • List
                </button>

                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={activeMarks.orderedList ? styles.active : ''}
                >
                    1. List
                </button>
            </div>

            <EditorContent editor={editor} className={styles.tiptap} />
        </div>
    );
};

export default Rte;
