'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Tag, Button, Modal, Input, Space, Typography, message, Empty, Alert, Descriptions,
  Avatar, Statistic, Row, Col, Card,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  TeamOutlined, ReloadOutlined, EyeOutlined, UserOutlined, PhoneOutlined, MailOutlined,
  ShoppingCartOutlined, DollarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

const { Title, Text } = Typography;

// ============================================================================
// Types (khớp DTO backend .NET)
// ============================================================================

/** GET /api/customers -> CustomerListItemDto */
interface CustomerRow {
  customerKey: string;
  isRegistered: boolean;
  userId?: string | null;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt?: string | null;
  firstOrderAt?: string | null;
}

/** GET /api/customers/{id} -> CustomerOrderDto */
interface CustomerOrder {
  id: string;
  orderCode: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  totalAmount: number;
  couponCode?: string | null;
  createdAt: string;
}

interface CustomerDetailResponse {
  customer: CustomerRow;
  orders: CustomerOrder[];
}

// ============================================================================
// Hằng số
// ============================================================================

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

/** Chuẩn hóa response danh sách khách hàng về CustomerRow[] an toàn. */
function toCustomerArray(data: unknown): CustomerRow[] {
  if (Array.isArray(data)) return data as CustomerRow[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'customers', 'data', 'result']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as CustomerRow[];
    }
  }
  return [];
}

// ============================================================================
// Component
// ============================================================================

