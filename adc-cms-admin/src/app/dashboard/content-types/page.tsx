'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Tag, Switch, Button, Drawer, Typography, message, Empty, Space, Form, Input, Select, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AppstoreOutlined, EyeOutlined, ReloadOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { ContentType, FieldDefinition } from '@/lib/types';

const { Title, Text } = Typography;

/** Màu Tag theo "kind" của content type. */
const KIND_COLOR: Record<string, string> = {
  collection: 'geekblue',
  single: 'purple',
  taxonomy: 'cyan',
  page: 'blue',
};

/** Danh sách kind cho Select. */
const KIND_OPTIONS = [
  { label: 'Collection (danh sách)', value: 'collection' },
  { label: 'Single (trang đơn)', value: 'single' },
  { label: 'Component (khối)', value: 'component' },
];

/** Danh sách field type cho Select. */
const FIELD_TYPE_OPTIONS = [
  { label: 'string', value: 'string' },
  { label: 'text', value: 'text' },
  { label: 'rich_text', value: 'rich_text' },
  { label: 'integer', value: 'integer' },
  { label: 'decimal', value: 'decimal' },
  { label: 'boolean', value: 'boolean' },
  { label: 'datetime', value: 'datetime' },
  { label: 'enumeration', value: 'enumeration' },
  { label: 'multi_select', value: 'multi_select' },
  { label: 'media', value: 'media' },
  { label: 'relation', value: 'relation' },
  { label: 'dynamic_zone', value: 'dynamic_zone' },
];

interface ContentTypeFormValues {
  apiId: string;
  displayName: string;
  kind: string;
}

interface FieldFormValues {
  fieldKey: string;
  displayLabel: string;
  fieldType: string;
  isRequired: boolean;
  isFilterable: boolean;
}

