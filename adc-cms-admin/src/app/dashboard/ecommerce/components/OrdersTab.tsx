'use client';

import React, { useState } from 'react';
import {
  Table, Tag, Button, Modal, Form, Select, Space, Typography, message, Empty, Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/lib/api';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

/** Dòng đơn hàng (mock — backend chưa có GET danh sách Orders). */
export interface OrderRow {
  orderId: string;
  orderCode: string;
  customerName: string;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  createdAt: string;
}

interface OrderStatusFormValues {
  orderStatus?: string;
  paymentStatus?: string;
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

/** Mock data đơn hàng (thay bằng API GET khi backend bổ sung). */
const MOCK_ORDERS: OrderRow[] = [
  {
    orderId: '11111111-1111-1111-1111-111111111111',
    orderCode: 'ORD-20261027-0001',
    customerName: 'Nguyễn Văn A',
    totalAmount: 28990000,
    orderStatus: 'pending',
    paymentStatus: 'unpaid',
    paymentMethod: 'cod',
    createdAt: '2026-10-27T09:15:00+07:00',
  },
  {
    orderId: '22222222-2222-2222-2222-222222222222',
    orderCode: 'ORD-20261026-0002',
    customerName: 'Trần Thị B',
    totalAmount: 24500000,
    orderStatus: 'shipping',
    paymentStatus: 'paid',
    paymentMethod: 'vnpay',
    createdAt: '2026-10-26T14:40:00+07:00',
  },
  {
    orderId: '33333333-3333-3333-3333-333333333333',
    orderCode: 'ORD-20261025-0003',
    customerName: 'Lê Văn C',
    totalAmount: 15900000,
    orderStatus: 'completed',
    paymentStatus: 'paid',
    paymentMethod: 'momo',
    createdAt: '2026-10-25T20:05:00+07:00',
  },
];

/** Định dạng tiền VNĐ. */
function formatVnd(value: number): string {
  return `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
}

// ============================================================================
// Component
// ============================================================================

export default function OrdersTab() {
  const [orders, setOrders] = useState<OrderRow[]>(MOCK_ORDERS);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderRow | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderForm] = Form.useForm<OrderStatusFormValues>();

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
      await api.put(`/api/ecommerce/orders/${editingOrder.orderId}/status`, {
        orderStatus: values.orderStatus ?? null,
        paymentStatus: values.paymentStatus ?? null,
      });
      message.success('Cập nhật trạng thái đơn hàng thành công');
      // Cập nhật lại state cục bộ (mock) sau khi API thành công.
      setOrders((prev) =>
        prev.map((o) =>
          o.orderId === editingOrder.orderId
            ? {
                ...o,
                orderStatus: values.orderStatus ?? o.orderStatus,
                paymentStatus: values.paymentStatus ?? o.paymentStatus,
              }
            : o
        )
      );
      setOrderModalOpen(false);
      setEditingOrder(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Cập nhật trạng thái thất bại');
    } finally {
      setOrderSubmitting(false);
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
      dataIndex: 'customerName',
      key: 'customerName',
      render: (v: string) => <span className="font-semibold text-slate-800">{v}</span>,
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
      render: (v: string) => <span className="uppercase text-xs font-semibold text-slate-500">{v}</span>,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => <span className="text-slate-600">{dayjs(v).format('DD/MM/YYYY HH:mm')}</span>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 150,
      align: 'right',
      render: (_, record) => (
        <Button
          type="link"
          icon={<SyncOutlined />}
          className="font-medium"
          onClick={() => openUpdateOrderStatus(record)}
        >
          Cập nhật
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Alert
        type="info"
        showIcon
        message="Backend chưa có API GET danh sách đơn hàng — bảng đang dùng dữ liệu mock. Nút 'Cập nhật' gọi API thật PUT /api/ecommerce/orders/{orderId}/status."
        className="rounded-xl"
      />
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<OrderRow>
          rowKey="orderId"
          columns={orderColumns}
          dataSource={orders}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} đơn hàng` }}
          locale={{ emptyText: <Empty description="Chưa có đơn hàng nào" /> }}
        />
      </div>

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
              Khách hàng: <Text strong>{editingOrder.customerName}</Text>
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
    </div>
  );
}
