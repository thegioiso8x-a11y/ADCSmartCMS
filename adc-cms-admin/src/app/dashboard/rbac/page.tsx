'use client';

import React, { useState } from 'react';
import { Tabs, Typography } from 'antd';
import type { TabsProps } from 'antd';
import { SafetyCertificateOutlined, TeamOutlined, KeyOutlined } from '@ant-design/icons';
import RolesTab from './components/RolesTab';
import UsersTab from './components/UsersTab';

const { Title, Text } = Typography;

/**
 * Trang Phân quyền (RBAC) - /dashboard/rbac
 * ----------------------------------------
 * 2 tab:
 *  - Roles: danh sách role (toàn hệ thống + của site), tạo/xóa role.
 *  - Users: danh sách user, gán/thu hồi role.
 */
export default function RbacPage() {
  const [activeKey, setActiveKey] = useState('roles');

  const items: TabsProps['items'] = [
    {
      key: 'roles',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <KeyOutlined />
          Roles
        </span>
      ),
      children: <RolesTab />,
    },
    {
      key: 'users',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <TeamOutlined />
          Users
        </span>
      ),
      children: <UsersTab />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-800 flex items-center gap-2">
            <SafetyCertificateOutlined className="text-indigo-600" />
            Phân quyền (RBAC)
          </Title>
          <Text className="text-slate-500">
            Quản lý Role và gán quyền cho người dùng theo mô hình phân quyền 4 cấp.
          </Text>
        </div>
      </div>

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
