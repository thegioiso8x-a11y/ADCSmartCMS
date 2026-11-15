'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Tag, Button, Modal, Form, Input, Space, message, Empty, Popconfirm, Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

// ============================================================================
// Types (khớp DTO backend .NET)
// ============================================================================

/** GET /api/rbac/roles -> RoleDto */
export interface Role {
  id: string;
  siteId?: string | null;
  roleCode: string;
  roleName: string;
  description?: string | null;
}

interface CreateRoleFormValues {
  roleCode: string;
  roleName: string;
  description?: string;
}

// ============================================================================
// Helpers (phòng vệ: API có thể trả mảng trực tiếp hoặc bọc trong object)
// ============================================================================

/** Chuẩn hóa response về mảng Role[] an toàn. */
function toRoleArray(data: unknown): Role[] {
  if (Array.isArray(data)) return data as Role[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'roles', 'data', 'result']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as Role[];
    }
  }
  return [];
}

// ============================================================================
// Component
// ============================================================================

export default function RolesTab() {
  const siteId = useAuthStore((state) => state.siteId);

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<CreateRoleFormValues>();

  /** Tải danh sách role (toàn hệ thống + của site). */
  const loadRoles = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await api.get<unknown>('/api/rbac/roles', { params: { siteId } });
      setRoles(toRoleArray(res.data));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách Role');
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  /** Mở Modal thêm role. */
  const openCreate = () => {
    form.resetFields();
    setModalOpen(true);
  };

  /** Submit tạo role (POST /api/rbac/roles). */
  const handleSubmit = async () => {
    if (!siteId) return;
    let values: CreateRoleFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/rbac/roles', {
        siteId,
        roleCode: values.roleCode.trim(),
        roleName: values.roleName.trim(),
        description: values.description?.trim() || null,
      });
      message.success('Tạo Role thành công');
      setModalOpen(false);
      await loadRoles();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Tạo Role thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  /** Xóa role (DELETE /api/rbac/roles/{roleId}). */
  const handleDelete = async (record: Role) => {
    try {
      await api.delete(`/api/rbac/roles/${record.id}`);
      message.success('Đã xóa Role');
      await loadRoles();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa Role thất bại');
    }
  };

  const columns: ColumnsType<Role> = [
    {
      title: 'Role Code',
      dataIndex: 'roleCode',
      key: 'roleCode',
      width: 200,
      render: (v: string) => <span className="font-mono text-sm font-semibold text-indigo-600">{v}</span>,
    },
    {
      title: 'Tên Role',
      dataIndex: 'roleName',
      key: 'roleName',
      render: (v: string) => <span className="font-semibold text-slate-800">{v}</span>,
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
      render: (v?: string | null) =>
        v ? <span className="text-slate-600">{v}</span> : <span className="text-slate-400">—</span>,
    },
    {
      title: 'Phạm vi',
      dataIndex: 'siteId',
      key: 'siteId',
      width: 140,
      align: 'center',
      render: (v?: string | null) =>
        v ? (
          <Tag color="blue" className="rounded-md">Của site</Tag>
        ) : (
          <Tag color="purple" className="rounded-md">Toàn hệ thống</Tag>
        ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 120,
      align: 'right',
      render: (_, record) => (
        <Popconfirm
          title="Xóa Role này?"
          description="Toàn bộ phân quyền và gán role của user cũng sẽ bị xóa."
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDelete(record)}
        >
          <Button type="link" danger icon={<DeleteOutlined />} className="font-medium">
            Xóa
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Alert
        type="info"
        showIcon
        message="Role toàn hệ thống (siteId = null) áp dụng cho mọi website; Role của site chỉ áp dụng cho site hiện tại."
        className="rounded-xl"
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <Space wrap size="middle" className="w-full">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
          >
            Thêm Role
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadRoles} loading={loading} className="rounded-lg">
            Tải lại
          </Button>
        </Space>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<Role>
          rowKey="id"
          columns={columns}
          dataSource={Array.isArray(roles) ? roles : []}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} role` }}
          locale={{ emptyText: <Empty description="Chưa có Role nào" /> }}
        />
      </div>

      <Modal
        title={<span className="font-semibold">Thêm Role mới</span>}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="Tạo Role"
        cancelText="Hủy"
        width={520}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark="optional" className="mt-4">
          <Form.Item
            name="roleCode"
            label="Role Code"
            rules={[
              { required: true, message: 'Vui lòng nhập roleCode' },
              { pattern: /^[a-z0-9_]+$/, message: 'Chỉ dùng chữ thường, số và dấu gạch dưới' },
            ]}
            extra="Không thể đổi sau khi tạo. VD: editor, accountant, sale_manager"
          >
            <Input placeholder="editor" className="rounded-lg font-mono" />
          </Form.Item>
          <Form.Item
            name="roleName"
            label="Tên Role"
            rules={[{ required: true, message: 'Vui lòng nhập tên role' }]}
          >
            <Input placeholder="Biên tập viên" className="rounded-lg" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả quyền hạn của role này..." className="rounded-lg" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