export default function CustomersPage() {
  const siteId = useAuthStore((state) => state.siteId);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  // Modal chi tiết
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);

  /** Tải danh sách khách hàng (GET /api/customers). */
  const loadCustomers = useCallback(
    async (kw?: string) => {
      if (!siteId) return;
      setLoading(true);
      try {
        const res = await api.get<unknown>('/api/customers', {
          params: { siteId, keyword: kw?.trim() || undefined },
        });
        setCustomers(toCustomerArray(res.data));
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } } };
        message.error(e?.response?.data?.error || 'Không tải được danh sách khách hàng');
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    },
    [siteId]
  );

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  /** Mở Modal xem chi tiết khách (GET /api/customers/{id}). */
  const openDetail = async (record: CustomerRow) => {
    if (!siteId) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api.get<CustomerDetailResponse>(
        `/api/customers/${encodeURIComponent(record.customerKey)}`,
        { params: { siteId } }
      );
      setDetail(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được chi tiết khách hàng');
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ColumnsType<CustomerRow> = [
    {
      title: 'Khách hàng',
      key: 'customer',
      render: (_, record) => (
        <Space size="middle">
          <Avatar style={{ backgroundColor: '#dbeafe', color: '#2563eb', fontWeight: 'bold' }}>
            {record.fullName.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div className="font-semibold text-slate-800">{record.fullName}</div>
            <div className="text-xs text-slate-500">
              {record.isRegistered ? (
                <Tag color="purple" className="rounded-md">Có tài khoản</Tag>
              ) : (
                <Tag color="default" className="rounded-md">Khách vãng lai</Tag>
              )}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Liên hệ',
      key: 'contact',
      render: (_, record) => (
        <div className="text-sm">
          {record.phone ? (
            <div className="flex items-center gap-1 text-slate-700">
              <PhoneOutlined className="text-slate-400" /> {record.phone}
            </div>
          ) : null}
          {record.email ? (
            <div className="flex items-center gap-1 text-slate-500 text-xs">
              <MailOutlined className="text-slate-400" /> {record.email}
            </div>
          ) : null}
          {!record.phone && !record.email ? <span className="text-slate-400">—</span> : null}
        </div>
      ),
    },
    {
      title: 'Số đơn',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 100,
      align: 'center',
      render: (v: number) => <span className="font-semibold text-slate-800">{v}</span>,
    },
    {
      title: 'Tổng chi tiêu',
      dataIndex: 'totalSpent',
      key: 'totalSpent',
      width: 160,
      align: 'right',
      responsive: ['md'],
      render: (v: number) => <span className="font-semibold text-emerald-600">{formatVnd(v)}</span>,
    },
    {
      title: 'Mua gần nhất',
      dataIndex: 'lastOrderAt',
      key: 'lastOrderAt',
      width: 170,
      responsive: ['lg'],
      render: (v?: string | null) =>
        v ? <span className="text-slate-600">{dayjs(v).format('DD/MM/YYYY HH:mm')}</span> : <span className="text-slate-400">—</span>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 130,
      align: 'right',
      render: (_, record) => (
        <Button type="link" icon={<EyeOutlined />} className="font-medium" onClick={() => openDetail(record)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  const orderColumns: ColumnsType<CustomerOrder> = [
    {
      title: 'Mã đơn',
      dataIndex: 'orderCode',
      key: 'orderCode',
      render: (v: string) => <span className="font-mono text-sm font-semibold text-indigo-600">{v}</span>,
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 150,
      align: 'right',
      render: (v: number) => <span className="font-semibold text-slate-800">{formatVnd(v)}</span>,
    },
    {
      title: 'Trạng thái đơn',
      dataIndex: 'orderStatus',
      key: 'orderStatus',
      width: 140,
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
      width: 130,
      render: (v: string) => (
        <Tag color={PAYMENT_STATUS_COLOR[v] ?? 'default'} className="rounded-md capitalize">
          {v}
        </Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (v: string) => <span className="text-slate-600">{dayjs(v).format('DD/MM/YYYY HH:mm')}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-800 flex items-center gap-2">
            <TeamOutlined className="text-indigo-600" />
            Quản lý Khách hàng
          </Title>
          <Text className="text-slate-500">
            Danh sách khách hàng tổng hợp từ đơn hàng (khách có tài khoản và khách vãng lai).
          </Text>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        message="Dữ liệu tải từ GET /api/customers. Nút 'Chi tiết' gọi GET /api/customers/{id} để xem thông tin liên hệ và lịch sử mua hàng."
        className="rounded-xl"
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <Space wrap size="middle" className="w-full">
          <Input.Search
            placeholder="Tìm theo tên, SĐT, email..."
            allowClear
            enterButton
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => loadCustomers(v)}
            style={{ width: 360 }}
            className="rounded-lg"
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadCustomers(keyword)} loading={loading} className="rounded-lg">
            Tải lại
          </Button>
        </Space>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<CustomerRow>
          rowKey="customerKey"
          columns={columns}
          dataSource={Array.isArray(customers) ? customers : []}
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} khách hàng` }}
          locale={{ emptyText: <Empty description="Chưa có khách hàng nào" /> }}
        />
      </div>

      {/* Modal chi tiết khách hàng */}
      <Modal
        title={<span className="font-semibold">Chi tiết khách hàng</span>}
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        footer={null}
        width={860}
        loading={detailLoading}
        destroyOnHidden
      >
        {detail ? (
          <div className="space-y-4">
            {/* Thống kê nhanh */}
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small" className="rounded-xl border-slate-200">
                  <Statistic
                    title="Số đơn hàng"
                    value={detail.customer.orderCount}
                    prefix={<ShoppingCartOutlined className="text-indigo-500" />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" className="rounded-xl border-slate-200">
                  <Statistic
                    title="Tổng chi tiêu"
                    value={detail.customer.totalSpent}
                    formatter={(v) => formatVnd(Number(v))}
                    prefix={<DollarOutlined className="text-emerald-500" />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" className="rounded-xl border-slate-200">
                  <Statistic
                    title="Mua gần nhất"
                    value={
                      detail.customer.lastOrderAt
                        ? dayjs(detail.customer.lastOrderAt).format('DD/MM/YYYY')
                        : '—'
                    }
                  />
                </Card>
              </Col>
            </Row>

            {/* Thông tin liên hệ */}
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Họ tên" span={2}>
                <Space>
                  <UserOutlined className="text-slate-400" />
                  <Text strong>{detail.customer.fullName}</Text>
                  {detail.customer.isRegistered ? (
                    <Tag color="purple" className="rounded-md">Có tài khoản</Tag>
                  ) : (
                    <Tag color="default" className="rounded-md">Khách vãng lai</Tag>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Số điện thoại">
                {detail.customer.phone || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {detail.customer.email || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Địa chỉ" span={2}>
                {detail.customer.address || '—'}
              </Descriptions.Item>
            </Descriptions>

            {/* Lịch sử đơn hàng */}
            <div>
              <div className="text-sm font-semibold text-slate-700 mb-2">Lịch sử mua hàng</div>
              <Table<CustomerOrder>
                rowKey="id"
                size="small"
                columns={orderColumns}
                dataSource={Array.isArray(detail.orders) ? detail.orders : []}
                pagination={false}
                scroll={{ x: 700 }}
                locale={{ emptyText: <Empty description="Khách hàng chưa có đơn hàng" /> }}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
