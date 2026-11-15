'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Tag, Button, Modal, Form, Input, Switch, Space, message, Empty, Popconfirm,
  Alert, Avatar, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  UserOutlined, PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/lib/api';

const { Title, Text } = Typography;

// ============================================================================
// Types (khớp DTO backend .NET)
// ============================================================================

/** GET /api/users -> UserListItemDto */
export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  isSuperAdmin: boolean;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
}

interface CreateUserFormValues {
  email: string;
  password: string;
  fullName: string;
  isSuperAdmin: boolean;
  isActive: boolean;
}

interface UpdateUserFormValues {
  fullName?: string;
  password?: string;
  isSuperAdmin: boolean;
  isActive: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

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

// ============================================================================
// Component
// ============================================================================

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal Thêm mới
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm<CreateUserFormValues>();

  // Modal Sửa
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editForm] = Form.useForm<UpdateUserFormValues>();

  /** Tải danh sách user (GET /api/users). */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<unknown>('/api/users');
      setUsers(toUserArray(res.data));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách người dùng');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  /** Mở Modal thêm user. */
  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ isSuperAdmin: false, isActive: true });
    setCreateOpen(true);
  };

  /** Submit tạo user (POST /api/users). */
  const handleCreate = async () => {
    let values: CreateUserFormValues;
    try {
      values = await createForm.validateFields();
    } catch {
      return;
    }

    setCreating(true);
    try {
      await api.post('/api/users', {
        email: values.email.trim(),
        password: values.password,
        fullName: values.fullName.trim(),
        isSuperAdmin: values.isSuperAdmin,
        isActive: values.isActive,
      });
      message.success('Tạo người dùng thành công');
      setCreateOpen(false);
      await loadUsers();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      if (e?.response?.status === 409) {
        message.error('Email này đã tồn tại.');
      } else {
        message.error(e?.response?.data?.error || 'Tạo người dùng thất bại');
      }
    } finally {
      setCreating(false);
    }
  };

  /** Mở Modal sửa user. */
  const openEdit = (record: UserRow) => {
    setEditing(record);
    editForm.setFieldsValue({
      fullName: record.fullName,
      password: '',
      isSuperAdmin: record.isSuperAdmin,
      isActive: record.isActive,
    });
    setEditOpen(true);
  };

  /** Submit cập nhật user (PUT /api/users/{id}). */
  const handleUpdate = async () => {
    if (!editing) return;
    let values: UpdateUserFormValues;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }

    setUpdating(true);
    try {
      await api.put(`/api/users/${editing.id}`, {
        fullName: values.fullName?.trim() || null,
        password: values.password?.trim() || null,
        isSuperAdmin: values.isSuperAdmin,
        isActive: values.isActive,
      });
      message.success('Cập nhật người dùng thành công');
      setEditOpen(false);
      setEditing(null);
      await loadUsers();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Cập nhật thất bại');
    } finally {
      setUpdating(false);
    }
  };

  /** Xóa user (DELETE /api/users/{id}). */
  const handleDelete = async (record: UserRow) => {
    try {
      await api.delete(`/api/users/${record.id}`);
      message.success('Đã xóa người dùng');
      await loadUsers();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa thất bại');
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
      title: 'Đăng nhập gần nhất',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 180,
      render: (v?: string | null) =>
        v ? (
          <span className="text-slate-600">{dayjs(v).format('DD/MM/YYYY HH:mm')}</span>
        ) : (
          <span className="text-slate-400">Chưa đăng nhập</span>
        ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v?: string | null) =>
        v ? <span className="text-slate-600">{dayjs(v).format('DD/MM/YYYY HH:mm')}</span> : <span className="text-slate-400">—</span>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 170,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} className="font-medium" onClick={() => openEdit(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xóa người dùng này?"
            description="Toàn bộ role đã gán của user cũng sẽ bị xóa."
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-800 flex items-center gap-2">
            <UserOutlined className="text-indigo-600" />
            Quản lý Người dùng
          </Title>
          <Text className="text-slate-500">
            Thêm, sửa, khóa và xóa tài khoản người dùng hệ thống.
          </Text>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        message="Để gán Role cho người dùng, vui lòng dùng trang Phân quyền (RBAC) → tab Users."
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
            Thêm người dùng
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadUsers} loading={loading} className="rounded-lg">
            Tải lại
          </Button>
        </Space>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<UserRow>
          rowKey="id"
          columns={columns}
          dataSource={Array.isArray(users) ? users : []}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} người dùng` }}
          locale={{ emptyText: <Empty description="Chưa có người dùng nào" /> }}
        />
      </div>

      {/* Modal Thêm người dùng */}
      <Modal
        title={<span className="font-semibold">Thêm người dùng mới</span>}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="Tạo mới"
        cancelText="Hủy"
        width={560}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" requiredMark="optional" className="mt-4">
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Vui lòng nhập email' },
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input placeholder="user@test.com" className="rounded-lg" />
          </Form.Item>
          <Form.Item
            name="fullName"
            label="Họ và tên"
            rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
          >
            <Input placeholder="Nguyễn Văn A" className="rounded-lg" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu' },
              { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
            ]}
          >
            <Input.Password placeholder="Tối thiểu 6 ký tự" className="rounded-lg" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="isSuperAdmin" label="Super Admin" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isActive" label="Kích hoạt" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Modal Sửa người dùng */}
      <Modal
        title={<span className="font-semibold">Sửa người dùng</span>}
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        onOk={handleUpdate}
        confirmLoading={updating}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        width={560}
        destroyOnHidden
      >
        {editing ? (
          <div className="mb-4 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Email (không thể đổi)</div>
            <div className="font-mono font-semibold text-slate-800">{editing.email}</div>
          </div>
        ) : null}

        <Form form={editForm} layout="vertical" requiredMark="optional">
          <Form.Item name="fullName" label="Họ và tên">
            <Input placeholder="Nguyễn Văn A" className="rounded-lg" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mật khẩu mới"
            extra="Để trống nếu không muốn đổi mật khẩu."
            rules={[{ min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' }]}
          >
            <Input.Password placeholder="Tối thiểu 6 ký tự" className="rounded-lg" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="isSuperAdmin" label="Super Admin" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isActive" label="Kích hoạt" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
