'use client';

import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Tag, Button, Space, Popconfirm } from 'antd';
import {
  HolderOutlined, EditOutlined, DeleteOutlined, PlusOutlined, DownOutlined, RightOutlined,
} from '@ant-design/icons';
import type { MenuItemNode } from '@/lib/types';

/**
 * SortableTree
 * ------------
 * Cây menu đa cấp kéo thả bằng @dnd-kit.
 *  - Kéo trong cùng cấp: đổi thứ tự (sortOrder).
 *  - Kéo vào giữa một mục khác: chuyển thành con của mục đó (parentId).
 *  - Kéo ra vùng gốc (root drop zone): chuyển thành mục gốc (parentId = null).
 *
 * Callback onMove(itemId, newParentId, newSortOrder) được gọi khi thả chuột.
 * Component cha chịu trách nhiệm gọi API + rollback nếu lỗi.
 */

export interface SortableTreeProps {
  items: MenuItemNode[];
  onMove: (itemId: string, newParentId: string | null, newSortOrder: number) => void;
  onEdit: (node: MenuItemNode) => void;
  onDelete: (node: MenuItemNode) => void;
  onAddChild: (parent: MenuItemNode) => void;
}

/** Lấy nhãn hiển thị từ titleLocales. */
function getLabel(node: MenuItemNode): string {
  return node.titleLocales?.vi || node.titleLocales?.en || '(Chưa có tên)';
}

/** Flatten cây thành map id -> node để tra cứu nhanh. */
function flatten(nodes: MenuItemNode[], acc: Map<string, MenuItemNode> = new Map()): Map<string, MenuItemNode> {
  for (const n of nodes) {
    acc.set(n.id, n);
    if (n.children.length > 0) flatten(n.children, acc);
  }
  return acc;
}

/** Tìm parentId hiện tại của 1 node trong cây. */
function findParentId(nodes: MenuItemNode[], targetId: string, parentId: string | null = null): string | null | undefined {
  for (const n of nodes) {
    if (n.id === targetId) return parentId;
    const found = findParentId(n.children, targetId, n.id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Lấy danh sách id cùng cấp (siblings) chứa targetId. */
function getSiblings(nodes: MenuItemNode[], targetId: string): MenuItemNode[] | null {
  if (nodes.some((n) => n.id === targetId)) return nodes;
  for (const n of nodes) {
    const found = getSiblings(n.children, targetId);
    if (found) return found;
  }
  return null;
}

interface SortableNodeProps {
  node: MenuItemNode;
  depth: number;
  onEdit: (node: MenuItemNode) => void;
  onDelete: (node: MenuItemNode) => void;
  onAddChild: (parent: MenuItemNode) => void;
}

/** Một dòng node kéo thả được (đệ quy render con). */
function SortableNode({ node, depth, onEdit, onDelete, onAddChild }: SortableNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasChildren = node.children.length > 0;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 mb-1.5 hover:border-indigo-300 transition-colors"
        style={{ marginLeft: depth * 20 }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Tay nắm kéo */}
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-indigo-600 px-1"
            title="Kéo để di chuyển"
          >
            <HolderOutlined />
          </span>

          {/* Nút mở/đóng cây con */}
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-slate-400 hover:text-indigo-600 w-4"
            >
              {expanded ? <DownOutlined /> : <RightOutlined />}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <span className="font-semibold text-slate-800 truncate">{getLabel(node)}</span>
          <Tag className="rounded-md shrink-0">{node.linkType}</Tag>
        </div>

        <Space size="small" className="shrink-0">
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => onAddChild(node)} title="Thêm mục con" />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(node)} title="Sửa" />
          <Popconfirm
            title="Xóa mục này?"
            description={hasChildren ? 'Mục này còn mục con, hãy xóa con trước.' : 'Không thể hoàn tác.'}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(node)}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} title="Xóa" />
          </Popconfirm>
        </Space>
      </div>

      {hasChildren && expanded ? (
        <SortableContext items={node.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {node.children.map((child) => (
            <SortableNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </SortableContext>
      ) : null}
    </div>
  );
}

export default function SortableTree({ items, onMove, onEdit, onDelete, onAddChild }: SortableTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const nodeMap = useMemo(() => flatten(items), [items]);
  const rootIds = useMemo(() => items.map((n) => n.id), [items]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    const activeNode = nodeMap.get(activeIdStr);
    const overNode = nodeMap.get(overIdStr);
    if (!activeNode || !overNode) return;

    // Không cho kéo mục vào chính con cháu của nó (tránh vòng lặp).
    const isDescendant = (ancestorId: string, nodeId: string): boolean => {
      const anc = nodeMap.get(ancestorId);
      if (!anc) return false;
      return anc.children.some((c) => c.id === nodeId || isDescendant(c.id, nodeId));
    };
    if (isDescendant(activeIdStr, overIdStr)) return;

    const activeParentId = findParentId(items, activeIdStr) ?? null;
    const overParentId = findParentId(items, overIdStr) ?? null;

    // Trường hợp 1: cùng cấp -> đổi thứ tự (sortOrder).
    if (activeParentId === overParentId) {
      const siblings = getSiblings(items, activeIdStr);
      if (!siblings) return;
      const oldIndex = siblings.findIndex((s) => s.id === activeIdStr);
      const newIndex = siblings.findIndex((s) => s.id === overIdStr);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const reordered = arrayMove(siblings, oldIndex, newIndex);
      const newSortOrder = reordered.findIndex((s) => s.id === activeIdStr);
      onMove(activeIdStr, activeParentId, newSortOrder);
      return;
    }

    // Trường hợp 2: khác cấp -> chuyển thành con của overNode (parentId = overId).
    // sortOrder = số con hiện tại của overNode (thêm vào cuối).
    const newSortOrder = overNode.children.length;
    onMove(activeIdStr, overIdStr, newSortOrder);
  };

  const activeNode = activeId ? nodeMap.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
        {items.map((node) => (
          <SortableNode
            key={node.id}
            node={node}
            depth={0}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
          />
        ))}
      </SortableContext>

      <DragOverlay>
        {activeNode ? (
          <div className="rounded-lg border border-indigo-400 bg-indigo-50 p-2.5 shadow-md">
            <span className="font-semibold text-indigo-700">{getLabel(activeNode)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
