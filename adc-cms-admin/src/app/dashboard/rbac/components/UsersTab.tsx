'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Tag, Button, Modal, Form, Select, Space, message, Empty, Popconfirm, Alert, Avatar,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UserAddOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { Role } from './RolesTab';

// ============================================================================
// Types
// ============================================================================

/** GET /api/users -> UserListItemDto */
export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  isSuperAdmin: boolean;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
}

interface AssignRoleFormValues {
  roleId: string;
}

// ============================================================================
// Helpers (phòng vệ: API có thể trả mảng trực tiếp hoặc bọc trong object)
// ============================================================================

/** Chuẩn hóa response danh sách role về Role[] an toàn. */
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

/** Chuẩn hóa response danh sách user về UserRow[] an toàn. */
function toUserArray(data: unknown): UserRow[] {
  if (Array.isArray(data)) return data as UserRow[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'users', 'data', 'result']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as UserRow[];
    }
  }
  return [];
}

/**
 * Chuẩn hóa response role_code của user về string[].
 * Backend trả: { userId, siteId, roles: ["editor", ...] } -> phải lấy .roles.
 */
function toRoleCodeArray(data: unknown): string[] {
  if (Array.isArray(data)) {
    return data.filter((x): x is string => typeof x === 'string');
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['roles', 'items', 'data', 'result']) {
      const v = obj[key];
      if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
    }
  }
  return [];
}

// ============================================================================
// Component
// ============================================================================

export default function UsersTab() {
  const siteId = useAuthStore((state) => state.siteId);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Map userId -> danh sách roleCode đã gán (tải từ API).
  const [userRoles, setUserRoles] = useState<Record<string, string[]>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<AssignRoleFormValues>();

  /** Tải danh sách user (GET /api/users). */
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await api.get<unknown>('/api/users');
      setUsers(toUserArray(res.data));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách người dùng');
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  /** Tải danh sách role (toàn hệ thống + của site). */
  const loadRoles = useCallback(async () => {
    if (!siteId) return;
    setRolesLoading(true);
    try {
      const res = await api.get<unknown>('/api/rbac/roles', { params: { siteId } });
      setRoles(toRoleArray(res.data));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách Role');
      setRoles([]);
    } finally {
      setRolesLoading(false);
    }
  }, [siteId]);

  /** Tải role_code của từng user (GET /api/rbac/users/{userId}/roles). */
  const loadUserRoles = useCallback(async () => {
    if (!siteId || users.length === 0) return;
    const results = await Promise.all(
      users.map(async (u) => {
        try {
          const res = await api.get<unknown>(`/api/rbac/users/${u.id}/roles`, { params: { siteId } });
          return [u.id, toRoleCodeArray(res.data)] as const;
        } catch {
          return [u.id, [] as string[]] as const;
        }
      })
    );
    setUserRoles(Object.fromEntries(results));
  }, [siteId, users]);

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, [loadUsers, loadRoles]);

  useEffect(() => {
    loadUserRoles();
  }, [loadUserRoles]);

  /** Mở Modal gán quyền. */
  const openAssignRole = (record: UserRow) => {
    setEditingUser(record);
    form.resetFields();
    setModalOpen(true);
  };

  /** Submit gán role (POST /api/rbac/users/{userId}/roles). */
  const handleSubmit = async () => {
    if (!editingUser) return;
    let values: AssignRoleFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/rbac/users/${editingUser.id}/roles`, { roleId: values.roleId });
      message.success('Gán quyền thành công');
      setModalOpen(false);
      setEditingUser(null);
      await loadUserRoles();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Gán quyền thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  /** Thu hồi role khỏi user (DELETE /api/rbac/users/{userId}/roles/{roleId}). */
  const handleRevoke = async (record: UserRow, roleId: string) => {
    try {
      await api.delete(`/api/rbac/users/${record.id}/roles/${roleId}`);
      message.success('Đã thu hồi quyền');
      await loadUserRoles();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Thu hồi quyền thất bại');
    }
  };

  const columns: ColumnsType<UserRow> = [
    {
      title: 'Người dùng',
      key: 'user',
      render: (_, record) => (
        <Space size="middle">
          <Avatar style={{ backgroundColor: '#dbeafe', color: '#2563eb', fontWeight: 'bold' }}>
            {record.fullName.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div className="font-semibold text-slate-800">{record.fullName}</div>
            <div className="text-xs text-slate-500">{record.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Loại tài khoản',
      dataIndex: 'isSuperAdmin',
      key: 'isSuperAdmin',
      width: 160,
      align: 'center',
      render: (v: boolean) =>
        v ? (
          <Tag color="purple" className="rounded-md">Super Admin</Tag>
        ) : (
          <Tag color="blue" className="rounded-md">Thành viên</Tag>
        ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 130,
      align: 'center',
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'} className="rounded-md">
          {v ? 'Hoạt động' : 'Đã khóa'}
        </Tag>
      ),
    },
    {
      title: 'Roles đã gán',
      key: 'roles',
      render: (_, record) => {
        const codes = Array.isArray(userRoles[record.id]) ? userRoles[record.id] : [];
        if (codes.length === 0) return <span className="text-slate-400">—</span>;
        return (
          <Space size={4} wrap>
            {codes.map((code) => {
              const role = (Array.isArray(roles) ? roles : []).find((r) => r.roleCode === code);
              return (
                <Popconfirm
                  key={code}
                  title={`Thu hồi role "${code}"?`}
                  okText="Thu hồi"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => role && handleRevoke(record, role.id)}
                  disabled={!role}
                >
                  <Tag color="geekblue" className="rounded-md cursor-pointer">
                    {code}
                  </Tag>
                </Popconfirm>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 160,
      align: 'right',
      render: (_, record) => (
        <Button
          type="link"
          icon={<UserAddOutlined />}
          className="font-medium"
          onClick={() => openAssignRole(record)}
        >
          Gán quyền
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Alert
        type="info"
        showIcon
        message="Danh sách người dùng tải từ GET /api/users. Nút 'Gán quyền' gọi POST /api/rbac/users/{userId}/roles."
        className="rounded-xl"
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <Space wrap size="middle" className="w-full">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadUsers();
              loadRoles();
            }}
            loading={usersLoading || rolesLoading}
            className="rounded-lg"
          >
            Tải lại
          </Button>
        </Space>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<UserRow>
          rowKey="id"
          columns={columns}
          dataSource={Array.isArray(users) ? users : []}
          loading={usersLoading}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} người dùng` }}
          locale={{ emptyText: <Empty description="Chưa có người dùng nào" /> }}
        />
      </div>

      <Modal
        title={<span className="font-semibold">Gán quyền cho người dùng</span>}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingUser(null);
        }}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="Gán quyền"
        cancelText="Hủy"
        width={520}
        destroyOnHidden
      >
        {editingUser ? (
          <div className="mb-4 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Người dùng</div>
            <div className="font-semibold text-slate-800">{editingUser.fullName}</div>
            <div className="text-xs text-slate-500">{editingUser.email}</div>
          </div>
        ) : null}

        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="roleId"
            label="Chọn Role"
            rules={[{ required: true, message: 'Vui lòng chọn Role' }]}
          >
            <Select
              placeholder="Chọn role cần gán"
              className="w-full"
              loading={rolesLoading}
              showSearch
              optionFilterProp="label"
              suffixIcon={<SafetyCertificateOutlined />}
              options={(Array.isArray(roles) ? roles : []).map((r) => ({
                label: `${r.roleName} (${r.roleCode})`,
                value: r.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
