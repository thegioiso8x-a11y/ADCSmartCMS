'use client';
import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Row, Col, Typography, message, Tag, Spin, Empty } from 'antd';
import { EyeOutlined, CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

export interface ThemeTemplate {
  id: string;
  templateKey: string;
  templateType: string;
  compiledHtml: string;
  extractedSchema: string;
  updatedAt: string;
}

const { Text } = Typography;

export default function TemplateViewer({ themeId }: { themeId?: string }) {
  const [templates, setTemplates] = useState<ThemeTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ThemeTemplate | null>(null);

  useEffect(() => {
    if (!themeId) return;
    setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/themes/${themeId}/templates`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } // tuỳ cơ chế auth của bạn
    })
      .then(res => res.json())
      .then(data => setTemplates(Array.isArray(data) ? data : data.items || []))
      .catch(() => message.error('Lỗi tải danh sách Templates'))
      .finally(() => setLoading(false));
  }, [themeId]);

  const copyHtml = () => {
    if (!selected) return;
    navigator.clipboard.writeText(selected.compiledHtml);
    message.success('Đã copy mã HTML Liquid');
  };

  if (!themeId) return null;

  return (
    <div className="mt-8 border-t border-slate-200 pt-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Danh sách Templates</h3>
      <Table<ThemeTemplate>
        dataSource={templates}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
        columns={[
          { title: 'Template Key', dataIndex: 'templateKey', render: (t) => <Text code>{t}</Text> },
          { title: 'Loại', dataIndex: 'templateType', render: (t) => <Tag color="blue">{t}</Tag> },
          { title: 'Cập nhật', dataIndex: 'updatedAt', render: (t) => dayjs(t).format('DD/MM/YYYY HH:mm') },
          { title: 'Hành động', render: (_, r) => (
            <Button type="link" icon={<EyeOutlined />} onClick={() => setSelected(r)}>Xem mã</Button>
          )}
        ]}
      />

      <Modal
        title={`Mã Template: ${selected?.templateKey || ''}`}
        open={!!selected}
        onCancel={() => setSelected(null)}
        width="90%"
        footer={[
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={copyHtml}>Copy mã HTML</Button>,
          <Button key="close" onClick={() => setSelected(null)}>Đóng</Button>
        ]}
      >
        <Row gutter={16}>
          <Col span={14}>
            <h4 className="font-semibold mb-2">Mã HTML Liquid</h4>
            <pre className="bg-slate-900 text-slate-200 p-4 rounded overflow-auto text-xs h-[60vh] whitespace-pre-wrap">
              {selected?.compiledHtml}
            </pre>
          </Col>
          <Col span={10}>
            <h4 className="font-semibold mb-2">JSON Schema</h4>
            <pre className="bg-slate-100 text-slate-800 p-4 rounded overflow-auto text-xs h-[60vh] whitespace-pre-wrap">
              {selected?.extractedSchema}
            </pre>
          </Col>
        </Row>
      </Modal>
    </div>
  );
}