export default function ContentTypesPage() {
  const siteId = useAuthStore((state) => state.siteId);

  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loading, setLoading] = useState(false);

  // ----- Drawer Content Type (Thêm/Sửa) -----
  const [ctDrawerOpen, setCtDrawerOpen] = useState(false);
  const [editingCt, setEditingCt] = useState<ContentType | null>(null);
  const [ctSubmitting, setCtSubmitting] = useState(false);
  const [ctForm] = Form.useForm<ContentTypeFormValues>();

  // ----- Drawer xem fields -----
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeType, setActiveType] = useState<ContentType | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);

  // ----- Drawer Field (Thêm/Sửa) -----
  const [fieldDrawerOpen, setFieldDrawerOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [fieldSubmitting, setFieldSubmitting] = useState(false);
  const [fieldForm] = Form.useForm<FieldFormValues>();

  /** Tải danh sách content type của site hiện tại. */
  const loadContentTypes = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await api.get<ContentType[]>('/api/content-types', { params: { siteId } });
      setContentTypes(res.data ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách Content Types');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadContentTypes();
  }, [loadContentTypes]);

  // ---------- Content Type CRUD ----------

  /** Mở Drawer thêm mới content type. */
  const openCreateCt = () => {
    setEditingCt(null);
    ctForm.resetFields();
    ctForm.setFieldsValue({ kind: 'collection' });
    setCtDrawerOpen(true);
  };

  /** Mở Drawer sửa content type. */
  const openEditCt = (record: ContentType) => {
    setEditingCt(record);
    ctForm.setFieldsValue({
      apiId: record.apiId,
      displayName: record.displayName,
      kind: record.kind,
    });
    setCtDrawerOpen(true);
  };

  /** Submit tạo/sửa content type. */
  const handleSubmitCt = async () => {
    if (!siteId) return;
    let values: ContentTypeFormValues;
    try {
      values = await ctForm.validateFields();
    } catch {
      return;
    }

    setCtSubmitting(true);
    try {
      if (editingCt) {
        await api.put(`/api/content-types/${editingCt.id}`, {
          displayName: values.displayName.trim(),
          kind: values.kind,
        });
        message.success('Cập nhật Content Type thành công');
      } else {
        await api.post('/api/content-types', {
          siteId,
          apiId: values.apiId.trim(),
          displayName: values.displayName.trim(),
          kind: values.kind,
        });
        message.success('Tạo Content Type thành công');
      }
      setCtDrawerOpen(false);
      setEditingCt(null);
      await loadContentTypes();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Thao tác thất bại');
    } finally {
      setCtSubmitting(false);
    }
  };

  /** Xóa content type. */
  const handleDeleteCt = async (record: ContentType) => {
    try {
      await api.delete(`/api/content-types/${record.id}`);
      message.success('Đã xóa Content Type');
      await loadContentTypes();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa thất bại');
    }
  };

  // ---------- Fields ----------

  /** Mở Drawer và tải các field của content type được chọn. */
  const openFields = async (record: ContentType) => {
    setActiveType(record);
    setDrawerOpen(true);
    await loadFields(record);
  };

  /** Tải danh sách field của content type. */
  const loadFields = async (record: ContentType) => {
    setFields([]);
    setFieldsLoading(true);
    try {
      const res = await api.get<FieldDefinition[]>(
        `/api/content-types/${encodeURIComponent(record.apiId)}/fields`,
        { params: { siteId } }
      );
      setFields(res.data ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách Fields');
    } finally {
      setFieldsLoading(false);
    }
  };

  /** Mở Drawer thêm field. */
  const openCreateField = () => {
    setEditingField(null);
    fieldForm.resetFields();
    fieldForm.setFieldsValue({ fieldType: 'string', isRequired: false, isFilterable: false });
    setFieldDrawerOpen(true);
  };

  /** Mở Drawer sửa field. */
  const openEditField = (record: FieldDefinition) => {
    setEditingField(record);
    fieldForm.setFieldsValue({
      fieldKey: record.fieldKey,
      displayLabel: record.displayLabel,
      fieldType: record.fieldType,
      isRequired: record.isRequired,
      isFilterable: Boolean(record.isFilterable),
    });
    setFieldDrawerOpen(true);
  };

  /** Submit tạo/sửa field. */
  const handleSubmitField = async () => {
    if (!activeType) return;
    let values: FieldFormValues;
    try {
      values = await fieldForm.validateFields();
    } catch {
      return;
    }

    setFieldSubmitting(true);
    try {
      if (editingField?.id) {
        await api.put(`/api/content-types/fields/${editingField.id}`, {
          displayLabel: values.displayLabel.trim(),
          fieldType: values.fieldType,
          isRequired: values.isRequired,
          isFilterable: values.isFilterable,
        });
        message.success('Cập nhật Field thành công');
      } else {
        await api.post(`/api/content-types/${activeType.id}/fields`, {
          fieldKey: values.fieldKey.trim(),
          displayLabel: values.displayLabel.trim(),
          fieldType: values.fieldType,
          isRequired: values.isRequired,
          isFilterable: values.isFilterable,
        });
        message.success('Tạo Field thành công');
      }
      setFieldDrawerOpen(false);
      setEditingField(null);
      await loadFields(activeType);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Thao tác thất bại');
    } finally {
      setFieldSubmitting(false);
    }
  };

  /** Xóa field. */
  const handleDeleteField = async (record: FieldDefinition) => {
    if (!record.id || !activeType) return;
    try {
      await api.delete(`/api/content-types/fields/${record.id}`);
      message.success('Đã xóa Field');
      await loadFields(activeType);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa thất bại');
    }
  };

  const columns: ColumnsType<ContentType> = [
    {
      title: 'API ID',
      dataIndex: 'apiId',
      key: 'apiId',
      width: 200,
      render: (value: string) => (
        <Tag color="blue" className="rounded-md font-mono text-xs px-2 py-0.5">
          {value}
        </Tag>
      ),
    },
    {
      title: 'Tên hiển thị',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (value: string) => <span className="font-semibold text-slate-800">{value}</span>,
    },
    {
      title: 'Loại',
      dataIndex: 'kind',
      key: 'kind',
      width: 150,
      render: (value: string) => (
        <Tag color={KIND_COLOR[value] ?? 'default'} className="rounded-md capitalize">
          {value}
        </Tag>
      ),
    },
    {
      title: 'Đa ngôn ngữ',
      dataIndex: 'isLocalized',
      key: 'isLocalized',
      width: 130,
      align: 'center',
      render: (value?: boolean) => <Switch checked={Boolean(value)} disabled size="small" />,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 260,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} className="font-medium" onClick={() => openFields(record)}>
            Fields
          </Button>
          <Button type="link" icon={<EditOutlined />} className="font-medium" onClick={() => openEditCt(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xóa Content Type này?"
            description="Toàn bộ fields cũng sẽ bị xóa. Không thể hoàn tác."
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteCt(record)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} className="font-medium">
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const fieldColumns: ColumnsType<FieldDefinition> = [
    {
      title: 'Field Key',
      dataIndex: 'fieldKey',
      key: 'fieldKey',
      render: (v: string) => <span className="font-mono text-xs text-slate-700">{v}</span>,
    },
    {
      title: 'Nhãn',
      dataIndex: 'displayLabel',
      key: 'displayLabel',
      render: (v: string) => <span className="font-medium text-slate-800">{v}</span>,
    },
    {
      title: 'Kiểu',
      dataIndex: 'fieldType',
      key: 'fieldType',
      width: 120,
      render: (v: string) => <Tag className="rounded-md">{v}</Tag>,
    },
    {
      title: 'Bắt buộc',
      dataIndex: 'isRequired',
      key: 'isRequired',
      width: 90,
      align: 'center',
      render: (v: boolean) => (v ? <Tag color="red">Có</Tag> : <Tag>Không</Tag>),
    },
    {
      title: 'Lọc được',
      dataIndex: 'isFilterable',
      key: 'isFilterable',
      width: 90,
      align: 'center',
      render: (v?: boolean) => (v ? <Tag color="green">Có</Tag> : <Tag>Không</Tag>),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 150,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} className="font-medium" onClick={() => openEditField(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xóa Field này?"
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteField(record)}
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
            <AppstoreOutlined className="text-indigo-600" />
            Cấu trúc dữ liệu (Content Types)
          </Title>
          <Text className="text-slate-500">
            Quản lý các loại nội dung động và các trường dữ liệu (fields) được định nghĩa cho site hiện tại.
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadContentTypes} loading={loading} className="rounded-lg">
            Tải lại
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateCt}
            className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
          >
            Thêm Content Type
          </Button>
        </Space>
      </div>

      {/* Bảng content types */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<ContentType>
          rowKey="id"
          columns={columns}
          dataSource={contentTypes}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: <Empty description="Chưa có Content Type nào" /> }}
        />
      </div>

      {/* Drawer Thêm/Sửa Content Type */}
      <Drawer
        title={<span className="font-semibold">{editingCt ? 'Sửa Content Type' : 'Thêm Content Type'}</span>}
        width={480}
        open={ctDrawerOpen}
        onClose={() => setCtDrawerOpen(false)}
        destroyOnHidden
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setCtDrawerOpen(false)} className="rounded-lg h-10 px-5">
              Hủy
            </Button>
            <Button
              type="primary"
              loading={ctSubmitting}
              onClick={handleSubmitCt}
              className="rounded-lg h-10 px-6 font-semibold shadow-sm shadow-indigo-200"
            >
              {editingCt ? 'Lưu thay đổi' : 'Tạo mới'}
            </Button>
          </div>
        }
      >
        <Form form={ctForm} layout="vertical" requiredMark="optional">
          <Form.Item
            name="apiId"
            label="API ID (apiId)"
            rules={[
              { required: true, message: 'Vui lòng nhập apiId' },
              { pattern: /^[a-z0-9_]+$/, message: 'Chỉ dùng chữ thường, số và dấu gạch dưới' },
            ]}
            extra="Không thể đổi sau khi tạo. VD: product, article, project"
          >
            <Input placeholder="product" className="rounded-lg font-mono" disabled={Boolean(editingCt)} />
          </Form.Item>
          <Form.Item
            name="displayName"
            label="Tên hiển thị (displayName)"
            rules={[{ required: true, message: 'Vui lòng nhập tên hiển thị' }]}
          >
            <Input placeholder="Sản phẩm" className="rounded-lg" />
          </Form.Item>
          <Form.Item name="kind" label="Loại (kind)" rules={[{ required: true, message: 'Chọn loại' }]}>
            <Select options={KIND_OPTIONS} className="w-full" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Drawer xem fields */}
      <Drawer
        title={
          <Space>
            <span className="font-semibold">Fields của</span>
            <Tag color="blue" className="rounded-md font-mono">
              {activeType?.apiId}
            </Tag>
          </Space>
        }
        width={820}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateField} className="rounded-lg">
            Thêm Field
          </Button>
        }
      >
        <Table<FieldDefinition>
          rowKey={(r) => r.id ?? r.fieldKey}
          columns={fieldColumns}
          dataSource={fields}
          loading={fieldsLoading}
          pagination={false}
          size="small"
          locale={{ emptyText: <Empty description="Content Type này chưa có field nào" /> }}
        />
      </Drawer>

      {/* Drawer Thêm/Sửa Field */}
      <Drawer
        title={<span className="font-semibold">{editingField ? 'Sửa Field' : 'Thêm Field'}</span>}
        width={480}
        open={fieldDrawerOpen}
        onClose={() => setFieldDrawerOpen(false)}
        destroyOnHidden
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setFieldDrawerOpen(false)} className="rounded-lg h-10 px-5">
              Hủy
            </Button>
            <Button
              type="primary"
              loading={fieldSubmitting}
              onClick={handleSubmitField}
              className="rounded-lg h-10 px-6 font-semibold shadow-sm shadow-indigo-200"
            >
              {editingField ? 'Lưu thay đổi' : 'Tạo mới'}
            </Button>
          </div>
        }
      >
        <Form form={fieldForm} layout="vertical" requiredMark="optional">
          <Form.Item
            name="fieldKey"
            label="Field Key"
            rules={[
              { required: true, message: 'Vui lòng nhập fieldKey' },
              { pattern: /^[a-z0-9_]+$/, message: 'Chỉ dùng chữ thường, số và dấu gạch dưới' },
            ]}
            extra="Không thể đổi sau khi tạo. VD: price, brand, description"
          >
            <Input placeholder="price" className="rounded-lg font-mono" disabled={Boolean(editingField)} />
          </Form.Item>
          <Form.Item
            name="displayLabel"
            label="Nhãn hiển thị"
            rules={[{ required: true, message: 'Vui lòng nhập nhãn' }]}
          >
            <Input placeholder="Giá bán" className="rounded-lg" />
          </Form.Item>
          <Form.Item name="fieldType" label="Kiểu dữ liệu" rules={[{ required: true, message: 'Chọn kiểu' }]}>
            <Select options={FIELD_TYPE_OPTIONS} className="w-full" showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="isRequired" label="Bắt buộc nhập" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isFilterable" label="Cho phép lọc (Faceted Filter)" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
