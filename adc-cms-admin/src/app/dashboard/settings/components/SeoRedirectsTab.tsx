'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Tag, Button, Modal, Form, Input, Select, Switch, Space, Empty,
  Popconfirm, Alert, App,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

// ============================================================================
// Types (khớp DTO backend .NET)
// ============================================================================

/** GET /api/seo/redirects -> SeoRedirectDto */
export interface SeoRedirect {
  id: string;
  siteId: string;
  oldPath: string;
  newPath: string;
  statusCode: number;
  isRegex: boolean;
  note?: string | null;
  createdAt?: string | null;
}

interface RedirectFormValues {
  oldPath: string;
  newPath: string;
  statusCode: number;
  isRegex: boolean;
  note?: string;
}

// ============================================================================
// Hằng số
// ============================================================================

const STATUS_CODE_OPTIONS = [
  { label: '301 - Moved Permanently', value: 301 },
  { label: '302 - Found (Temporary)', value: 302 },
  { label: '307 - Temporary Redirect', value: 307 },
  { label: '308 - Permanent Redirect', value: 308 },
];

const STATUS_CODE_COLOR: Record<number, string> = {
  301: 'green',
  302: 'gold',
  307: 'blue',
  308: 'purple',
};

// ============================================================================
// Component
// ============================================================================

export default function SeoRedirectsTab() {
  const siteId = useAuthStore((state) => state.siteId);
  const { message } = App.useApp();

  const [redirects, setRedirects] = useState<SeoRedirect[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SeoRedirect | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<RedirectFormValues>();

  /** Tải danh sách redirect (GET /api/seo/redirects?siteId=...). */
  const loadRedirects = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await api.get<SeoRedirect[]>('/api/seo/redirects', { params: { siteId } });
      setRedirects(res.data ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách redirect');
      setRedirects([]);
    } finally {
      setLoading(false);
    }
  }, [siteId, message]);

  useEffect(() => {
    loadRedirects();
  }, [loadRedirects]);

  /** Mở Modal tạo mới. */
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ statusCode: 301, isRegex: false });
    setModalOpen(true);
  };

  /** Mở Modal sửa. */
  const openEdit = (record: SeoRedirect) => {
    setEditing(record);
    form.setFieldsValue({
      oldPath: record.oldPath,
      newPath: record.newPath,
      statusCode: record.statusCode,
      isRegex: record.isRegex,
      note: record.note ?? '',
    });
    setModalOpen(true);
  };

  /** Submit tạo/sửa redirect. */
  const handleSubmit = async () => {
    if (!siteId) return;
    let values: RedirectFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`/api/seo/redirects/${editing.id}`, {
          oldPath: values.oldPath.trim(),
          newPath: values.newPath.trim(),
          statusCode: values.statusCode,
          isRegex: values.isRegex,
          note: values.note?.trim() || null,
        });
        message.success('Cập nhật redirect thành công');
      } else {
        await api.post('/api/seo/redirects', {
          siteId,
          oldPath: values.oldPath.trim(),
          newPath: values.newPath.trim(),
          statusCode: values.statusCode,
          isRegex: values.isRegex,
          note: values.note?.trim() || null,
        });
        message.success('Tạo redirect thành công');
      }
      setModalOpen(false);
      setEditing(null);
      await loadRedirects();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      if (e?.response?.status === 409) {
        message.error('Đường dẫn cũ (oldPath) đã tồn tại trong site này.');
      } else {
        message.error(e?.response?.data?.error || 'Thao tác thất bại');
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** Xóa redirect (DELETE /api/seo/redirects/{id}). */
  const handleDelete = async (record: SeoRedirect) => {
    try {
      await api.delete(`/api/seo/redirects/${record.id}`);
      message.success('Đã xóa redirect');
      await loadRedirects();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa thất bại');
    }
  };

  const columns: ColumnsType<SeoRedirect> = [
    {
      title: 'Đường dẫn cũ',
      dataIndex: 'oldPath',
      key: 'oldPath',
      render: (v: string) => <span className="font-mono text-sm text-slate-800">{v}</span>,
    },
    {
      title: 'Đường dẫn mới',
      dataIndex: 'newPath',
      key: 'newPath',
      render: (v: string) => <span className="font-mono text-sm text-indigo-600">{v}</span>,
    },
    {
      title: 'Mã',
      dataIndex: 'statusCode',
      key: 'statusCode',
      width: 100,
      align: 'center',
      render: (v: number) => (
        <Tag color={STATUS_CODE_COLOR[v] ?? 'default'} className="rounded-md font-semibold">
          {v}
        </Tag>
      ),
    },
    {
      title: 'Is Regex',
      dataIndex: 'isRegex',
      key: 'isRegex',
      width: 110,
      align: 'center',
      render: (v: boolean) => (
        <Tag color={v ? 'orange' : 'default'} className="rounded-md">
          {v ? 'Regex' : 'Exact'}
        </Tag>
      ),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      key: 'note',
      render: (v?: string | null) =>
        v ? <span className="text-slate-600">{v}</span> : <span className="text-slate-400">—</span>,
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
            title="Xóa redirect này?"
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
    <div className="space-y-4">
      <Alert
        type="info"
        showIcon
        message="Redirect 301/302/307/308 giúp bảo vệ thứ hạng SEO khi đổi slug bài viết. Trùng oldPath trong cùng site sẽ báo lỗi 409."
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
            Thêm Redirect
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadRedirects} loading={loading} className="rounded-lg">
            Tải lại
          </Button>
        </Space>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<SeoRedirect>
          rowKey="id"
          columns={columns}
          dataSource={redirects}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} redirect` }}
          locale={{ emptyText: <Empty description="Chưa có redirect nào" /> }}
        />
      </div>

      <Modal
        title={<span className="font-semibold">{editing ? 'Sửa Redirect' : 'Thêm Redirect mới'}</span>}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={editing ? 'Lưu thay đổi' : 'Tạo mới'}
        cancelText="Hủy"
        width={560}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark="optional" className="mt-4">
          <Form.Item
            name="oldPath"
            label="Đường dẫn cũ (oldPath)"
            rules={[{ required: true, message: 'Vui lòng nhập đường dẫn cũ' }]}
            extra="VD: /tin-tuc/bai-viet-cu"
          >
            <Input placeholder="/tin-tuc/bai-viet-cu" className="rounded-lg font-mono" />
          </Form.Item>
          <Form.Item
            name="newPath"
            label="Đường dẫn mới (newPath)"
            rules={[{ required: true, message: 'Vui lòng nhập đường dẫn mới' }]}
            extra="VD: /tin-tuc/bai-viet-moi"
          >
            <Input placeholder="/tin-tuc/bai-viet-moi" className="rounded-lg font-mono" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="statusCode" label="Mã HTTP" rules={[{ required: true, message: 'Chọn mã' }]}>
              <Select options={STATUS_CODE_OPTIONS} className="w-full" />
            </Form.Item>
            <Form.Item name="isRegex" label="Dùng Regex" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Lý do chuyển hướng..." className="rounded-lg" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
