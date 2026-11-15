'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Tag, Button, Modal, Form, Input, InputNumber, Select, Switch, Space, message, Empty,
  Popconfirm, DatePicker, Alert, Divider, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, DeleteOutlined, CheckCircleOutlined, ReloadOutlined, EditOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

const { Text } = Typography;

// ============================================================================
// Types (khớp DTO backend .NET)
// ============================================================================

/** GET /api/ecommerce/promotions -> PromotionListItemDto */
export interface Promotion {
  id: string;
  siteId: string;
  couponCode: string;
  title: string;
  discountType: string;
  discountValue: number;
  maxDiscountAmount?: number | null;
  minOrderAmount: number;
  usageLimit?: number | null;
  usedCount: number;
  startAt: string;
  endAt?: string | null;
  isActive: boolean;
}

/** POST /api/ecommerce/promotions/validate -> ValidatePromotionResult */
interface ValidatePromotionResult {
  isValid: boolean;
  couponCode: string;
  discountAmount: number;
  finalAmount: number;
  reason?: string | null;
}

interface PromotionFormValues {
  couponCode: string;
  title: string;
  discountType: string;
  discountValue: number;
  maxDiscountAmount?: number;
  minOrderAmount: number;
  usageLimit?: number;
  range: [Dayjs, Dayjs | null];
  isActive: boolean;
}

interface ValidateFormValues {
  couponCode: string;
  orderAmount: number;
}

/** PUT /api/ecommerce/promotions/{promoId} — chỉ 3 trường backend hỗ trợ. */
interface EditPromotionFormValues {
  title: string;
  discountValue: number;
  isActive: boolean;
}

// ============================================================================
// Hằng số
// ============================================================================

const DISCOUNT_TYPE_OPTIONS = [
  { label: 'percentage (%)', value: 'percentage' },
  { label: 'fixed_amount (VNĐ)', value: 'fixed_amount' },
  { label: 'free_shipping', value: 'free_shipping' },
];

/** Chuẩn hóa response danh sách mã giảm giá về Promotion[] an toàn. */
function toPromotionArray(data: unknown): Promotion[] {
  if (Array.isArray(data)) return data as Promotion[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'promotions', 'data', 'result']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as Promotion[];
    }
  }
  return [];
}

