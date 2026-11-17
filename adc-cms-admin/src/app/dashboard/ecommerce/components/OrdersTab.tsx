'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Tag, Button, Modal, Form, Select, Space, Typography, message, Empty, Alert, Descriptions,
  Input, InputNumber, Divider, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SyncOutlined, ReloadOutlined, EyeOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { ContentType, FilteredEntry, FilterEntriesResponse } from '@/lib/types';

const { Text } = Typography;

// ============================================================================
// Types (khớp DTO backend .NET)
// ============================================================================

/** GET /api/ecommerce/orders -> OrderListItemDto */
export interface OrderRow {
  id: string;
  siteId: string;
  orderCode: string;
  customerId?: string | null;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingInfo: string;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  couponCode?: string | null;
  customerNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/ecommerce/orders/{orderId} -> OrderItemDetailDto */
interface OrderItemDetail {
  id: number;
  orderId: string;
  entryId: string;
  variantId: string;
  productTitle: string;
  skuCode: string;
  variantLabel?: string | null;
  thumbnailUrl?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface OrderDetailResponse {
  order: OrderRow;
  items: OrderItemDetail[];
}

interface OrderStatusFormValues {
  orderStatus?: string;
  paymentStatus?: string;
}

/** GET /api/ecommerce/variants -> VariantDto (rút gọn cho chọn sản phẩm) */
interface VariantOption {
  id: string;
  skuCode: string;
  price: number;
  salePrice: number;
  stockQuantity: number;
  isActive: boolean;
  variantOptions: string;
}

/** Một dòng hàng trong form tạo đơn. */
interface OrderLineDraft {
  key: string;
  variantId: string;
  label: string;
  unitPrice: number;
  quantity: number;
}

interface CreateOrderFormValues {
  fullName: string;
  phone: string;
  address: string;
  couponCode?: string;
  paymentMethod: string;
  shippingFee: number;
  customerNote?: string;
}

// ============================================================================
// Hằng số
// ============================================================================

const ORDER_STATUS_OPTIONS = [
  { label: 'pending', value: 'pending' },
  { label: 'confirmed', value: 'confirmed' },
  { label: 'processing', value: 'processing' },
  { label: 'shipping', value: 'shipping' },
  { label: 'completed', value: 'completed' },
  { label: 'cancelled', value: 'cancelled' },
];

const PAYMENT_STATUS_OPTIONS = [
  { label: 'unpaid', value: 'unpaid' },
  { label: 'paid', value: 'paid' },
  { label: 'refunded', value: 'refunded' },
];

const PAYMENT_METHOD_OPTIONS = [
  { label: 'COD (Thanh toán khi nhận hàng)', value: 'cod' },
  { label: 'VNPay', value: 'vnpay' },
  { label: 'MoMo', value: 'momo' },
  { label: 'VietQR', value: 'vietqr' },
];

const ORDER_STATUS_COLOR: Record<string, string> = {
  pending: 'gold',
  confirmed: 'blue',
  processing: 'geekblue',
  shipping: 'cyan',
  completed: 'green',
  cancelled: 'red',
};

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  unpaid: 'orange',
  paid: 'green',
  refunded: 'purple',
};

// ============================================================================
// Helpers
// ============================================================================

/** Định dạng tiền VNĐ. */
function formatVnd(value: number): string {
  return `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
}

/** Chuẩn hóa response danh sách đơn hàng về OrderRow[] an toàn. */
function toOrderArray(data: unknown): OrderRow[] {
  if (Array.isArray(data)) return data as OrderRow[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'orders', 'data', 'result']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as OrderRow[];
    }
  }
  return [];
}

/** Lấy tên khách hàng từ shippingInfo (JSON object). */
function getCustomerName(shippingInfo: string): string {
  if (!shippingInfo) return '—';
  try {
    const parsed: unknown = JSON.parse(shippingInfo);
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      for (const key of ['fullName', 'full_name', 'name', 'customerName']) {
        const v = obj[key];
        if (typeof v === 'string' && v.trim()) return v;
      }
    }
  } catch {
    // shippingInfo không phải JSON hợp lệ -> bỏ qua.
  }
  return '—';
}

/** Chuẩn hóa response danh sách variant về VariantOption[] an toàn. */
function toVariantArray(data: unknown): VariantOption[] {
  if (Array.isArray(data)) return data as VariantOption[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'variants', 'data', 'result']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as VariantOption[];
    }
  }
  return [];
}

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

// ============================================================================
// Component
// ============================================================================

export default function OrdersTab() {
  const siteId = useAuthStore((state) => state.siteId);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderRow | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderForm] = Form.useForm<OrderStatusFormValues>();

  // Modal chi tiết đơn
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<OrderDetailResponse | null>(null);

  // ----- Modal Tạo đơn hàng -----
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm<CreateOrderFormValues>();

  // Chọn sản phẩm: Content Type -> Entry -> Variant
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<FilteredEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);
  const [selectedQty, setSelectedQty] = useState<number>(1);

  // Danh sách dòng hàng đã thêm
  const [lines, setLines] = useState<OrderLineDraft[]>([]);

  /** Tải danh sách đơn hàng (GET /api/ecommerce/orders). */
  const loadOrders = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await api.get<unknown>('/api/ecommerce/orders', { params: { siteId } });
      setOrders(toOrderArray(res.data));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách đơn hàng');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  /** Mở Modal xem chi tiết đơn (GET /api/ecommerce/orders/{orderId}). */
  const openDetail = async (record: OrderRow) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api.get<OrderDetailResponse>(`/api/ecommerce/orders/${record.id}`);
      setDetail(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được chi tiết đơn hàng');
    } finally {
      setDetailLoading(false);
    }
  };

  /** Mở Modal cập nhật trạng thái đơn hàng. */
  const openUpdateOrderStatus = (record: OrderRow) => {
    setEditingOrder(record);
    orderForm.setFieldsValue({
      orderStatus: record.orderStatus,
      paymentStatus: record.paymentStatus,
    });
    setOrderModalOpen(true);
  };

  /** Submit cập nhật trạng thái đơn hàng (PUT /api/ecommerce/orders/{orderId}/status). */
  const handleSubmitOrderStatus = async () => {
    if (!editingOrder) return;
    let values: OrderStatusFormValues;
    try {
      values = await orderForm.validateFields();
    } catch {
      return;
    }
    if (!values.orderStatus && !values.paymentStatus) {
      message.warning('Cần chọn ít nhất trạng thái đơn hoặc trạng thái thanh toán.');
      return;
    }

    setOrderSubmitting(true);
    try {
      await api.put(`/api/ecommerce/orders/${editingOrder.id}/status`, {
        orderStatus: values.orderStatus ?? null,
        paymentStatus: values.paymentStatus ?? null,
      });
      message.success('Cập nhật trạng thái đơn hàng thành công');
      setOrderModalOpen(false);
      setEditingOrder(null);
      await loadOrders();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Cập nhật trạng thái thất bại');
    } finally {
      setOrderSubmitting(false);
    }
  };

  /** Tải danh sách Content Type (chỉ khi mở Modal tạo đơn lần đầu). */
  const loadContentTypes = useCallback(async () => {
    if (!siteId) return;
    try {
      const res = await api.get<unknown>('/api/content-types', { params: { siteId } });
      setContentTypes(toContentTypeArray(res.data));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách Content Types');
    }
  }, [siteId]);

  /** Tải Entry theo Content Type đã chọn. */
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
        message.error(e?.response?.data?.error || 'Không tải được danh sách sản phẩm');
        setEntries([]);
      } finally {
        setEntriesLoading(false);
      }
    },
    [siteId]
  );

  /** Tải Variant của Entry đã chọn. */
  const loadVariants = useCallback(async (entryId: string) => {
    setVariantsLoading(true);
    try {
      const res = await api.get<unknown>('/api/ecommerce/variants', { params: { entryId } });
      setVariants(toVariantArray(res.data));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách biến thể');
      setVariants([]);
    } finally {
      setVariantsLoading(false);
    }
  }, []);

  /** Mở Modal tạo đơn hàng. */
  const openCreateOrder = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ paymentMethod: 'cod', shippingFee: 0 });
    setLines([]);
    setSelectedType(undefined);
    setSelectedEntryId(undefined);
    setSelectedVariantId(undefined);
    setSelectedQty(1);
    setEntries([]);
    setVariants([]);
    setCreateOpen(true);
    if (contentTypes.length === 0) loadContentTypes();
  };

  /** Thêm 1 dòng hàng vào đơn. */
  const handleAddLine = () => {
    if (!selectedVariantId) {
      message.warning('Vui lòng chọn biến thể sản phẩm.');
      return;
    }
    if (!selectedQty || selectedQty <= 0) {
      message.warning('Số lượng phải lớn hơn 0.');
      return;
    }
    const variant = variants.find((v) => v.id === selectedVariantId);
    if (!variant) return;

    if (lines.some((l) => l.variantId === variant.id)) {
      message.warning('Biến thể này đã có trong đơn. Vui lòng xóa dòng cũ trước khi thêm lại.');
      return;
    }

    const unitPrice = variant.salePrice > 0 ? variant.salePrice : variant.price;
    setLines((prev) => [
      ...prev,
      {
        key: variant.id,
        variantId: variant.id,
        label: `${variant.skuCode} — ${formatVnd(unitPrice)}`,
        unitPrice,
        quantity: selectedQty,
      },
    ]);
    setSelectedVariantId(undefined);
    setSelectedQty(1);
  };

  /** Xóa 1 dòng hàng. */
  const handleRemoveLine = (variantId: string) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  };

  /** Tổng tạm tính của các dòng hàng. */
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  /** Submit tạo đơn hàng (POST /api/ecommerce/orders). */
  const handleCreateOrder = async () => {
    if (!siteId) return;
    if (lines.length === 0) {
      message.warning('Đơn hàng phải có ít nhất 1 sản phẩm.');
      return;
    }

    let values: CreateOrderFormValues;
    try {
      values = await createForm.validateFields();
    } catch {
      return;
    }

    setCreating(true);
    try {
      await api.post('/api/ecommerce/orders', {
        siteId,
        customerId: null,
        shippingInfo: {
          fullName: values.fullName.trim(),
          phone: values.phone.trim(),
          address: values.address.trim(),
        },
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        couponCode: values.couponCode?.trim() || null,
        paymentMethod: values.paymentMethod,
        shippingFee: values.shippingFee ?? 0,
        taxAmount: 0,
        customerNote: values.customerNote?.trim() || null,
      });
      message.success('Tạo đơn hàng thành công');
      setCreateOpen(false);
      await loadOrders();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      if (e?.response?.status === 409) {
        message.error(e?.response?.data?.error || 'Không đủ tồn kho để tạo đơn hàng.');
      } else if (e?.response?.status === 404) {
        message.error(e?.response?.data?.error || 'Biến thể sản phẩm không tồn tại.');
      } else {
        message.error(e?.response?.data?.error || 'Tạo đơn hàng thất bại');
      }
    } finally {
      setCreating(false);
    }
  };

  /** Xóa đơn hàng (DELETE /api/ecommerce/orders/{orderId}). */
  const handleDeleteOrder = async (record: OrderRow) => {
    try {
      await api.delete(`/api/ecommerce/orders/${record.id}`);
      message.success('Đã xóa đơn hàng');
      await loadOrders();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa đơn hàng thất bại');
    }
  };

  const orderColumns: ColumnsType<OrderRow> = [
    {
      title: 'Mã đơn',
      dataIndex: 'orderCode',
      key: 'orderCode',
      width: 200,
      render: (v: string) => <span className="font-mono text-sm font-semibold text-indigo-600">{v}</span>,
    },
    {
      title: 'Khách hàng',
      dataIndex: 'shippingInfo',
      key: 'shippingInfo',
      render: (v: string) => <span className="font-semibold text-slate-800">{getCustomerName(v)}</span>,
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 160,
      align: 'right',
      render: (v: number) => <span className="font-semibold text-slate-800">{formatVnd(v)}</span>,
    },
    {
      title: 'Trạng thái đơn',
      dataIndex: 'orderStatus',
      key: 'orderStatus',
      width: 150,
      render: (v: string) => (
        <Tag color={ORDER_STATUS_COLOR[v] ?? 'default'} className="rounded-md capitalize">
          {v}
        </Tag>
      ),
    },
    {
      title: 'Thanh toán',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 140,
      render: (v: string) => (
        <Tag color={PAYMENT_STATUS_COLOR[v] ?? 'default'} className="rounded-md capitalize">
          {v}
        </Tag>
      ),
    },
    {
      title: 'PT thanh toán',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      width: 130,
      responsive: ['lg'],
      render: (v: string) => <span className="uppercase text-xs font-semibold text-slate-500">{v}</span>,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      responsive: ['md'],
      render: (v: string) => <span className="text-slate-600">{dayjs(v).format('DD/MM/YYYY HH:mm')}</span>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 280,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} className="font-medium" onClick={() => openDetail(record)}>
            Chi tiết
          </Button>
          <Button
            type="link"
            icon={<SyncOutlined />}
            className="font-medium"
            onClick={() => openUpdateOrderStatus(record)}
          >
            Cập nhật
          </Button>
          <Popconfirm
            title="Xóa đơn hàng này?"
            description="Toàn bộ dòng sản phẩm trong đơn cũng sẽ bị xóa."
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteOrder(record)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} className="font-medium">
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const detailItemColumns: ColumnsType<OrderItemDetail> = [
    {
      title: 'Sản phẩm',
      dataIndex: 'productTitle',
      key: 'productTitle',
      render: (v: string, record) => (
        <div>
          <div className="font-semibold text-slate-800">{v}</div>
          <div className="text-xs text-slate-500 font-mono">{record.skuCode}</div>
        </div>
      ),
    },
    {
      title: 'SL',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'center',
    },
    {
      title: 'Đơn giá',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 130,
      align: 'right',
      render: (v: number) => formatVnd(v),
    },
    {
      title: 'Thành tiền',
      dataIndex: 'totalPrice',
      key: 'totalPrice',
      width: 140,
      align: 'right',
      render: (v: number) => <span className="font-semibold">{formatVnd(v)}</span>,
    },
  ];

  const lineColumns: ColumnsType<OrderLineDraft> = [
    {
      title: 'Sản phẩm',
      dataIndex: 'label',
      key: 'label',
      render: (v: string) => <span className="font-mono text-sm text-slate-800">{v}</span>,
    },
    {
      title: 'SL',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'center',
    },
    {
      title: 'Thành tiền',
      key: 'total',
      width: 140,
      align: 'right',
      render: (_, record) => (
        <span className="font-semibold">{formatVnd(record.unitPrice * record.quantity)}</span>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 60,
      align: 'right',
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveLine(record.variantId)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Alert
        type="info"
        showIcon
        message="Danh sách đơn hàng tải từ GET /api/ecommerce/orders. Nút 'Chi tiết' gọi GET /api/ecommerce/orders/{orderId}, 'Cập nhật' gọi PUT /api/ecommerce/orders/{orderId}/status."
        className="rounded-xl"
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <Space wrap size="middle" className="w-full">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateOrder}
            className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
          >
            Tạo đơn hàng
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadOrders} loading={loading} className="rounded-lg">
            Tải lại
          </Button>
        </Space>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<OrderRow>
          rowKey="id"
          columns={orderColumns}
          dataSource={Array.isArray(orders) ? orders : []}
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} đơn hàng` }}
          locale={{ emptyText: <Empty description="Chưa có đơn hàng nào" /> }}
        />
      </div>

      {/* Modal chi tiết đơn hàng */}
      <Modal
        title={<span className="font-semibold">Chi tiết đơn hàng</span>}
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        footer={null}
        width={820}
        loading={detailLoading}
        destroyOnHidden
      >
        {detail ? (
          <div className="space-y-4">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Mã đơn">
                <span className="font-mono font-semibold text-indigo-600">{detail.order.orderCode}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Khách hàng">
                {getCustomerName(detail.order.shippingInfo)}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái đơn">
                <Tag color={ORDER_STATUS_COLOR[detail.order.orderStatus] ?? 'default'} className="rounded-md capitalize">
                  {detail.order.orderStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Thanh toán">
                <Tag color={PAYMENT_STATUS_COLOR[detail.order.paymentStatus] ?? 'default'} className="rounded-md capitalize">
                  {detail.order.paymentStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tạm tính">{formatVnd(detail.order.subtotalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Giảm giá">{formatVnd(detail.order.discountAmount)}</Descriptions.Item>
              <Descriptions.Item label="Phí ship">{formatVnd(detail.order.shippingFee)}</Descriptions.Item>
              <Descriptions.Item label="Thuế">{formatVnd(detail.order.taxAmount)}</Descriptions.Item>
              <Descriptions.Item label="Tổng cộng" span={2}>
                <Text strong className="text-emerald-600">{formatVnd(detail.order.totalAmount)}</Text>
              </Descriptions.Item>
              {detail.order.couponCode ? (
                <Descriptions.Item label="Mã giảm giá" span={2}>
                  <span className="font-mono">{detail.order.couponCode}</span>
                </Descriptions.Item>
              ) : null}
            </Descriptions>

            <Table<OrderItemDetail>
              rowKey="id"
              size="small"
              columns={detailItemColumns}
              dataSource={Array.isArray(detail.items) ? detail.items : []}
              pagination={false}
              locale={{ emptyText: <Empty description="Đơn hàng không có dòng sản phẩm" /> }}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        title={<span className="font-semibold">Cập nhật trạng thái đơn hàng</span>}
        open={orderModalOpen}
        onCancel={() => {
          setOrderModalOpen(false);
          setEditingOrder(null);
        }}
        onOk={handleSubmitOrderStatus}
        confirmLoading={orderSubmitting}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        destroyOnHidden
      >
        {editingOrder ? (
          <div className="mb-4 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Mã đơn</div>
            <div className="font-mono font-semibold text-indigo-600">{editingOrder.orderCode}</div>
            <div className="mt-1 text-xs text-slate-500">
              Khách hàng: <Text strong>{getCustomerName(editingOrder.shippingInfo)}</Text>
            </div>
          </div>
        ) : null}

        <Form form={orderForm} layout="vertical" requiredMark="optional">
          <Form.Item name="orderStatus" label="Trạng thái đơn hàng">
            <Select options={ORDER_STATUS_OPTIONS} className="w-full" allowClear placeholder="Giữ nguyên" />
          </Form.Item>
          <Form.Item name="paymentStatus" label="Trạng thái thanh toán">
            <Select options={PAYMENT_STATUS_OPTIONS} className="w-full" allowClear placeholder="Giữ nguyên" />
          </Form.Item>
          <Space className="text-xs text-slate-400">
            Để trống trường nào thì backend giữ nguyên giá trị cũ của trường đó.
          </Space>
        </Form>
      </Modal>

      {/* Modal Tạo đơn hàng */}
      <Modal
        title={<span className="font-semibold">Tạo đơn hàng mới</span>}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreateOrder}
        confirmLoading={creating}
        okText="Tạo đơn hàng"
        cancelText="Hủy"
        width={860}
        destroyOnHidden
      >
        <div className="space-y-4 mt-4">
          {/* Chọn sản phẩm */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">Chọn sản phẩm</div>
            <Space wrap size="middle" className="w-full">
              <Select
                placeholder="Content Type"
                style={{ minWidth: 200 }}
                value={selectedType}
                onChange={(v) => {
                  setSelectedType(v);
                  setSelectedEntryId(undefined);
                  setSelectedVariantId(undefined);
                  setEntries([]);
                  setVariants([]);
                  if (v) loadEntries(v);
                }}
                options={contentTypes.map((ct) => ({
                  label: `${ct.displayName} (${ct.apiId})`,
                  value: ct.apiId,
                }))}
                showSearch
                optionFilterProp="label"
                allowClear
              />
              <Select
                placeholder="Sản phẩm (Entry)"
                style={{ minWidth: 240 }}
                value={selectedEntryId}
                onChange={(v) => {
                  setSelectedEntryId(v);
                  setSelectedVariantId(undefined);
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
              <Select
                placeholder="Biến thể (SKU)"
                style={{ minWidth: 240 }}
                value={selectedVariantId}
                onChange={setSelectedVariantId}
                options={variants
                  .filter((v) => v.isActive)
                  .map((v) => ({
                    label: `${v.skuCode} — ${formatVnd(v.salePrice > 0 ? v.salePrice : v.price)} (tồn ${v.stockQuantity})`,
                    value: v.id,
                  }))}
                loading={variantsLoading}
                disabled={!selectedEntryId}
                showSearch
                optionFilterProp="label"
                allowClear
              />
              <InputNumber
                min={1}
                value={selectedQty}
                onChange={(v) => setSelectedQty(typeof v === 'number' ? v : 1)}
                style={{ width: 100 }}
                placeholder="SL"
              />
              <Button icon={<PlusOutlined />} onClick={handleAddLine} disabled={!selectedVariantId}>
                Thêm
              </Button>
            </Space>
          </div>

          {/* Danh sách dòng hàng */}
          <Table<OrderLineDraft>
            rowKey="key"
            size="small"
            columns={lineColumns}
            dataSource={lines}
            pagination={false}
            locale={{ emptyText: <Empty description="Chưa có sản phẩm nào trong đơn" /> }}
          />

          <div className="text-right text-sm">
            Tạm tính: <Text strong className="text-slate-800">{formatVnd(subtotal)}</Text>
          </div>

          <Divider className="!my-2" />

          {/* Thông tin khách hàng & thanh toán */}
          <Form form={createForm} layout="vertical" requiredMark="optional">
            <div className="grid grid-cols-2 gap-x-4">
              <Form.Item
                name="fullName"
                label="Tên khách hàng"
                rules={[{ required: true, message: 'Vui lòng nhập tên khách hàng' }]}
              >
                <Input placeholder="Nguyễn Văn A" className="rounded-lg" />
              </Form.Item>
              <Form.Item
                name="phone"
                label="Số điện thoại"
                rules={[{ required: true, message: 'Vui lòng nhập số điện thoại' }]}
              >
                <Input placeholder="0901234567" className="rounded-lg" />
              </Form.Item>
            </div>

            <Form.Item
              name="address"
              label="Địa chỉ giao hàng"
              rules={[{ required: true, message: 'Vui lòng nhập địa chỉ' }]}
            >
              <Input placeholder="Số nhà, đường, phường, quận, tỉnh/thành" className="rounded-lg" />
            </Form.Item>

            <div className="grid grid-cols-3 gap-x-4">
              <Form.Item name="couponCode" label="Mã giảm giá">
                <Input placeholder="SALE10" className="rounded-lg font-mono uppercase" />
              </Form.Item>
              <Form.Item name="paymentMethod" label="Phương thức thanh toán">
                <Select options={PAYMENT_METHOD_OPTIONS} className="w-full" />
              </Form.Item>
              <Form.Item name="shippingFee" label="Phí vận chuyển (VNĐ)">
                <InputNumber className="w-full rounded-lg" min={0} step={1000} style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <Form.Item name="customerNote" label="Ghi chú">
              <Input.TextArea rows={2} placeholder="Ghi chú của khách hàng..." className="rounded-lg" />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  );
}
