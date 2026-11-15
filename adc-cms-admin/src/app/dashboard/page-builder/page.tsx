'use client';

import React from 'react';
import { Result } from 'antd';
import { BuildOutlined } from '@ant-design/icons';

/** Placeholder - Page Builder (đang phát triển). */
export default function PageBuilderPage() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <Result
        icon={<BuildOutlined className="text-indigo-500" />}
        title="Tính năng đang phát triển"
        subTitle="Trình dựng trang kéo-thả (Visual Block / Dynamic Zone Builder) sẽ sớm được cập nhật."
      />
    </div>
  );
}
