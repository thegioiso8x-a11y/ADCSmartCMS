'use client';

import React, { useState } from 'react';
import { Tabs, Typography } from 'antd';
import type { TabsProps } from 'antd';
import {
  ShoppingCartOutlined, BarcodeOutlined, TagsOutlined,
} from '@ant-design/icons';
import OrdersTab from './components/OrdersTab';
import VariantsTab from './components/VariantsTab';
import PromotionsTab from './components/PromotionsTab';

const { Title, Text } = Typography;

/**
 * Trang Quản lý Thương mại điện tử (/dashboard/ecommerce)
 * ------------------------------------------------------
 * Gồm 3 tab tách riêng component để dễ bảo trì:
 *  - Orders:     danh sách đơn hàng (mock) + cập nhật trạng thái (API thật).
 *  - Variants:   chọn Content Type → Entry → quản lý biến thể SKU (API thật).
 *  - Promotions: mã giảm giá (mock list) + tạo mới + validate (API thật).
 */
export default function EcommercePage() {
  const [activeKey, setActiveKey] = useState('orders');

  const items: TabsProps['items'] = [
    {
      key: 'orders',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <ShoppingCartOutlined />
          Đơn hàng
        </span>
      ),
      children: <OrdersTab />,
    },
    {
      key: 'variants',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <BarcodeOutlined />
          Biến thể (SKU)
        </span>
      ),
      children: <VariantsTab />,
    },
    {
      key: 'promotions',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <TagsOutlined />
          Mã giảm giá
        </span>
      ),
      children: <PromotionsTab />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-800 flex items-center gap-2">
            <ShoppingCartOutlined className="text-indigo-600" />
            Thương mại điện tử
          </Title>
          <Text className="text-slate-500">
            Quản lý đơn hàng, biến thể sản phẩm (SKU) và mã giảm giá của site hiện tại.
          </Text>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={items}
          destroyOnHidden
          size="large"
        />
      </div>
    </div>
  );
}
