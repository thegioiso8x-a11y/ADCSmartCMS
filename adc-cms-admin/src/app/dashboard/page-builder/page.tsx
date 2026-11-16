'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card, Button, Space, Typography, Tag, Empty, Drawer, Input, Alert, Tooltip, Select, App, Spin,
} from 'antd';
import {
  BuildOutlined, DeleteOutlined, EyeOutlined, EyeInvisibleOutlined, SaveOutlined,
  HolderOutlined, PlusOutlined, AppstoreOutlined, PictureOutlined, FontSizeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { ContentType, FilteredEntry, FilterEntriesResponse } from '@/lib/types';

const { Title, Text } = Typography;

// ============================================================================
// Types
// ============================================================================

/** Định nghĩa 1 loại khối giao diện có sẵn trong thư viện. */
interface BlockDefinition {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** Dữ liệu mặc định khi thả vào canvas. */
  defaultData: Record<string, unknown>;
}

/** 1 khối trên canvas. `id` = GUID thật từ DB nếu đã lưu, hoặc ID tạm nếu mới thêm. */
interface CanvasBlock {
  id: string;
  type: string;
  label: string;
  isVisible: boolean;
  data: Record<string, unknown>;
  /** true = khối mới thêm, chưa có trong DB. */
  isNew: boolean;
}

/** GET /api/entries/{entryId}/blocks -> EntryBlockDto */
interface EntryBlockDto {
  id: string;
  entryId: string;
  locale: string;
  zoneKey: string;
  componentTypeId: string;
  blockData: string;
  sortOrder: number;
  isVisible: boolean;
}

// ============================================================================
// Mock Data — Thư viện khối giao diện
// ============================================================================

const BLOCK_LIBRARY: BlockDefinition[] = [
  {
    type: 'hero_banner',
    label: 'Hero Banner',
    description: 'Khối banner lớn đầu trang với tiêu đề, mô tả và nút CTA.',
    icon: <AppstoreOutlined />,
    defaultData: {
      title: 'Chào mừng đến với ADC Smart CMS',
      subtitle: 'Nền tảng quản trị nội dung tự động',
      buttonText: 'Khám phá ngay',
      buttonUrl: '/',
      backgroundImage: '',
    },
  },
  {
    type: 'text_block',
    label: 'Text Block',
    description: 'Khối văn bản tự do, hỗ trợ tiêu đề và nội dung.',
    icon: <FontSizeOutlined />,
    defaultData: {
      heading: 'Tiêu đề khối văn bản',
      content: 'Nội dung văn bản mô tả...',
      align: 'left',
    },
  },
  {
    type: 'image_gallery',
    label: 'Image Gallery',
    description: 'Thư viện ảnh dạng lưới, hỗ trợ nhiều cột.',
    icon: <PictureOutlined />,
    defaultData: {
      images: [],
      columns: 3,
      gap: 16,
    },
  },
];

/** Prefix cho ID khối kéo từ thư viện (phân biệt với khối đã có trên canvas). */
const LIBRARY_PREFIX = 'lib:';
/** ID vùng droppable của canvas. */
const CANVAS_DROPPABLE_ID = 'canvas-drop-zone';
/** Locale mặc định khi load/lưu blocks. */
const DEFAULT_LOCALE = 'vi';

// ============================================================================
// Helpers
// ============================================================================

/** Chuẩn hóa response danh sách content type về ContentType[] an toàn. */
function toContentTypeArray(data: unknown): ContentType[] {
  if (Array.isArray(data)) return data as ContentType[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'data', 'result']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as ContentType[];
    }
  }
  return [];
}

/** Chuẩn hóa response danh sách entry về FilteredEntry[] an toàn. */
function toEntryArray(data: unknown): FilteredEntry[] {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const items = obj.items;
    if (Array.isArray(items)) return items as FilteredEntry[];
  }
  if (Array.isArray(data)) return data as FilteredEntry[];
  return [];
}

