'use client';

import React from 'react';
import { Result } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

/** Placeholder - Trợ giúp (đang phát triển). */
export default function HelpPage() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <Result
        icon={<QuestionCircleOutlined className="text-indigo-500" />}
        title="Tính năng đang phát triển"
        subTitle="Trung tâm trợ giúp và tài liệu hướng dẫn sẽ sớm được cập nhật."
      />
    </div>
  );
}
