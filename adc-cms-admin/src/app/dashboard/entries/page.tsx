'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table, Tag, Button, Drawer, Typography, message, Input, Select, Space, Empty, Divider, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  FileTextOutlined, PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import DynamicFormWrapper from '@/components/DynamicFormWrapper';
import type { RJSFSchema } from '@rjsf/utils';
import type { ContentType, FieldDefinition, FilteredEntry, FilterEntriesResponse } from '@/lib/types';

const { Title, Text } = Typography;

const PAGE_SIZE = 10;

/** Màu Tag theo trạng thái workflow. */
const STATUS_COLOR: Record<string, string> = {
  draft: 'default',
  in_review: 'gold',
  approved: 'blue',
  scheduled: 'purple',
  published: 'green',
  archived: 'red',
};

/** Map field_type (backend) -> JSON Schema type cho RJSF. */
function mapFieldType(fieldType: string): { type: string; format?: string } {
  switch (fieldType) {
    case 'integer':
      return { type: 'integer' };
    case 'decimal':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'datetime':
      return { type: 'string', format: 'date-time' };
    case 'multi_select':
      return { type: 'array' };
    case 'enumeration':
      return { type: 'string' };
    case 'rich_text':
      // format 'rich_text' -> DynamicFormWrapper gán RichTextWidget (Tiptap).
      return { type: 'string', format: 'rich_text' };
    case 'media':
      // format 'media' -> DynamicFormWrapper gán MediaWidget (Modal chọn ảnh).
      return { type: 'string', format: 'media' };
    default:
      // string, text, relation, dynamic_zone...
      return { type: 'string' };
  }
}