/** Chuẩn hóa response danh sách block về EntryBlockDto[] an toàn. */
function toBlockArray(data: unknown): EntryBlockDto[] {
  if (Array.isArray(data)) return data as EntryBlockDto[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'blocks', 'data', 'result']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as EntryBlockDto[];
    }
  }
  return [];
}

/** Parse an toàn chuỗi JSON object -> Record. */
function parseBlockData(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Sinh ID tạm cho khối mới (chưa có trong DB). */
function makeTempId(type: string): string {
  return `tmp-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// Sub-component: Khối trong thư viện (cột trái) — kéo được
// ============================================================================

function LibraryBlockItem({ def }: { def: BlockDefinition }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${LIBRARY_PREFIX}${def.type}`,
    data: { source: 'library', blockType: def.type },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group flex items-start gap-3 p-3 mb-2 rounded-xl border border-slate-200 bg-white hover:border-indigo-400 hover:shadow-sm cursor-grab active:cursor-grabbing transition-all"
    >
      <div className="w-9 h-9 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
        {def.icon}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-sm text-slate-800">{def.label}</div>
        <div className="text-xs text-slate-500 leading-snug">{def.description}</div>
      </div>
      <HolderOutlined className="ml-auto text-slate-300 group-hover:text-indigo-400 shrink-0 mt-1" />
    </div>
  );
}

// ============================================================================
// Sub-component: Khối trên Canvas — sortable
// ============================================================================

interface CanvasBlockItemProps {
  block: CanvasBlock;
  onToggleVisible: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (block: CanvasBlock) => void;
}