/** Định dạng tiền VNĐ. */
function formatVnd(value: number): string {
  return `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
}

// ============================================================================
// Component
// ============================================================================

export default function PromotionsTab() {
  const siteId = useAuthStore((state) => state.siteId);

  // ----- Danh sách mã giảm giá -----
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);

  // ----- Modal Tạo mới -----
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [promoSubmitting, setPromoSubmitting] = useState(false);
  const [promoForm] = Form.useForm<PromotionFormValues>();

  // ----- Modal Validate -----
  const [validateModalOpen, setValidateModalOpen] = useState(false);
  const [validateSubmitting, setValidateSubmitting] = useState(false);
  const [validateResult, setValidateResult] = useState<ValidatePromotionResult | null>(null);
  const [validateForm] = Form.useForm<ValidateFormValues>();

  // ----- Modal Sửa -----
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm] = Form.useForm<EditPromotionFormValues>();

  /** Tải danh sách mã giảm giá (GET /api/ecommerce/promotions). */
  const loadPromotions = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await api.get<unknown>('/api/ecommerce/promotions', { params: { siteId } });
      setPromotions(toPromotionArray(res.data));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách mã giảm giá');
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  /** Mở Modal tạo mã giảm giá. */
  const openCreatePromotion = () => {
    promoForm.resetFields();
    promoForm.setFieldsValue({
      discountType: 'percentage',
      discountValue: 0,
      minOrderAmount: 0,
      isActive: true,
      range: [dayjs(), null],
    });
    setPromoModalOpen(true);
  };

  /** Submit tạo mã giảm giá (POST /api/ecommerce/promotions). */
  const handleSubmitPromotion = async () => {
    if (!siteId) return;
    let values: PromotionFormValues;
    try {
      values = await promoForm.validateFields();
    } catch {
      return;
    }

    const [startAt, endAt] = values.range ?? [];
    if (!startAt) {
      message.error('Vui lòng chọn thời gian bắt đầu.');
      return;
    }

    setPromoSubmitting(true);
    try {
      await api.post('/api/ecommerce/promotions', {
        siteId,
        couponCode: values.couponCode.trim(),
        title: values.title.trim(),
        discountType: values.discountType,
        discountValue: values.discountValue,
        startAt: startAt.toISOString(),
        endAt: endAt ? endAt.toISOString() : null,
        maxDiscountAmount: values.maxDiscountAmount ?? null,
        minOrderAmount: values.minOrderAmount ?? 0,
        usageLimit: values.usageLimit ?? null,
        isActive: values.isActive,
      });
      message.success('Tạo mã giảm giá thành công');
      setPromoModalOpen(false);
      await loadPromotions();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Tạo mã giảm giá thất bại');
    } finally {
      setPromoSubmitting(false);
    }
  };

  /** Mở Modal sửa mã giảm giá. */
  const openEditPromotion = (record: Promotion) => {
    setEditingPromotion(record);
    editForm.setFieldsValue({
      title: record.title,
      discountValue: record.discountValue,
      isActive: record.isActive,
    });
    setEditModalOpen(true);
  };

  /** Submit sửa mã giảm giá (PUT /api/ecommerce/promotions/{promoId}). */
  const handleSubmitEditPromotion = async () => {
    if (!editingPromotion) return;
    let values: EditPromotionFormValues;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }

    setEditSubmitting(true);
    try {
      await api.put(`/api/ecommerce/promotions/${editingPromotion.id}`, {
        title: values.title.trim(),
        discountValue: values.discountValue,
        isActive: values.isActive,
      });
      message.success('Cập nhật mã giảm giá thành công');
      setEditModalOpen(false);
      setEditingPromotion(null);
      await loadPromotions();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Cập nhật mã giảm giá thất bại');
    } finally {
      setEditSubmitting(false);
    }
  };

  /** Xóa mã giảm giá (DELETE /api/ecommerce/promotions/{promoId}). */
  const handleDeletePromotion = async (record: Promotion) => {
    try {
      await api.delete(`/api/ecommerce/promotions/${record.id}`);
      message.success('Đã xóa mã giảm giá');
      await loadPromotions();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa thất bại');
    }
  };

  /** Mở Modal validate mã giảm giá. */
  const openValidatePromotion = (record?: Promotion) => {
    validateForm.resetFields();
    validateForm.setFieldsValue({
      couponCode: record?.couponCode ?? '',
      orderAmount: 1000000,
    });
    setValidateResult(null);
    setValidateModalOpen(true);
  };

  /** Submit validate mã giảm giá (POST /api/ecommerce/promotions/validate). */
  const handleSubmitValidate = async () => {
    if (!siteId) return;
    let values: ValidateFormValues;
    try {
      values = await validateForm.validateFields();
    } catch {
      return;
    }

    setValidateSubmitting(true);
    try {
      const res = await api.post<ValidatePromotionResult>('/api/ecommerce/promotions/validate', {
        siteId,
        couponCode: values.couponCode.trim(),
        orderAmount: values.orderAmount,
      });
      setValidateResult(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Kiểm tra mã giảm giá thất bại');
    } finally {
      setValidateSubmitting(false);
    }
  };

  const promotionColumns: ColumnsType<Promotion> = [
    {
      title: 'Mã',
      dataIndex: 'couponCode',
      key: 'couponCode',
      width: 160,
      render: (v: string) => <span className="font-mono text-sm font-semibold text-indigo-600">{v}</span>,
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      key: 'title',
      render: (v: string) => <span className="font-semibold text-slate-800">{v}</span>,
    },
    {
      title: 'Loại',
      dataIndex: 'discountType',
      key: 'discountType',
      width: 150,
      render: (v: string) => <Tag className="rounded-md">{v}</Tag>,
    },
    {
      title: 'Giá trị',
      dataIndex: 'discountValue',
      key: 'discountValue',
      width: 130,
      align: 'right',
      render: (v: number, record) =>
        record.discountType === 'percentage' ? (
          <span className="font-semibold text-slate-800">{v}%</span>
        ) : record.discountType === 'fixed_amount' ? (
          <span className="font-semibold text-slate-800">{formatVnd(v)}</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      title: 'Đơn tối thiểu',
      dataIndex: 'minOrderAmount',
      key: 'minOrderAmount',
      width: 150,
      align: 'right',
      render: (v: number) => <span className="text-slate-600">{formatVnd(v)}</span>,
    },
    {
      title: 'Hiệu lực',
      key: 'validity',
      width: 220,
      render: (_, record) => (
        <span className="text-xs text-slate-600">
          {dayjs(record.startAt).format('DD/MM/YYYY')} →{' '}
          {record.endAt ? dayjs(record.endAt).format('DD/MM/YYYY') : '∞'}
        </span>
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
          {v ? 'Đang bật' : 'Đang tắt'}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 280,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            className="font-medium"
            onClick={() => openEditPromotion(record)}
          >
            Sửa
          </Button>
          <Button
            type="link"
            icon={<CheckCircleOutlined />}
            className="font-medium"
            onClick={() => openValidatePromotion(record)}
          >
            Thử mã
          </Button>
          <Popconfirm
            title="Xóa mã giảm giá này?"
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeletePromotion(record)}
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
        message="Danh sách mã giảm giá tải từ GET /api/ecommerce/promotions. Tạo mới, Xóa và 'Thử mã' (validate) đều gọi API thật."
        className="rounded-xl"
      />

      {/* Toolbar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <Space wrap size="middle" className="w-full">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreatePromotion}
            className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
          >
            Tạo mã giảm giá
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            onClick={() => openValidatePromotion()}
            className="rounded-lg"
          >
            Kiểm tra mã bất kỳ
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadPromotions} loading={loading} className="rounded-lg">
            Tải lại
          </Button>
        </Space>
      </div>

      {/* Bảng mã giảm giá */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<Promotion>
          rowKey="id"
          columns={promotionColumns}
          dataSource={Array.isArray(promotions) ? promotions : []}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} mã` }}
          locale={{ emptyText: <Empty description="Chưa có mã giảm giá nào" /> }}
        />
      </div>

      {/* Modal Tạo mã giảm giá */}
      <Modal
        title={<span className="font-semibold">Tạo mã giảm giá mới</span>}
        open={promoModalOpen}
        onCancel={() => setPromoModalOpen(false)}
        onOk={handleSubmitPromotion}
        confirmLoading={promoSubmitting}
        okText="Tạo mã"
        cancelText="Hủy"
        width={640}
        destroyOnHidden
      >
        <Form form={promoForm} layout="vertical" requiredMark="optional" className="mt-4">
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item
              name="couponCode"
              label="Mã giảm giá"
              rules={[
                { required: true, message: 'Vui lòng nhập mã' },
                { pattern: /^[A-Za-z0-9_-]+$/, message: 'Chỉ dùng chữ, số, gạch ngang/gạch dưới' },
              ]}
            >
              <Input placeholder="SALE10" className="rounded-lg font-mono uppercase" />
            </Form.Item>
            <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}>
              <Input placeholder="Giảm 10% toàn bộ đơn hàng" className="rounded-lg" />
            </Form.Item>

            <Form.Item name="discountType" label="Loại giảm giá" rules={[{ required: true, message: 'Chọn loại' }]}>
              <Select options={DISCOUNT_TYPE_OPTIONS} className="w-full" />
            </Form.Item>
            <Form.Item name="discountValue" label="Giá trị giảm" rules={[{ required: true, message: 'Nhập giá trị' }]}>
              <InputNumber className="w-full rounded-lg" min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="maxDiscountAmount" label="Giảm tối đa (VNĐ)">
              <InputNumber className="w-full rounded-lg" min={0} step={1000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="minOrderAmount" label="Đơn tối thiểu (VNĐ)">
              <InputNumber className="w-full rounded-lg" min={0} step={1000} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="usageLimit" label="Giới hạn lượt dùng">
              <InputNumber className="w-full rounded-lg" min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="isActive" label="Kích hoạt" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>

          <Form.Item
            name="range"
            label="Thời gian hiệu lực"
            rules={[{ required: true, message: 'Chọn thời gian bắt đầu' }]}
            extra="Bỏ trống ô kết thúc = không giới hạn"
          >
            <DatePicker.RangePicker
              showTime
              className="w-full rounded-lg"
              style={{ width: '100%' }}
              format="DD/MM/YYYY HH:mm"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Sửa mã giảm giá */}
      <Modal
        title={<span className="font-semibold">Sửa mã giảm giá</span>}
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingPromotion(null);
        }}
        onOk={handleSubmitEditPromotion}
        confirmLoading={editSubmitting}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        width={560}
        destroyOnHidden
      >
        {editingPromotion ? (
          <div className="mb-4 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Mã giảm giá (không thể đổi)</div>
            <div className="font-mono font-semibold text-indigo-600">{editingPromotion.couponCode}</div>
            <div className="mt-1 text-xs text-slate-500">
              Loại: <Text strong>{editingPromotion.discountType}</Text>
            </div>
          </div>
        ) : null}

        <Form form={editForm} layout="vertical" requiredMark="optional">
          <Form.Item
            name="title"
            label="Tiêu đề"
            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}
          >
            <Input placeholder="Giảm 10% toàn bộ đơn hàng" className="rounded-lg" />
          </Form.Item>
          <Form.Item
            name="discountValue"
            label="Giá trị giảm"
            rules={[{ required: true, message: 'Nhập giá trị' }]}
          >
            <InputNumber className="w-full rounded-lg" min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isActive" label="Kích hoạt" valuePropName="checked">
            <Switch />
          </Form.Item>
          <div className="text-xs text-slate-400">
            Backend chỉ hỗ trợ sửa Tiêu đề, Giá trị giảm và trạng thái Kích hoạt.
          </div>
        </Form>
      </Modal>

      {/* Modal Validate mã giảm giá */}
      <Modal
        title={<span className="font-semibold">Kiểm tra mã giảm giá</span>}
        open={validateModalOpen}
        onCancel={() => {
          setValidateModalOpen(false);
          setValidateResult(null);
        }}
        onOk={handleSubmitValidate}
        confirmLoading={validateSubmitting}
        okText="Kiểm tra"
        cancelText="Đóng"
        width={520}
        destroyOnHidden
      >
        <Form form={validateForm} layout="vertical" requiredMark="optional" className="mt-4">
          <Form.Item name="couponCode" label="Mã giảm giá" rules={[{ required: true, message: 'Nhập mã cần kiểm tra' }]}>
            <Input placeholder="SALE10" className="rounded-lg font-mono uppercase" />
          </Form.Item>
          <Form.Item name="orderAmount" label="Giá trị đơn hàng (VNĐ)" rules={[{ required: true, message: 'Nhập giá trị đơn' }]}>
            <InputNumber className="w-full rounded-lg" min={0} step={1000} style={{ width: '100%' }} />
          </Form.Item>
        </Form>

        {validateResult ? (
          <>
            <Divider className="!my-3" />
            <div
              className={`rounded-xl border p-4 ${
                validateResult.isValid
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Tag color={validateResult.isValid ? 'green' : 'red'} className="rounded-md font-semibold">
                  {validateResult.isValid ? 'HỢP LỆ' : 'KHÔNG HỢP LỆ'}
                </Tag>
                <span className="font-mono font-semibold text-slate-800">{validateResult.couponCode}</span>
              </div>
              {validateResult.isValid ? (
                <div className="space-y-1 text-sm">
                  <div>
                    Số tiền giảm:{' '}
                    <Text strong className="text-emerald-600">
                      {formatVnd(validateResult.discountAmount)}
                    </Text>
                  </div>
                  <div>
                    Thành tiền sau giảm: <Text strong>{formatVnd(validateResult.finalAmount)}</Text>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-red-600">{validateResult.reason || 'Mã không hợp lệ.'}</div>
              )}
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
