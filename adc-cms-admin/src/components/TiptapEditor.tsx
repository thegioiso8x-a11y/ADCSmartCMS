'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Youtube from '@tiptap/extension-youtube';
import CharacterCount from '@tiptap/extension-character-count';
import { FontFamily } from '@tiptap/extension-font-family';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import {
  Button, Tooltip, Dropdown, Divider, Space, Modal, Input, ColorPicker,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, StrikethroughOutlined,
  UndoOutlined, RedoOutlined, UnorderedListOutlined, OrderedListOutlined,
  AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined,
  LinkOutlined, PictureOutlined, YoutubeOutlined, ClearOutlined,
  FontColorsOutlined, HighlightOutlined, BlockOutlined, MenuOutlined,
  TableOutlined, CodeOutlined, FileTextOutlined, PaperClipOutlined,
  AppstoreAddOutlined, EyeOutlined,
} from '@ant-design/icons';
import MediaPickerModal from '@/components/MediaPickerModal';

/**
 * TiptapEditor
 * ------------
 * Rich text editor dùng Tiptap + Ant Design toolbar.
 *  - Props: value (HTML), onChange (callback), disabled.
 *  - Toolbar 5 nhóm: định dạng, cấu trúc, media, HTML/code, content blocks.
 *  - Nút active đổi màu nền (dùng editor.isActive(...)).
 *  - Hiển thị số từ ở góc dưới phải.
 */
export interface TiptapEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Class cho nút toolbar đang active. */
const ACTIVE_CLASS = '!bg-blue-100 !text-blue-600 !border-blue-300';

/** Class chung cho nút toolbar. */
const BTN_CLASS = 'rounded-md';

/** Danh sách font chữ cho dropdown. */
const FONT_OPTIONS = ['Inter', 'Arial', 'Times New Roman', 'Roboto'];

/** Modal nhập URL dùng chung cho Link/Image/Youtube/File. */
interface UrlModalState {
  open: boolean;
  title: string;
  placeholder: string;
  value: string;
  onSubmit: (url: string) => void;
}

