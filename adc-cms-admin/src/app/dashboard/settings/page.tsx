'use client';

import React, { useState } from 'react';
import { Tabs, Typography } from 'antd';
import type { TabsProps } from 'antd';
import { SettingOutlined, LinkOutlined, RobotOutlined } from '@ant-design/icons';
import SeoRedirectsTab from './components/SeoRedirectsTab';
import AiSettingsTab from './components/AiSettingsTab';

const { Title, Text } = Typography;

/**
 * Trang Cài đặt (Settings) - /dashboard/settings
 * ---------------------------------------------
 * 2 tab:
 *  - SEO Redirects: quản lý chuyển hướng 301/302/307/308.
 *  - AI Settings: cấu hình provider/model (read-only) + nút Test AI (mock).
 */
export default function SettingsPage() {
  const [activeKey, setActiveKey] = useState('seo-redirects');

  const items: TabsProps['items'] = [
    {
      key: 'seo-redirects',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <LinkOutlined />
          SEO Redirects
        </span>
      ),
      children: <SeoRedirectsTab />,
    },
    {
      key: 'ai-settings',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <RobotOutlined />
          AI Settings
        </span>
      ),
      children: <AiSettingsTab />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-800 flex items-center gap-2">
            <SettingOutlined className="text-indigo-600" />
            Cài đặt hệ thống
          </Title>
          <Text className="text-slate-500">
            Cấu hình SEO Redirects và các thiết lập trợ lý AI cho site hiện tại.
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
