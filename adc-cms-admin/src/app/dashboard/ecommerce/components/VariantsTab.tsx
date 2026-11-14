'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Tag, Button, Modal, Form, Input, InputNumber, Select, Switch, Space, message, Empty, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { ContentType, FilteredEntry, FilterEntriesResponse } from '@/lib/types';

// ============================================================================
// Types (khớp DTO backend .NET)
// ============================================================================

/** GET /api/ecommerce/variants -> VariantDto */
export interface Variant {
  id: string;
  siteId: string;
  entryId: string;
  skuCode: string;
  barcode?: string | null;
  price: number;
  salePrice: number;
  costPrice?: number | null;
  stockQuantity: number;
  reservedQuantity: number;
  trackInventory: boolean;
  variantOptions: string;
  imageUrl?: string | null;
  weightGram: number;
  isDefault: boolean;
  isActive: boolean;
}

interface VariantFormValues {
  skuCode: string;
  barcode?: string;
  price: number;
  salePrice: number;
  costPrice?: number;
  stockQuantity: number;
  trackInventory: boolean;
  variantOptionsText?: string;
  imageUrl?: string;
  weightGram: number;
  isDefault: boolean;
  isActive: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/** Định dạng tiền VNĐ. */
function formatVnd(value: number): string {
  return `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
}

/** Parse an toàn chuỗi JSON object -> Record. */
function parseJsonObject(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ============================================================================
// Component
// ============================================================================

export default function VariantsTab() {
  const siteId = useAuthStore((state) => state.siteId);

  // ----- Chọn sản phẩm (Entry) -----
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<FilteredEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);

  // ----- Danh sách biến thể -----
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);

  // ----- Modal Thêm/Sửa -----
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [variantSubmitting, setVariantSubmitting] = useState(false);
  const [variantForm] = Form.useForm<VariantFormValues>();

  /** Tải danh sách Content Type (để chọn loại sản phẩm). */
  useEffect(() => {
    if (!siteId) return;
    (async () => {
      try {
        const res = await api.get<ContentType[]>('/api/content-types', { params: { siteId } });
        setContentTypes(res.data ?? []);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } } };
        message.error(e?.response?.data?.error || 'Không tải được danh sách Content Types');
      }
    })();
  }, [siteId]);

  /** Tải danh sách Entry theo Content Type đã chọn (dùng cho Select sản phẩm). */
  const loadEntries = useCallback(
    async (apiId: string) => {
      if (!siteId) return;
      setEntriesLoading(true);
      try {
        const res = await api.get<FilterEntriesResponse>('/api/entries/filter', {
          params: { siteId, contentTypeApiId: apiId, pageIndex: 1, pageSize: 100 },
        });
        setEntries(res.data?.items ?? []);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } } };
        message.error(e?.response?.data?.error || 'Không tải được danh sách sản phẩm');
        setEntries([]);
      } finally {
        setEntriesLoading(false);
      }
    },
    [siteId]
  );

  /** Tải danh sách biến thể của 1 entry. */
  const loadVariants = useCallback(async (entryId: string) => {
    setVariantsLoading(true);
    try {
      const res = await api.get<Variant[]>('/api/ecommerce/variants', { params: { entryId } });
      setVariants(res.data ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách biến thể');
      setVariants([]);
    } finally {
      setVariantsLoading(false);
    }
  }, []);

  /** Mở Modal thêm biến thể. */
  const openCreateVariant = () => {
    if (!selectedEntryId) {
      message.warning('Vui lòng chọn sản phẩm (Entry) trước.');
      return;
    }
    setEditingVariant(null);
    variantForm.resetFields();
    variantForm.setFieldsValue({
      price: 0,
      salePrice: 0,
      stockQuantity: 0,
      trackInventory: true,
      weightGram: 0,
      isDefault: false,
      isActive: true,
      variantOptionsText: '{}',
    });
    setVariantModalOpen(true);
  };

  /** Mở Modal sửa biến thể. */
  const openEditVariant = (record: Variant) => {
    setEditingVariant(record);
    variantForm.setFieldsValue({
      skuCode: record.skuCode,
      barcode: record.barcode ?? '',
      price: record.price,
      salePrice: record.salePrice,
      costPrice: record.costPrice ?? undefined,
      stockQuantity: record.stockQuantity,
      trackInventory: record.trackInventory,
      variantOptionsText: record.variantOptions || '{}',
      imageUrl: record.imageUrl ?? '',
      weightGram: record.weightGram,
      isDefault: record.isDefault,
      isActive: record.isActive,
    });
    setVariantModalOpen(true);
  };

  /** Submit tạo/sửa biến thể. */
  const handleSubmitVariant = async () => {
    if (!siteId || !selectedEntryId) return;
    let values: VariantFormValues;
    try {
      values = await variantForm.validateFields();
    } catch {
      return;
    }

    // variantOptions phải là JSON object.
    let variantOptions: Record<string, unknown> = {};
    if (values.variantOptionsText?.trim()) {
      try {
        const parsed = JSON.parse(values.variantOptionsText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          message.error('variantOptions phải là JSON object, VD: {"color":"Đen","size":"256GB"}');
          return;
        }
        variantOptions = parsed as Record<string, unknown>;
      } catch {
        message.error('variantOptions không phải JSON hợp lệ.');
        return;
      }
    }

    setVariantSubmitting(true);
    try {
      if (editingVariant) {
        // PUT chỉ nhận price, salePrice, stockQuantity, variantOptions.
        await api.put(`/api/ecommerce/variants/${editingVariant.id}`, {
          price: values.price,
          salePrice: values.salePrice,
          stockQuantity: values.stockQuantity,
          variantOptions,
        });
        message.success('Cập nhật biến thể thành công');
      } else {
        await api.post('/api/ecommerce/variants', {
          siteId,
          entryId: selectedEntryId,
          skuCode: values.skuCode.trim(),
          barcode: values.barcode?.trim() || null,
          price: values.price,
          salePrice: values.salePrice,
          costPrice: values.costPrice ?? null,
          stockQuantity: values.stockQuantity,
          trackInventory: values.trackInventory,
          variantOptions,
          imageUrl: values.imageUrl?.trim() || null,
          weightGram: values.weightGram,
          isDefault: values.isDefault,
          isActive: values.isActive,
        });
        message.success('Tạo biến thể thành công');
      }
      setVariantModalOpen(false);
      setEditingVariant(null);
      await loadVariants(selectedEntryId);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Thao tác thất bại');
    } finally {
      setVariantSubmitting(false);
    }
  };

  /** Xóa biến thể. */
  const handleDeleteVariant = async (record: Variant) => {
    try {
      await api.delete(`/api/ecommerce/variants/${record.id}`);
      message.success('Đã xóa biến thể');
      if (selectedEntryId) await loadVariants(selectedEntryId);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa thất bại');
    }
  };

  const variantColumns: ColumnsType<Variant> = [
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 180,
      render: (v: string, record) => (
        <Space size={4}>
          <span className="font-mono text-sm font-semibold text-slate-800">{v}</span>
          {record.isDefault ? <Tag color="blue" className="rounded-md">Mặc định</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Thuộc tính',
      dataIndex: 'variantOptions',
      key: 'variantOptions',
      render: (v: string) => {
        const opts = parseJsonObject(v);
        const entries = Object.entries(opts);
        if (entries.length === 0) return <span className="text-slate-400">—</span>;
        return (
          <Space size={4} wrap>
            {entries.map(([k, val]) => (
              <Tag key={k} className="rounded-md">
                {k}: {String(val)}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Giá bán',
      dataIndex: 'price',
      key: 'price',
      width: 140,
      align: 'right',
      render: (v: number) => <span className="text-slate-700">{formatVnd(v)}</span>,
    },
    {
      title: 'Giá KM',
      dataIndex: 'salePrice',
      key: 'salePrice',
      width: 140,
      align: 'right',
      render: (v: number) =>
        v > 0 ? (
          <span className="font-semibold text-emerald-600">{formatVnd(v)}</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      title: 'Tồn kho',
      dataIndex: 'stockQuantity',
      key: 'stockQuantity',
      width: 130,
      align: 'center',
      render: (v: number, record) => (
        <Tag color={v > 0 ? 'green' : 'red'} className="rounded-md">
          {v}
          {record.reservedQuantity > 0 ? ` (giữ ${record.reservedQuantity})` : ''}
        </Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 120,
      align: 'center',
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'} className="rounded-md">
          {v ? 'Đang bán' : 'Ngừng bán'}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 160,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} className="font-medium" onClick={() => openEditVariant(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xóa biến thể này?"
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteVariant(record)}
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
      {/* Bộ chọn sản phẩm */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <Space wrap size="middle" className="w-full">
          <Select
            placeholder="Chọn Content Type (loại sản phẩm)"
            style={{ minWidth: 240 }}
            value={selectedType}
            onChange={(v) => {
              setSelectedType(v);
              setSelectedEntryId(undefined);
              setVariants([]);
              setEntries([]);
              if (v) loadEntries(v);
            }}
            options={contentTypes.map((ct) => ({ label: `${ct.displayName} (${ct.apiId})`, value: ct.apiId }))}
            showSearch
            optionFilterProp="label"
            allowClear
          />
          <Select
            placeholder="Chọn sản phẩm (Entry)"
            style={{ minWidth: 320 }}
            value={selectedEntryId}
            onChange={(v) => {
              setSelectedEntryId(v);
              if (v) loadVariants(v);
              else setVariants([]);
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
            onClick={() => selectedEntryId && loadVariants(selectedEntryId)}
            loading={variantsLoading}
            disabled={!selectedEntryId}
            className="rounded-lg"
          >
            Tải lại
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateVariant}
            disabled={!selectedEntryId}
            className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
          >
            Thêm biến thể
          </Button>
        </Space>
      </div>

      {/* Bảng biến thể */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<Variant>
          rowKey="id"
          columns={variantColumns}
          dataSource={variants}
          loading={variantsLoading}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} biến thể` }}
          locale={{
            emptyText: (
              <Empty
                description={
                  selectedEntryId
                    ? 'Sản phẩm này chưa có biến thể nào'
                    : 'Vui lòng chọn Content Type và Sản phẩm để xem biến thể'
                }
              />
            ),
          }}
        />
      </div>

      {/* Modal Thêm/Sửa biến thể */}
      <Modal
        title={<span className="font-semibold">{editingVariant ? 'Sửa biến thể' : 'Thêm biến thể mới'}</span>}
        open={variantModalOpen}
        onCancel={() => {
          setVariantModalOpen(false);
          setEditingVariant(null);
        }}
        onOk={handleSubmitVariant}
        confirmLoading={variantSubmitting}
        okText={editingVariant ? 'Lưu thay đổi' : 'Tạo mới'}
        cancelText="Hủy"
        width={640}
        destroyOnHidden
      >
        <Form form={variantForm} layout="vertical" requiredMark="optional" className="mt-4">
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item
              name="skuCode"
              label="Mã SKU"
              rules={[{ required: true, message: 'Vui lòng nhập SKU' }]}
              extra={editingVariant ? 'Không thể đổi SKU sau khi tạo' : undefined}
            >
              <Input placeholder="IP16PM-256-DEN" className="rounded-lg font-mono" disabled={Boolean(editingVariant)} />
            </Form.Item>
            <Form.Item name="barcode" label="Barcode">
              <Input placeholder="8935000000001" className="rounded-lg font-mono" disabled={Boolean(editingVariant)} />
            </Form.Item>

            <Form.Item name="price" label="Giá bán (VNĐ)" rules={[{ required: true, message: 'Nhập giá bán' }]}>
              <InputNumber className="w-full rounded-lg" min={0} step={1000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="salePrice" label="Giá khuyến mãi (VNĐ)">
              <InputNumber className="w-full rounded-lg" min={0} step={1000} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="costPrice" label="Giá vốn (VNĐ)">
              <InputNumber className="w-full rounded-lg" min={0} step={1000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="stockQuantity" label="Số lượng tồn kho" rules={[{ required: true, message: 'Nhập tồn kho' }]}>
              <InputNumber className="w-full rounded-lg" min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="weightGram" label="Trọng lượng (gram)">
              <InputNumber className="w-full rounded-lg" min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="imageUrl" label="URL ảnh biến thể">
              <Input placeholder="/uploads/anh.jpg" className="rounded-lg font-mono" />
            </Form.Item>
          </div>

          <Form.Item
            name="variantOptionsText"
            label="Thuộc tính biến thể (JSON object)"
            extra='VD: {"color":"Đen","size":"256GB"}'
          >
            <Input.TextArea rows={3} className="rounded-lg font-mono text-xs" placeholder='{"color":"Đen","size":"256GB"}' />
          </Form.Item>

          <div className="grid grid-cols-3 gap-x-4">
            <Form.Item name="trackInventory" label="Quản lý tồn kho" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isDefault" label="Biến thể mặc định" valuePropName="checked">
              <Switch disabled={Boolean(editingVariant)} />
            </Form.Item>
            <Form.Item name="isActive" label="Đang bán" valuePropName="checked">
              <Switch disabled={Boolean(editingVariant)} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