/** Parse an toàn chuỗi JSON validation_rules -> Record. */
function parseValidationRules(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Áp validation_rules (min/max/minLength/maxLength/pattern) vào JSON Schema property. */
function applyValidationRules(prop: Record<string, unknown>, rules: Record<string, unknown>): void {
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

  const min = num(rules.min);
  const max = num(rules.max);
  const minLength = num(rules.minLength ?? rules.min_length);
  const maxLength = num(rules.maxLength ?? rules.max_length);
  const pattern = str(rules.pattern ?? rules.regex);

  if (min !== undefined) prop.minimum = min;
  if (max !== undefined) prop.maximum = max;
  if (minLength !== undefined) prop.minLength = minLength;
  if (maxLength !== undefined) prop.maxLength = maxLength;
  if (pattern !== undefined) prop.pattern = pattern;
}

/** Sinh JSON Schema cho RJSF từ danh sách FieldDefinition của Content Type. */
function buildSchema(fields: FieldDefinition[]): RJSFSchema {
  const properties: Record<string, Record<string, unknown>> = {
    // 2 trường cố định (không thuộc base_data) để map vào title/slug của entry.
    __title: { type: 'string', title: 'Tiêu đề (Title)' },
    __slug: { type: 'string', title: 'Đường dẫn (Slug)' },
  };
  const required: string[] = ['__title'];

  for (const f of fields) {
    const mapped = mapFieldType(f.fieldType);
    const prop: Record<string, unknown> = { title: f.displayLabel, ...mapped };
    if (mapped.type === 'array') {
      prop.items = { type: 'string' };
    }
    // Áp validation_rules từ cấu hình field (nếu có).
    applyValidationRules(prop, parseValidationRules(f.validationRules));
    properties[f.fieldKey] = prop;
    if (f.isRequired) required.push(f.fieldKey);
  }

  return { type: 'object', properties, required } as RJSFSchema;
}

/** Parse an toàn chuỗi JSON object -> Record (dùng khi nạp dữ liệu vào form Sửa). */
function parseJsonObject(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export default function EntriesPage() {
  const siteId = useAuthStore((state) => state.siteId);

  // ----- Bộ lọc -----
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');

  // ----- Bảng dữ liệu -----
  const [entries, setEntries] = useState<FilteredEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(1);
  const [loading, setLoading] = useState(false);

  // ----- Drawer (Thêm mới / Sửa) -----
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FilteredEntry | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /** Tải danh sách content type cho dropdown. */
  useEffect(() => {
    if (!siteId) return;
    (async () => {
      try {
        const res = await api.get<ContentType[]>('/api/content-types', { params: { siteId } });
        setContentTypes(res.data ?? []);
      } catch (err: any) {
        message.error(err?.response?.data?.error || 'Không tải được danh sách Content Types');
      }
    })();
  }, [siteId]);

  /** Gọi API lọc entries (phân trang). Luôn gọi khi mount, kể cả khi chưa chọn Content Type. */
  const loadEntries = useCallback(
    async (page = pageIndex) => {
      if (!siteId) {
        setEntries([]);
        setTotal(0);
        return;
      }
      setLoading(true);
      try {
        const res = await api.get<FilterEntriesResponse>('/api/entries/filter', {
          params: {
            siteId,
            // undefined => axios bỏ qua param trên URL => backend lấy toàn bộ content type.
            contentTypeApiId: selectedType || undefined,
            keyword: appliedKeyword || undefined,
            pageIndex: page,
            pageSize: PAGE_SIZE,
          },
        });
        const items = res.data?.items ?? [];
        setEntries(items);
        // SP trả total_records trên từng dòng; lấy dòng đầu tiên.
        setTotal(items.length > 0 ? Number(items[0].totalRecords ?? items.length) : 0);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } } };
        message.error(e?.response?.data?.error || 'Không tải được danh sách Entries');
        setEntries([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [siteId, selectedType, appliedKeyword, pageIndex]
  );

  useEffect(() => {
    loadEntries(pageIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, appliedKeyword, pageIndex]);

  /** Nút "Tìm kiếm": áp dụng keyword và reset về trang 1. */
  const handleSearch = () => {
    setAppliedKeyword(keyword.trim());
    setPageIndex(1);
  };

  /** Tải fields của content type đang chọn (dùng chung cho Thêm mới & Sửa). */
  const loadFields = useCallback(
    async (apiId: string) => {
      setFields([]);
      setFieldsLoading(true);
      try {
        const res = await api.get<FieldDefinition[]>(
          `/api/content-types/${encodeURIComponent(apiId)}/fields`,
          { params: { siteId } }
        );
        setFields(res.data ?? []);
      } catch (err: any) {
        message.error(err?.response?.data?.error || 'Không tải được Fields của Content Type');
      } finally {
        setFieldsLoading(false);
      }
    },
    [siteId]
  );

  /** Mở Drawer thêm mới. */
  const openCreate = async () => {
    if (!selectedType) return;
    setEditingEntry(null);
    setDrawerOpen(true);
    await loadFields(selectedType);
  };

  /** Mở Drawer sửa: nạp dữ liệu hiện tại của entry vào form. */
  const openEdit = async (record: FilteredEntry) => {
    if (!selectedType) return;
    setEditingEntry(record);
    setDrawerOpen(true);
    await loadFields(selectedType);
  };

  const schema = useMemo(() => buildSchema(fields), [fields]);

  /** Dữ liệu khởi tạo cho RJSF: khi Sửa thì map title/slug + base_data + localized_data. */
  const initialFormData = useMemo<Record<string, unknown> | undefined>(() => {
    if (!editingEntry) return undefined;
    return {
      __title: editingEntry.title ?? '',
      __slug: editingEntry.slug ?? '',
      ...parseJsonObject(editingEntry.baseData),
      ...parseJsonObject(editingEntry.localizedData),
    };
  }, [editingEntry]);

  /** Tách dữ liệu form thành baseData / localizedData theo cờ isLocalized của field. */
  const splitFormData = (data: Record<string, unknown>) => {
    const { __title, __slug, ...rest } = data;
    const localizedKeys = new Set(fields.filter((f) => f.isLocalized).map((f) => f.fieldKey));
    const baseData: Record<string, unknown> = {};
    const localizedData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (localizedKeys.has(k)) localizedData[k] = v;
      else baseData[k] = v;
    }
    return { title: (__title as string) ?? null, slug: (__slug as string) ?? null, baseData, localizedData };
  };

  /** Submit form RJSF -> POST (thêm mới) hoặc PUT (sửa). */
  const handleSubmit = async (data: Record<string, unknown>) => {
    if (!siteId || !selectedType) return;
    const { title, slug, baseData, localizedData } = splitFormData(data);
    const isEdit = Boolean(editingEntry);

    setSubmitting(true);
    try {
      if (editingEntry) {
        // UpdateEntryRequest: baseData/localizedData là CHUỖI JSON (không phải object).
        await api.put(`/api/entries/${editingEntry.entryId}`, {
          title,
          slug,
          baseData: JSON.stringify(baseData),
          localizedData: JSON.stringify(localizedData),
          locale: 'vi',
        });
        message.success('Cập nhật nội dung thành công');
      } else {
        await api.post('/api/entries', {
          siteId,
          contentTypeApiId: selectedType,
          title,
          slug,
          baseData,
          localizedData,
          locale: 'vi',
        });
        message.success('Tạo nội dung thành công');
        setPageIndex(1);
      }
      setDrawerOpen(false);
      setEditingEntry(null);
      await loadEntries(isEdit ? pageIndex : 1);
    } catch (err: any) {
      message.error(err?.response?.data?.error || (isEdit ? 'Cập nhật thất bại' : 'Tạo nội dung thất bại'));
    } finally {
      setSubmitting(false);
    }
  };

  /** Xóa entry sau khi người dùng xác nhận. */
  const handleDelete = async (record: FilteredEntry) => {
    try {
      await api.delete(`/api/entries/${record.entryId}`);
      message.success('Đã xóa nội dung');
      await loadEntries(pageIndex);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Xóa nội dung thất bại');
    }
  };

  const columns: ColumnsType<FilteredEntry> = [
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      key: 'title',
      render: (v: string | null) => (
        <span className="font-semibold text-slate-800">{v || '(Chưa có tiêu đề)'}</span>
      ),
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      width: 240,
      responsive: ['md'],
      render: (v: string | null) => <span className="font-mono text-xs text-slate-500">{v || '—'}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (v: string | null) => {
        const status = v || 'draft';
        return (
          <Tag color={STATUS_COLOR[status] ?? 'default'} className="rounded-md capitalize">
            {status}
          </Tag>
        );
      },
    },
    {
      title: 'Ngày xuất bản',
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      width: 180,
      responsive: ['lg'],
      render: (v: string | null) =>
        v ? <span className="text-slate-600">{dayjs(v).format('DD/MM/YYYY HH:mm')}</span> : <span className="text-slate-400">—</span>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 170,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} className="font-medium" onClick={() => openEdit(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xóa nội dung này?"
            description="Hành động này không thể hoàn tác."
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} className="font-medium">
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-800 flex items-center gap-2">
            <FileTextOutlined className="text-indigo-600" />
            Quản lý Nội dung (Entries)
          </Title>
          <Text className="text-slate-500">
            Lọc, xem, sửa và tạo mới nội dung động theo từng Content Type của site.
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!selectedType}
          onClick={openCreate}
          className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
        >
          Thêm mới
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <Space wrap size="middle" className="w-full">
          <Select
            placeholder="Chọn Content Type"
            style={{ minWidth: 260 }}
            value={selectedType}
            onChange={(v) => {
              setSelectedType(v);
              setPageIndex(1);
            }}
            options={contentTypes.map((ct) => ({ label: `${ct.displayName} (${ct.apiId})`, value: ct.apiId }))}
            showSearch
            optionFilterProp="label"
            allowClear
          />
          <Input
            placeholder="Tìm theo từ khóa..."
            prefix={<SearchOutlined className="text-slate-400" />}
            style={{ width: 300 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} className="rounded-lg">
            Tìm kiếm
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadEntries(pageIndex)} loading={loading} className="rounded-lg">
            Tải lại
          </Button>
        </Space>
      </div>

      {/* Bảng dữ liệu */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
        <Table<FilteredEntry>
          rowKey="entryId"
          columns={columns}
          dataSource={entries}
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: (
              <Empty
                description={
                  selectedType
                    ? 'Chưa có nội dung nào cho Content Type này'
                    : 'Chưa có nội dung nào'
                }
              />
            ),
          }}
          pagination={{
            current: pageIndex,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            onChange: (page) => setPageIndex(page),
            showTotal: (t) => `Tổng ${t} bản ghi`,
          }}
        />
      </div>

      {/* Drawer Thêm mới / Sửa */}
      <Drawer
        title={
          <Space>
            <span className="font-semibold">{editingEntry ? 'Sửa nội dung' : 'Thêm nội dung mới'}</span>
            {selectedType ? (
              <Tag color="blue" className="rounded-md font-mono">
                {selectedType}
              </Tag>
            ) : null}
          </Space>
        }
        width={800}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingEntry(null);
        }}
        destroyOnHidden
      >
        <Divider className="!mt-0" />
        {fieldsLoading ? (
          <div className="text-slate-400 text-sm">Đang tải cấu trúc form...</div>
        ) : (
          <DynamicFormWrapper
            key={editingEntry?.entryId ?? 'create'}
            schema={schema}
            formData={initialFormData}
            onSubmit={handleSubmit}
            submitting={submitting}
            submitLabel="Lưu dữ liệu"
            onCancel={() => {
              setDrawerOpen(false);
              setEditingEntry(null);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