function CanvasBlockItem({ block, onToggleVisible, onDelete, onEdit }: CanvasBlockItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { source: 'canvas' },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mb-3 rounded-xl border bg-white transition-all ${
        block.isVisible ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        {/* Tay cầm kéo */}
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-indigo-500 px-1"
          title="Kéo để đổi thứ tự"
        >
          <HolderOutlined />
        </span>

        <Tag color={block.isVisible ? 'blue' : 'default'} className="rounded-md !mr-0">
          {block.type}
        </Tag>
        <span className={`font-semibold text-sm ${block.isVisible ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
          {block.label}
        </span>
        {block.isNew ? (
          <Tag color="orange" className="rounded-md">Mới</Tag>
        ) : null}

        <Space size={2} className="ml-auto">
          <Tooltip title={block.isVisible ? 'Ẩn khối' : 'Hiện khối'}>
            <Button
              type="text"
              size="small"
              icon={block.isVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              onClick={() => onToggleVisible(block.id)}
            />
          </Tooltip>
          <Tooltip title="Xóa khối">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDelete(block.id)}
            />
          </Tooltip>
        </Space>
      </div>

      {/* Vùng preview — click để mở Drawer chỉnh sửa */}
      <div
        className="px-4 py-3 cursor-pointer hover:bg-indigo-50/40 transition-colors rounded-b-xl"
        onClick={() => onEdit(block)}
      >
        <div className="text-xs text-slate-500 mb-1">Dữ liệu khối (click để chỉnh sửa):</div>
        <pre className="!mb-0 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 overflow-auto max-h-32">
          {JSON.stringify(block.data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ============================================================================
// Component chính
// ============================================================================

export default function PageBuilderPage() {
  const siteId = useAuthStore((state) => state.siteId);
  const { message } = App.useApp();

  // ----- Chọn Content Type / Entry -----
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [contentTypesLoading, setContentTypesLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined);

  const [entries, setEntries] = useState<FilteredEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);

  // ----- Canvas -----
  const [blocks, setBlocks] = useState<CanvasBlock[]>([]);
  /** Snapshot blocks đã lưu trong DB (để diff khi Lưu cấu hình). */
  const [savedBlocks, setSavedBlocks] = useState<CanvasBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isOverCanvas, setIsOverCanvas] = useState(false);

  // Drawer chỉnh sửa
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<CanvasBlock | null>(null);
  const [jsonText, setJsonText] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  /** Vùng droppable của canvas (cho phép thả vào canvas rỗng). */
  const { setNodeRef: setCanvasRef, isOver } = useDroppable({ id: CANVAS_DROPPABLE_ID });

  /** Danh sách ID khối trên canvas (cho SortableContext). */
  const canvasIds = useMemo(() => blocks.map((b) => b.id), [blocks]);

  /** componentTypeId dùng cho khối mới: ưu tiên Content Type đang chọn, fallback Content Type đầu tiên. */
  const componentTypeId = useMemo<string | undefined>(() => {
    if (selectedType) {
      const found = contentTypes.find((ct) => ct.apiId === selectedType);
      if (found) return found.id;
    }
    return contentTypes.length > 0 ? contentTypes[0].id : undefined;
  }, [selectedType, contentTypes]);

  // ----- Loaders -----

  /** Tải danh sách Content Type. */
  const loadContentTypes = useCallback(async () => {
    if (!siteId) return;
    setContentTypesLoading(true);
    try {
      const res = await api.get<unknown>('/api/content-types', { params: { siteId } });
      setContentTypes(toContentTypeArray(res.data));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách Content Types');
      setContentTypes([]);
    } finally {
      setContentTypesLoading(false);
    }
  }, [siteId, message]);

  /** Tải danh sách Entry theo Content Type đã chọn. */
  const loadEntries = useCallback(
    async (apiId: string) => {
      if (!siteId) return;
      setEntriesLoading(true);
      try {
        const res = await api.get<FilterEntriesResponse>('/api/entries/filter', {
          params: { siteId, contentTypeApiId: apiId, pageIndex: 1, pageSize: 100 },
        });
        setEntries(toEntryArray(res.data));
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } } };
        message.error(e?.response?.data?.error || 'Không tải được danh sách Entry');
        setEntries([]);
      } finally {
        setEntriesLoading(false);
      }
    },
    [siteId, message]
  );

  /** Tải blocks đã lưu của Entry (GET /api/entries/{entryId}/blocks?locale=vi). */
  const loadBlocks = useCallback(
    async (entryId: string) => {
      setBlocksLoading(true);
      try {
        const res = await api.get<unknown>(`/api/entries/${entryId}/blocks`, {
          params: { locale: DEFAULT_LOCALE },
        });
        const dtos = toBlockArray(res.data);

        const mapped: CanvasBlock[] = dtos.map((d) => {
          const def = BLOCK_LIBRARY.find((x) => x.type === d.zoneKey) ?? BLOCK_LIBRARY[0];
          return {
            id: d.id,
            type: def.type,
            label: def.label,
            isVisible: d.isVisible,
            data: parseBlockData(d.blockData),
            isNew: false,
          };
        });

        setBlocks(mapped);
        setSavedBlocks(mapped);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } } };
        message.error(e?.response?.data?.error || 'Không tải được danh sách khối');
        setBlocks([]);
        setSavedBlocks([]);
      } finally {
        setBlocksLoading(false);
      }
    },
    [message]
  );

  useEffect(() => {
    loadContentTypes();
  }, [loadContentTypes]);

  // ----- Canvas operations -----

  /** Thêm khối mới vào canvas từ definition. */
  const addBlockFromLibrary = (blockType: string, index?: number) => {
    const def = BLOCK_LIBRARY.find((d) => d.type === blockType);
    if (!def) return;

    const newBlock: CanvasBlock = {
      id: makeTempId(def.type),
      type: def.type,
      label: def.label,
      isVisible: true,
      data: { ...def.defaultData },
      isNew: true,
    };

    setBlocks((prev) => {
      if (typeof index === 'number' && index >= 0 && index <= prev.length) {
        const next = [...prev];
        next.splice(index, 0, newBlock);
        return next;
      }
      return [...prev, newBlock];
    });
  };

  /** Bật/tắt hiển thị khối. */
  const handleToggleVisible = (id: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, isVisible: !b.isVisible } : b)));
  };

  /** Xóa khối khỏi canvas. */
  const handleDelete = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  /** Mở Drawer chỉnh sửa dữ liệu khối. */
  const handleEdit = (block: CanvasBlock) => {
    setEditingBlock(block);
    setJsonText(JSON.stringify(block.data, null, 2));
    setDrawerOpen(true);
  };

  /** Lưu dữ liệu JSON từ Drawer vào khối. */
  const handleSaveDrawer = () => {
    if (!editingBlock) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      message.error('JSON không hợp lệ. Vui lòng kiểm tra lại cú pháp.');
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      message.error('Dữ liệu khối phải là JSON object, VD: {"title":"..."}');
      return;
    }

    const data = parsed as Record<string, unknown>;
    setBlocks((prev) => prev.map((b) => (b.id === editingBlock.id ? { ...b, data } : b)));
    message.success('Đã cập nhật dữ liệu khối');
    setDrawerOpen(false);
    setEditingBlock(null);
  };

  /** Lưu cấu hình: diff với snapshot rồi POST/PUT/DELETE song song. */
  const handleSaveConfig = async () => {
    if (!selectedEntryId) {
      message.error('Vui lòng chọn Entry trước khi lưu cấu hình.');
      return;
    }
    if (!componentTypeId) {
      message.error('Không xác định được componentTypeId. Vui lòng chọn Content Type.');
      return;
    }

    setSaving(true);
    try {
      const savedIds = new Set(savedBlocks.map((b) => b.id));
      const currentIds = new Set(blocks.map((b) => b.id));

      // 1) Khối mới thêm -> POST
      const toCreate = blocks.filter((b) => b.isNew || !savedIds.has(b.id));

      // 2) Khối bị xóa khỏi canvas -> DELETE
      const toDelete = savedBlocks.filter((b) => !currentIds.has(b.id));

      // 3) Khối đã có nhưng thay đổi data / isVisible / sortOrder -> PUT
      const toUpdate = blocks.filter((b) => {
        if (b.isNew || !savedIds.has(b.id)) return false;
        const old = savedBlocks.find((s) => s.id === b.id);
        if (!old) return false;
        const newIndex = blocks.findIndex((x) => x.id === b.id);
        const oldIndex = savedBlocks.findIndex((x) => x.id === b.id);
        return (
          JSON.stringify(old.data) !== JSON.stringify(b.data) ||
          old.isVisible !== b.isVisible ||
          newIndex !== oldIndex
        );
      });

      const tasks: Promise<unknown>[] = [];

      // POST: tạo khối mới
      toCreate.forEach((b) => {
        const sortOrder = blocks.findIndex((x) => x.id === b.id);
        tasks.push(
          api.post(`/api/entries/${selectedEntryId}/blocks`, {
            locale: DEFAULT_LOCALE,
            zoneKey: b.type,
            componentTypeId,
            blockData: b.data,
            sortOrder: sortOrder < 0 ? 0 : sortOrder,
            isVisible: b.isVisible,
          })
        );
      });

      // PUT: cập nhật khối đã có
      toUpdate.forEach((b) => {
        const sortOrder = blocks.findIndex((x) => x.id === b.id);
        tasks.push(
          api.put(`/api/blocks/${b.id}`, {
            blockData: b.data,
            sortOrder: sortOrder < 0 ? 0 : sortOrder,
            isVisible: b.isVisible,
          })
        );
      });

      // DELETE: xóa khối đã bị bỏ khỏi canvas
      toDelete.forEach((b) => {
        tasks.push(api.delete(`/api/blocks/${b.id}`));
      });

      if (tasks.length === 0) {
        message.info('Không có thay đổi nào cần lưu.');
        return;
      }

      await Promise.all(tasks);

      message.success(
        `Đã lưu cấu hình: ${toCreate.length} tạo mới, ${toUpdate.length} cập nhật, ${toDelete.length} xóa.`
      );

      // Reload lại từ DB để đồng bộ ID thật cho các khối mới.
      await loadBlocks(selectedEntryId);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Lưu cấu hình thất bại');
    } finally {
      setSaving(false);
    }
  };

  // ----- Drag & Drop handlers -----

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    setIsOverCanvas(event.over?.id === CANVAS_DROPPABLE_ID);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setIsOverCanvas(false);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const isFromLibrary = activeId.startsWith(LIBRARY_PREFIX);

    // 1) Kéo từ thư viện -> thả vào canvas
    if (isFromLibrary) {
      const blockType = activeId.slice(LIBRARY_PREFIX.length);

      // Thả vào vùng trống của canvas -> thêm cuối
      if (overId === CANVAS_DROPPABLE_ID) {
        addBlockFromLibrary(blockType);
        return;
      }

      // Thả đè lên 1 khối đã có -> chèn trước khối đó
      const overIndex = blocks.findIndex((b) => b.id === overId);
      if (overIndex >= 0) {
        addBlockFromLibrary(blockType, overIndex);
      }
      return;
    }

    // 2) Kéo đổi thứ tự trong canvas
    if (activeId === overId) return;
    const oldIndex = blocks.findIndex((b) => b.id === activeId);
    const newIndex = blocks.findIndex((b) => b.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    setBlocks((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  /** Khối đang được kéo (để render DragOverlay). */
  const activeDragDef = useMemo(() => {
    if (!activeDragId) return null;
    if (activeDragId.startsWith(LIBRARY_PREFIX)) {
      const type = activeDragId.slice(LIBRARY_PREFIX.length);
      return BLOCK_LIBRARY.find((d) => d.type === type) ?? null;
    }
    return null;
  }, [activeDragId]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-800 flex items-center gap-2">
            <BuildOutlined className="text-indigo-600" />
            Page Builder
          </Title>
          <Text className="text-slate-500">
            Chọn Entry, kéo khối từ thư viện vào canvas, kéo để đổi thứ tự, click để chỉnh sửa dữ liệu.
          </Text>
        </div>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSaveConfig}
          loading={saving}
          disabled={!selectedEntryId}
          className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
        >
          Lưu cấu hình
        </Button>
      </div>

      {/* Toolbar: chọn Content Type + Entry */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <Space wrap size="middle" className="w-full">
          <Select
            placeholder="Chọn Content Type"
            style={{ minWidth: 240 }}
            value={selectedType}
            onChange={(v) => {
              setSelectedType(v);
              setSelectedEntryId(undefined);
              setEntries([]);
              setBlocks([]);
              setSavedBlocks([]);
              if (v) loadEntries(v);
            }}
            options={contentTypes.map((ct) => ({
              label: `${ct.displayName} (${ct.apiId})`,
              value: ct.apiId,
            }))}
            loading={contentTypesLoading}
            showSearch
            optionFilterProp="label"
            allowClear
          />
          <Select
            placeholder="Chọn Entry"
            style={{ minWidth: 320 }}
            value={selectedEntryId}
            onChange={(v) => {
              setSelectedEntryId(v);
              if (v) loadBlocks(v);
              else {
                setBlocks([]);
                setSavedBlocks([]);
              }
            }}
            options={entries.map((e) => ({
              label: e.title || e.slug || e.entryId,
              value: e.entryId,
            }))}
            loading={entriesLoading}
            disabled={!selectedType}
            showSearch
            optionFilterProp="label"
            allowClear
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => selectedEntryId && loadBlocks(selectedEntryId)}
            loading={blocksLoading}
            disabled={!selectedEntryId}
            className="rounded-lg"
          >
            Tải lại khối
          </Button>
        </Space>
      </div>

      {!selectedEntryId ? (
        <Alert
          type="info"
          showIcon
          message="Chưa chọn Entry"
          description="Vui lòng chọn Content Type và Entry ở thanh công cụ phía trên để bắt đầu dựng trang và lưu cấu hình."
          className="rounded-xl"
        />
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
          {/* ---------- Cột trái: Thư viện khối ---------- */}
          <Card
            className="rounded-2xl shadow-sm border-slate-200"
            title={
              <span className="font-bold flex items-center gap-2">
                <AppstoreOutlined className="text-indigo-600" />
                Khối giao diện có sẵn
              </span>
            }
            size="small"
          >
            <div className="text-xs text-slate-500 mb-3">
              Kéo khối vào canvas bên phải để thêm.
            </div>
            <SortableContext
              items={BLOCK_LIBRARY.map((d) => `${LIBRARY_PREFIX}${d.type}`)}
              strategy={verticalListSortingStrategy}
            >
              {BLOCK_LIBRARY.map((def) => (
                <LibraryBlockItem key={def.type} def={def} />
              ))}
            </SortableContext>
          </Card>

          {/* ---------- Cột phải: Canvas ---------- */}
          <Card
            className="rounded-2xl shadow-sm border-slate-200"
            title={
              <span className="font-bold flex items-center gap-2">
                <BuildOutlined className="text-indigo-600" />
                Canvas
                <Tag className="rounded-md ml-1">{blocks.length} khối</Tag>
              </span>
            }
            size="small"
          >
            <Spin spinning={blocksLoading}>
              <div
                ref={setCanvasRef}
                className={`min-h-[420px] rounded-xl border-2 border-dashed p-3 transition-colors ${
                  isOver || isOverCanvas
                    ? 'border-indigo-400 bg-indigo-50/50'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                {blocks.length === 0 ? (
                  <div className="h-[380px] flex items-center justify-center">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <span className="text-slate-500">
                          Kéo khối từ thư viện bên trái vào đây
                          <br />
                          <span className="text-xs text-slate-400">hoặc bấm nút bên dưới</span>
                        </span>
                      }
                    >
                      <Space wrap>
                        {BLOCK_LIBRARY.map((def) => (
                          <Button
                            key={def.type}
                            icon={<PlusOutlined />}
                            onClick={() => addBlockFromLibrary(def.type)}
                            className="rounded-lg"
                          >
                            {def.label}
                          </Button>
                        ))}
                      </Space>
                    </Empty>
                  </div>
                ) : (
                  <SortableContext items={canvasIds} strategy={verticalListSortingStrategy}>
                    {blocks.map((block) => (
                      <CanvasBlockItem
                        key={block.id}
                        block={block}
                        onToggleVisible={handleToggleVisible}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                      />
                    ))}
                  </SortableContext>
                )}
              </div>
            </Spin>
          </Card>
        </div>

        {/* DragOverlay: hiển thị khối đang kéo */}
        <DragOverlay>
          {activeDragDef ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-indigo-400 bg-white shadow-lg w-[300px]">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
                {activeDragDef.icon}
              </div>
              <div className="font-semibold text-sm text-slate-800">{activeDragDef.label}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ---------- Drawer chỉnh sửa dữ liệu khối ---------- */}
      <Drawer
        title={
          <span className="font-semibold">
            Chỉnh sửa khối: {editingBlock?.label ?? ''}
          </span>
        }
        placement="right"
        width={520}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingBlock(null);
        }}
        destroyOnHidden
        extra={
          <Space>
            <Button
              onClick={() => {
                setDrawerOpen(false);
                setEditingBlock(null);
              }}
            >
              Hủy
            </Button>
            <Button type="primary" onClick={handleSaveDrawer} className="rounded-lg font-semibold">
              Lưu khối
            </Button>
          </Space>
        }
      >
        {editingBlock ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
              <div>
                <Text type="secondary">Loại khối: </Text>
                <Tag color="blue" className="rounded-md">{editingBlock.type}</Tag>
              </div>
              <div className="mt-1">
                <Text type="secondary">ID: </Text>
                <Text code className="text-xs">{editingBlock.id}</Text>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-700 mb-2">
                Dữ liệu khối (JSON object)
              </div>
              <Input.TextArea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={18}
                className="rounded-lg font-mono text-xs"
                placeholder='{"title":"..."}'
              />
              <div className="text-xs text-slate-400 mt-1">
                Dữ liệu phải là JSON object hợp lệ. Thay đổi chỉ được ghi vào DB khi bấm &quot;Lưu cấu hình&quot;.
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
