'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Tag, Button, Drawer, Typography, message, Input, Space, Empty, Form, Switch, Popconfirm, Select,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  MenuOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import SortableTree from '@/components/SortableTree';
import type { Menu, MenuTreeResponse, MenuItemNode } from '@/lib/types';

const { Title, Text } = Typography;

interface CreateMenuFormValues {
  menuCode: string;
  menuName: string;
  isActive: boolean;
}

interface MenuItemFormValues {
  titleVi: string;
  titleEn: string;
  linkType: string;
  customUrl: string;
  targetEntryId: string;
  targetBlank: boolean;
  isVisible: boolean;
}

const LINK_TYPE_OPTIONS = [
  { label: 'Custom URL', value: 'custom' },
  { label: 'Entry (bài viết)', value: 'entry' },
  { label: 'Collection (danh sách)', value: 'collection' },
];

export default function MenusPage() {
  const siteId = useAuthStore((state) => state.siteId);

  // ----- Danh sách menu -----
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(false);

  // ----- Drawer thêm/sửa menu -----
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [form] = Form.useForm<CreateMenuFormValues>();

  // ----- Drawer xem cây menu -----
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeData, setTreeData] = useState<MenuTreeResponse | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);

  // ----- Drawer thêm/sửa Menu Item -----
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemNode | null>(null);
  const [parentForNew, setParentForNew] = useState<MenuItemNode | null>(null);
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [itemForm] = Form.useForm<MenuItemFormValues>();
  // Theo dõi linkType để hiển thị động customUrl / targetEntryId.
  const watchedLinkType = Form.useWatch('linkType', itemForm);

  /** Tải danh sách tất cả menu của site. */
  const loadMenus = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await api.get<Menu[]>('/api/menus/list', { params: { siteId } });
      setMenus(res.data ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách Menu');
      setMenus([]);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadMenus();
  }, [loadMenus]);

  /** Tải lại cây menu hiện tại (dùng sau khi thao tác item). */
  const reloadTree = useCallback(async () => {
    if (!siteId || !treeData?.menu) return;
    setTreeLoading(true);
    try {
      const res = await api.get<MenuTreeResponse>('/api/menus', {
        params: { siteId, menuCode: treeData.menu.menuCode },
      });
      setTreeData(res.data ?? null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được cây Menu');
    } finally {
      setTreeLoading(false);
    }
  }, [siteId, treeData]);

  /** Mở Drawer thêm menu. */
  const openCreate = () => {
    setEditingMenu(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true });
    setDrawerOpen(true);
  };

  /** Mở Drawer sửa menu gốc. */
  const openEdit = (record: Menu) => {
    setEditingMenu(record);
    form.setFieldsValue({
      menuCode: record.menuCode,
      menuName: record.menuName,
      isActive: record.isActive,
    });
    setDrawerOpen(true);
  };

  /** Đóng Drawer thêm/sửa menu và reset trạng thái. */
  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingMenu(null);
  };

  /** Submit tạo/sửa menu. */
  const handleCreate = async () => {
    if (!siteId) return;
    let values: CreateMenuFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSubmitting(true);
    try {
      if (editingMenu) {
        await api.put(`/api/menus/${editingMenu.id}`, {
          menuName: values.menuName.trim(),
          isActive: values.isActive,
        });
        message.success('Cập nhật Menu thành công');
      } else {
        await api.post('/api/menus', {
          siteId,
          menuCode: values.menuCode.trim(),
          menuName: values.menuName.trim(),
          isActive: values.isActive,
        });
        message.success('Tạo Menu thành công');
      }
      closeDrawer();
      await loadMenus();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || (editingMenu ? 'Cập nhật Menu thất bại' : 'Tạo Menu thất bại'));
    } finally {
      setSubmitting(false);
    }
  };

  /** Mở Drawer xem cây menu. */
  const openTree = async (record: Menu) => {
    if (!siteId) return;
    setTreeOpen(true);
    setTreeLoading(true);
    setTreeData(null);
    try {
      const res = await api.get<MenuTreeResponse>('/api/menus', {
        params: { siteId, menuCode: record.menuCode },
      });
      setTreeData(res.data ?? null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được cây Menu');
    } finally {
      setTreeLoading(false);
    }
  };

  /** Xóa menu. */
  const handleDelete = async (record: Menu) => {
    try {
      await api.delete(`/api/menus/${record.id}`);
      message.success('Đã xóa Menu');
      await loadMenus();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa Menu thất bại');
    }
  };

  // ---------- Menu Item CRUD ----------

  /** Mở Drawer thêm mục con (hoặc mục gốc nếu parent = null). */
  const openCreateItem = (parent: MenuItemNode | null) => {
    setEditingItem(null);
    setParentForNew(parent);
    itemForm.resetFields();
    itemForm.setFieldsValue({
      linkType: 'custom',
      customUrl: '',
      targetEntryId: '',
      targetBlank: false,
      isVisible: true,
    });
    setItemDrawerOpen(true);
  };

  /** Mở Drawer sửa mục. */
  const openEditItem = (node: MenuItemNode) => {
    setEditingItem(node);
    setParentForNew(null);
    itemForm.setFieldsValue({
      titleVi: node.titleLocales?.vi ?? '',
      titleEn: node.titleLocales?.en ?? '',
      linkType: node.linkType,
      customUrl: node.customUrl ?? '',
      targetEntryId: node.targetEntryId ?? '',
      targetBlank: node.targetBlank,
      isVisible: node.isVisible,
    });
    setItemDrawerOpen(true);
  };

  /** Submit tạo/sửa Menu Item. */
  const handleSubmitItem = async () => {
    if (!treeData?.menu) return;
    let values: MenuItemFormValues;
    try {
      values = await itemForm.validateFields();
    } catch {
      return;
    }

    const titleLocales: Record<string, string> = {};
    if (values.titleVi?.trim()) titleLocales.vi = values.titleVi.trim();
    if (values.titleEn?.trim()) titleLocales.en = values.titleEn.trim();

    // Tùy linkType: 'custom' -> gửi customUrl (targetEntryId = null);
    // 'entry'/'collection' -> gửi targetEntryId (customUrl = null).
    const isCustom = values.linkType === 'custom';
    const customUrl = isCustom ? (values.customUrl?.trim() || null) : null;
    const targetEntryId = isCustom ? null : (values.targetEntryId?.trim() || null);

    setItemSubmitting(true);
    try {
      if (editingItem) {
        await api.put(`/api/menus/${treeData.menu.id}/items/${editingItem.id}`, {
          titleLocales,
          customUrl,
          targetBlank: values.targetBlank,
        });
        message.success('Cập nhật mục menu thành công');
      } else {
        await api.post(`/api/menus/${treeData.menu.id}/items`, {
          parentId: parentForNew?.id ?? null,
          titleLocales,
          linkType: values.linkType,
          customUrl,
          targetEntryId,
          targetBlank: values.targetBlank,
          isVisible: values.isVisible,
        });
        message.success('Thêm mục menu thành công');
      }
      setItemDrawerOpen(false);
      setEditingItem(null);
      setParentForNew(null);
      await reloadTree();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Thao tác thất bại');
    } finally {
      setItemSubmitting(false);
    }
  };

  /** Xóa Menu Item. */
  const handleDeleteItem = async (node: MenuItemNode) => {
    if (!treeData?.menu) return;
    try {
      await api.delete(`/api/menus/items/${node.id}`, { params: { menuId: treeData.menu.id } });
      message.success('Đã xóa mục menu');
      await reloadTree();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa thất bại');
    }
  };

  /** Kéo thả: gọi API cập nhật sortOrder + parentId, rollback nếu lỗi. */
  const handleMove = async (itemId: string, newParentId: string | null, newSortOrder: number) => {
    if (!treeData?.menu) return;
    const snapshot = treeData; // giữ trạng thái cũ để rollback
    try {
      await api.put(`/api/menus/${treeData.menu.id}/items/${itemId}`, {
        // Guid.Empty (all-zero) => chuyển thành mục gốc.
        parentId: newParentId ?? '00000000-0000-0000-0000-000000000000',
        sortOrder: newSortOrder,
      });
      message.success('Đã cập nhật vị trí');
      await reloadTree();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Cập nhật vị trí thất bại');
      setTreeData(snapshot); // rollback
    }
  };

  const columns: ColumnsType<Menu> = [
    {
      title: 'Mã Menu',
      dataIndex: 'menuCode',
      key: 'menuCode',
      width: 220,
      render: (v: string) => <span className="font-mono text-sm text-indigo-600 font-semibold">{v}</span>,
    },
    {
      title: 'Tên Menu',
      dataIndex: 'menuName',
      key: 'menuName',
      render: (v: string) => <span className="font-semibold text-slate-800">{v}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 140,
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'} className="rounded-md">
          {v ? 'Đang bật' : 'Đang tắt'}
        </Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => <span className="text-slate-600">{dayjs(v).format('DD/MM/YYYY HH:mm')}</span>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 200,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} className="font-medium" onClick={() => openTree(record)}>
            Xem cây
          </Button>
          <Button type="link" icon={<EditOutlined />} className="font-medium" onClick={() => openEdit(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xóa Menu này?"
            description="Toàn bộ mục menu con cũng sẽ bị xóa. Không thể hoàn tác."
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} className="font-medium">
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-800 flex items-center gap-2">
            <MenuOutlined className="text-indigo-600" />
            Quản lý Menu
          </Title>
          <Text className="text-slate-500">
            Tạo và quản lý các vùng menu đa cấp (khớp thuộc tính <code className="text-indigo-600">data-cms-menu</code> trong HTML).
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadMenus} loading={loading} className="rounded-lg">
            Tải lại
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
          >
            Thêm Menu
          </Button>
        </Space>
      </div>

      {/* Bảng danh sách Menu */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<Menu>
          rowKey="id"
          columns={columns}
          dataSource={menus}
          loading={loading}
          locale={{ emptyText: <Empty description="Chưa có Menu nào. Bấm 'Thêm Menu' để tạo mới." /> }}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} menu` }}
        />
      </div>

      {/* Drawer Thêm/Sửa Menu */}
      <Drawer
        title={<span className="font-semibold">{editingMenu ? 'Sửa Menu' : 'Thêm Menu mới'}</span>}
        width={480}
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnHidden
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={closeDrawer} className="rounded-lg h-10 px-5">
              Hủy
            </Button>
            <Button
              type="primary"
              loading={submitting}
              onClick={handleCreate}
              className="rounded-lg h-10 px-6 font-semibold shadow-sm shadow-indigo-200"
            >
              {editingMenu ? 'Lưu thay đổi' : 'Tạo Menu'}
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="menuCode"
            label="Mã Menu (menuCode)"
            rules={
              editingMenu
                ? []
                : [
                    { required: true, message: 'Vui lòng nhập mã menu' },
                    { pattern: /^[a-z0-9_]+$/, message: 'Chỉ dùng chữ thường, số và dấu gạch dưới' },
                  ]
            }
            extra="Khớp với data-cms-menu trong HTML, VD: primary_menu, footer_menu"
          >
            <Input placeholder="primary_menu" className="rounded-lg font-mono" disabled={!!editingMenu} />
          </Form.Item>
          <Form.Item
            name="menuName"
            label="Tên Menu (menuName)"
            rules={[{ required: true, message: 'Vui lòng nhập tên menu' }]}
          >
            <Input placeholder="Menu Chính Đầu Trang" className="rounded-lg" />
          </Form.Item>
          <Form.Item name="isActive" label="Kích hoạt" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Drawer Xem cây Menu (kéo thả) */}
      <Drawer
        title={
          <Space>
            <span className="font-semibold">Cây Menu</span>
            {treeData?.menu ? (
              <Tag color="blue" className="rounded-md font-mono">
                {treeData.menu.menuCode}
              </Tag>
            ) : null}
          </Space>
        }
        width={720}
        open={treeOpen}
        onClose={() => setTreeOpen(false)}
        destroyOnHidden
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateItem(null)} className="rounded-lg">
            Thêm mục gốc
          </Button>
        }
      >
        {treeLoading ? (
          <div className="text-slate-400 text-sm">Đang tải cây menu...</div>
        ) : !treeData || treeData.items.length === 0 ? (
          <Empty description="Menu này chưa có mục nào" />
        ) : (
          <div>
            <div className="mb-3 text-xs text-slate-400">
              Kéo tay nắm để đổi thứ tự trong cùng cấp, hoặc kéo vào mục khác để chuyển thành mục con.
            </div>
            <SortableTree
              items={treeData.items}
              onMove={handleMove}
              onEdit={openEditItem}
              onDelete={handleDeleteItem}
              onAddChild={(parent) => openCreateItem(parent)}
            />
          </div>
        )}
      </Drawer>

      {/* Drawer Thêm/Sửa Menu Item */}
      <Drawer
        title={
          <span className="font-semibold">
            {editingItem ? 'Sửa mục menu' : parentForNew ? `Thêm mục con cho "${parentForNew.titleLocales?.vi || parentForNew.titleLocales?.en || ''}"` : 'Thêm mục gốc'}
          </span>
        }
        width={480}
        open={itemDrawerOpen}
        onClose={() => setItemDrawerOpen(false)}
        destroyOnHidden
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setItemDrawerOpen(false)} className="rounded-lg h-10 px-5">
              Hủy
            </Button>
            <Button
              type="primary"
              loading={itemSubmitting}
              onClick={handleSubmitItem}
              className="rounded-lg h-10 px-6 font-semibold shadow-sm shadow-indigo-200"
            >
              {editingItem ? 'Lưu thay đổi' : 'Thêm mục'}
            </Button>
          </div>
        }
      >
        <Form form={itemForm} layout="vertical" requiredMark="optional">
          <Form.Item name="titleVi" label="Tên (Tiếng Việt)" rules={[{ required: true, message: 'Vui lòng nhập tên' }]}>
            <Input placeholder="Sản phẩm" className="rounded-lg" />
          </Form.Item>
          <Form.Item name="titleEn" label="Tên (English)">
            <Input placeholder="Products" className="rounded-lg" />
          </Form.Item>
          {!editingItem ? (
            <Form.Item name="linkType" label="Kiểu liên kết" rules={[{ required: true, message: 'Chọn kiểu' }]}>
              <Select options={LINK_TYPE_OPTIONS} className="w-full" />
            </Form.Item>
          ) : null}

          {/* Hiển thị động: 'custom' -> customUrl; 'entry'/'collection' -> targetEntryId. */}
          {watchedLinkType === 'custom' ? (
            <Form.Item
              name="customUrl"
              label="URL (customUrl)"
              rules={[{ required: true, message: 'Vui lòng nhập URL' }]}
            >
              <Input placeholder="/san-pham" className="rounded-lg font-mono" />
            </Form.Item>
          ) : (
            <Form.Item
              name="targetEntryId"
              label="Entry ID (targetEntryId)"
              rules={[
                { required: true, message: 'Vui lòng nhập Entry ID' },
                { pattern: /^[0-9a-fA-F-]{36}$/, message: 'Entry ID phải là GUID hợp lệ' },
              ]}
              extra="GUID của entry đích (bài viết/trang) mà mục menu trỏ tới."
            >
              <Input placeholder="00000000-0000-0000-0000-000000000000" className="rounded-lg font-mono" />
            </Form.Item>
          )}

          <Form.Item name="targetBlank" label="Mở tab mới" valuePropName="checked">
            <Switch />
          </Form.Item>
          {!editingItem ? (
            <Form.Item name="isVisible" label="Hiển thị" valuePropName="checked">
              <Switch />
            </Form.Item>
          ) : null}
        </Form>
      </Drawer>
    </div>
  );
}
