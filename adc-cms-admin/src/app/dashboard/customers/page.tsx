'use client';

import React from 'react';
import { Result } from 'antd';
import { TeamOutlined } from '@ant-design/icons';

/** Placeholder - Quản lý Khách hàng (đang phát triển). */
export default function CustomersPage() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <Result
        icon={<TeamOutlined className="text-indigo-500" />}
        title="Tính năng đang phát triển"
        subTitle="Phân hệ quản lý khách hàng (CRM) sẽ sớm được cập nhật."
      />
    </div>
  );
}