export default function TiptapEditor({ value, onChange, disabled = false }: TiptapEditorProps) {
  const [urlModal, setUrlModal] = useState<UrlModalState>({
    open: false,
    title: '',
    placeholder: '',
    value: '',
    onSubmit: () => {},
  });

  // Modal xem HTML nguồn.
  const [htmlModalOpen, setHtmlModalOpen] = useState(false);
  const [htmlSource, setHtmlSource] = useState('');

  // Media picker (chọn ảnh/video từ thư viện).
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [mediaPickerType, setMediaPickerType] = useState<'image' | 'video'>('image');

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      // Tiptap v3: StarterKit đã bao gồm link + underline + codeBlock -> tắt để tránh trùng extension,
      // rồi thêm Link/Underline/CodeBlock riêng bên dưới với cấu hình tùy chỉnh.
      StarterKit.configure({ link: false, underline: false, codeBlock: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Color,
      TextStyle,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Youtube.configure({ controls: true, nocookie: true }),
      CharacterCount,
      CodeBlock,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value ?? '',
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[240px] px-4 py-3',
      },
    },
  });

  // Đồng bộ khi prop value thay đổi từ bên ngoài (ví dụ load dữ liệu sửa).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== undefined && value !== current) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  // Cập nhật editable khi disabled thay đổi.
  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  /** Mở modal nhập URL. */
  const openUrlModal = useCallback(
    (title: string, placeholderText: string, initial: string, onSubmit: (url: string) => void) => {
      setUrlModal({ open: true, title, placeholder: placeholderText, value: initial, onSubmit });
    },
    []
  );

  /** Xác nhận modal URL. */
  const handleUrlSubmit = () => {
    const url = urlModal.value.trim();
    if (url) urlModal.onSubmit(url);
    setUrlModal((s) => ({ ...s, open: false, value: '' }));
  };

  /** Mở modal xem HTML nguồn. */
  const openHtmlModal = () => {
    if (!editor) return;
    setHtmlSource(editor.getHTML());
    setHtmlModalOpen(true);
  };

  if (!editor) {
    return <div className="text-slate-400 text-sm p-4">Đang khởi tạo editor...</div>;
  }

  /** Dropdown chọn Heading. */
  const headingItems: MenuProps['items'] = [
    { key: 'paragraph', label: 'Paragraph', onClick: () => editor.chain().focus().setParagraph().run() },
    { key: 'h1', label: 'Heading 1', onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { key: 'h2', label: 'Heading 2', onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: 'h3', label: 'Heading 3', onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  ];

  /** Dropdown chọn Font chữ. */
  const fontItems: MenuProps['items'] = FONT_OPTIONS.map((font) => ({
    key: font,
    label: <span style={{ fontFamily: font }}>{font}</span>,
    onClick: () => editor.chain().focus().setFontFamily(font).run(),
  }));

  /** Dropdown chèn bảng + thao tác bảng. */
  const tableItems: MenuProps['items'] = [
    {
      key: 'insert',
      label: 'Chèn bảng 3x3',
      onClick: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    { type: 'divider' },
    { key: 'addRow', label: 'Thêm dòng', onClick: () => editor.chain().focus().addRowAfter().run() },
    { key: 'addCol', label: 'Thêm cột', onClick: () => editor.chain().focus().addColumnAfter().run() },
    { key: 'merge', label: 'Gộp ô', onClick: () => editor.chain().focus().mergeCells().run() },
    { key: 'split', label: 'Tách ô', onClick: () => editor.chain().focus().splitCell().run() },
    { type: 'divider' },
    { key: 'delete', label: 'Xóa bảng', danger: true, onClick: () => editor.chain().focus().deleteTable().run() },
  ];

  /** Dropdown chèn khối mẫu (content blocks). */
  const blockItems: MenuProps['items'] = [
    {
      key: 'two-col',
      label: 'Bố cục 2 cột',
      onClick: () =>
        editor
          .chain()
          .focus()
          .insertContent(
            '<div style="display:flex; gap:20px;"><div style="flex:1;">Cột 1</div><div style="flex:1;">Cột 2</div></div>'
          )
          .run(),
    },
    {
      key: 'cta',
      label: 'Nút CTA',
      onClick: () =>
        editor
          .chain()
          .focus()
          .insertContent(
            '<a href="#" style="display:inline-block; padding:10px 20px; background:#2563eb; color:white; border-radius:8px;">Nhấn vào đây</a>'
          )
          .run(),
    },
    {
      key: 'quote',
      label: 'Khối Trích dẫn',
      onClick: () =>
        editor
          .chain()
          .focus()
          .insertContent(
            '<blockquote style="border-left:4px solid #ccc; padding-left:10px; color:#666;">Nội dung trích dẫn...</blockquote>'
          )
          .run(),
    },
  ];

  /** Nhãn hiện tại của dropdown heading. */
  const currentHeadingLabel = editor.isActive('heading', { level: 1 })
    ? 'H1'
    : editor.isActive('heading', { level: 2 })
      ? 'H2'
      : editor.isActive('heading', { level: 3 })
        ? 'H3'
        : 'Paragraph';

  const wordCount = editor.storage.characterCount?.words?.() ?? 0;
  const charCount = editor.storage.characterCount?.characters?.() ?? 0;

  return (
    <div className="rounded-lg border border-slate-300 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        {/* Nhóm 1: Định dạng văn bản */}
        <Space size={2}>
          <Tooltip title="In đậm">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive('bold') ? ACTIVE_CLASS : ''}`}
              icon={<BoldOutlined />}
              onClick={() => editor.chain().focus().toggleBold().run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="In nghiêng">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive('italic') ? ACTIVE_CLASS : ''}`}
              icon={<ItalicOutlined />}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="Gạch chân">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive('underline') ? ACTIVE_CLASS : ''}`}
              icon={<UnderlineOutlined />}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="Gạch ngang">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive('strike') ? ACTIVE_CLASS : ''}`}
              icon={<StrikethroughOutlined />}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="Màu chữ">
            <ColorPicker
              size="small"
              disabled={disabled}
              onChangeComplete={(color) => editor.chain().focus().setColor(color.toHexString()).run()}
            >
              <Button type="text" size="small" className={BTN_CLASS} icon={<FontColorsOutlined />} disabled={disabled} />
            </ColorPicker>
          </Tooltip>
          <Tooltip title="Highlight">
            <ColorPicker
              size="small"
              disabled={disabled}
              onChangeComplete={(color) =>
                editor.chain().focus().toggleHighlight({ color: color.toHexString() }).run()
              }
            >
              <Button type="text" size="small" className={BTN_CLASS} icon={<HighlightOutlined />} disabled={disabled} />
            </ColorPicker>
          </Tooltip>
          <Dropdown menu={{ items: fontItems }} disabled={disabled}>
            <Button type="text" size="small" className={BTN_CLASS} disabled={disabled}>
              Font
            </Button>
          </Dropdown>
        </Space>

        <Divider type="vertical" className="!mx-1" />

        {/* Nhóm 2: Cấu trúc nội dung */}
        <Space size={2}>
          <Tooltip title="Hoàn tác">
            <Button
              type="text"
              size="small"
              className={BTN_CLASS}
              icon={<UndoOutlined />}
              onClick={() => editor.chain().focus().undo().run()}
              disabled={disabled || !editor.can().undo()}
            />
          </Tooltip>
          <Tooltip title="Làm lại">
            <Button
              type="text"
              size="small"
              className={BTN_CLASS}
              icon={<RedoOutlined />}
              onClick={() => editor.chain().focus().redo().run()}
              disabled={disabled || !editor.can().redo()}
            />
          </Tooltip>
          <Dropdown menu={{ items: headingItems }} disabled={disabled}>
            <Button type="text" size="small" className={BTN_CLASS} disabled={disabled}>
              {currentHeadingLabel}
            </Button>
          </Dropdown>
          <Tooltip title="Danh sách chấm">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive('bulletList') ? ACTIVE_CLASS : ''}`}
              icon={<UnorderedListOutlined />}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="Danh sách số">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive('orderedList') ? ACTIVE_CLASS : ''}`}
              icon={<OrderedListOutlined />}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="Trích dẫn">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive('blockquote') ? ACTIVE_CLASS : ''}`}
              icon={<BlockOutlined />}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="Căn trái">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive({ textAlign: 'left' }) ? ACTIVE_CLASS : ''}`}
              icon={<AlignLeftOutlined />}
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="Căn giữa">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive({ textAlign: 'center' }) ? ACTIVE_CLASS : ''}`}
              icon={<AlignCenterOutlined />}
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="Căn phải">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive({ textAlign: 'right' }) ? ACTIVE_CLASS : ''}`}
              icon={<AlignRightOutlined />}
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="Căn đều">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive({ textAlign: 'justify' }) ? ACTIVE_CLASS : ''}`}
              icon={<MenuOutlined />}
              onClick={() => editor.chain().focus().setTextAlign('justify').run()}
              disabled={disabled}
            />
          </Tooltip>
          <Dropdown menu={{ items: tableItems }} disabled={disabled}>
            <Button type="text" size="small" className={BTN_CLASS} icon={<TableOutlined />} disabled={disabled} />
          </Dropdown>
        </Space>

        <Divider type="vertical" className="!mx-1" />

        {/* Nhóm 3: Media */}
        <Space size={2}>
          <Tooltip title="Chèn Link">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive('link') ? ACTIVE_CLASS : ''}`}
              icon={<LinkOutlined />}
              disabled={disabled}
              onClick={() =>
                openUrlModal('Chèn liên kết', 'https://example.com', editor.getAttributes('link').href ?? '', (url) =>
                  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
                )
              }
            />
          </Tooltip>
          <Tooltip title="Chèn Ảnh (từ thư viện)">
            <Button
              type="text"
              size="small"
              className={BTN_CLASS}
              icon={<PictureOutlined />}
              disabled={disabled}
              onClick={() => {
                setMediaPickerType('image');
                setIsMediaPickerOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Chèn Video (từ thư viện)">
            <Button
              type="text"
              size="small"
              className={BTN_CLASS}
              icon={<YoutubeOutlined />}
              disabled={disabled}
              onClick={() => {
                setMediaPickerType('video');
                setIsMediaPickerOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Chèn File đính kèm">
            <Button
              type="text"
              size="small"
              className={BTN_CLASS}
              icon={<PaperClipOutlined />}
              disabled={disabled}
              onClick={() =>
                openUrlModal('Chèn file đính kèm', 'https://example.com/file.pdf', '', (url) =>
                  editor
                    .chain()
                    .focus()
                    .insertContent(`<a href="${url}" target="_blank" rel="noopener">${url}</a>`)
                    .run()
                )
              }
            />
          </Tooltip>
        </Space>

        <Divider type="vertical" className="!mx-1" />

        {/* Nhóm 4: HTML / Code */}
        <Space size={2}>
          <Tooltip title="Code Block">
            <Button
              type="text"
              size="small"
              className={`${BTN_CLASS} ${editor.isActive('codeBlock') ? ACTIVE_CLASS : ''}`}
              icon={<CodeOutlined />}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title="Xem HTML">
            <Button
              type="text"
              size="small"
              className={BTN_CLASS}
              icon={<EyeOutlined />}
              onClick={openHtmlModal}
              disabled={disabled}
            />
          </Tooltip>
        </Space>

        <Divider type="vertical" className="!mx-1" />

        {/* Nhóm 5: Content Blocks + Clear format */}
        <Space size={2}>
          <Dropdown menu={{ items: blockItems }} disabled={disabled}>
            <Button type="text" size="small" className={BTN_CLASS} icon={<AppstoreAddOutlined />} disabled={disabled}>
              Khối mẫu
            </Button>
          </Dropdown>
          <Tooltip title="Xóa định dạng">
            <Button
              type="text"
              size="small"
              className={BTN_CLASS}
              icon={<ClearOutlined />}
              onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
              disabled={disabled}
            />
          </Tooltip>
        </Space>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Word count */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-400">
        <span>{wordCount} từ</span>
        <span>{charCount} ký tự</span>
      </div>

      {/* Modal nhập URL */}
      <Modal
        title={urlModal.title}
        open={urlModal.open}
        onCancel={() => setUrlModal((s) => ({ ...s, open: false, value: '' }))}
        onOk={handleUrlSubmit}
        okText="Chèn"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Input
          placeholder={urlModal.placeholder}
          value={urlModal.value}
          onChange={(e) => setUrlModal((s) => ({ ...s, value: e.target.value }))}
          onPressEnter={handleUrlSubmit}
          className="rounded-lg"
          autoFocus
        />
      </Modal>

      {/* Media picker: chọn ảnh/video từ thư viện */}
      <MediaPickerModal
        open={isMediaPickerOpen}
        onCancel={() => setIsMediaPickerOpen(false)}
        mediaType={mediaPickerType}
        onSelect={(url) => {
          if (mediaPickerType === 'image') {
            editor.chain().focus().setImage({ src: url }).run();
          } else {
            // Video từ thư viện (file mp4/webm) -> chèn thẻ <video>.
            editor
              .chain()
              .focus()
              .insertContent(
                `<video src="${url}" controls style="max-width:100%; border-radius:8px;"></video>`
              )
              .run();
          }
          setIsMediaPickerOpen(false);
        }}
      />

      {/* Modal xem HTML nguồn */}
      <Modal
        title={<span className="font-semibold flex items-center gap-2"><FileTextOutlined /> Mã HTML nguồn</span>}
        open={htmlModalOpen}
        onCancel={() => setHtmlModalOpen(false)}
        footer={
          <Button type="primary" onClick={() => setHtmlModalOpen(false)} className="rounded-lg">
            Đóng
          </Button>
        }
        width={720}
        destroyOnHidden
      >
        <Input.TextArea
          value={htmlSource}
          readOnly
          rows={16}
          className="font-mono text-xs rounded-lg"
        />
      </Modal>
    </div>
  );
}
